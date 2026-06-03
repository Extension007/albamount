const express = require("express");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const pgSession = require("connect-pg-simple")(session);
const morgan = require("morgan");
const { createSecurityMiddleware } = require("./security");

const app = express();
const isVercel = Boolean(process.env.VERCEL);
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || "exto-secret-dev-only";

if (isProduction) {
  const rawSessionSecret = process.env.SESSION_SECRET;
  if (!rawSessionSecret || rawSessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters in production.");
  }
}

app.set("trust proxy", isVercel ? 1 : false);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const USE_POSTGRES = Boolean(process.env.DATABASE_URL);

if (USE_POSTGRES) {
  const { sequelize } = require("./database");
  app.use(async (req, res, next) => {
    try {
      await sequelize.authenticate();
      req.dbConnected = true;
      next();
    } catch (err) {
      console.error("❌ Ошибка подключения к PostgreSQL:", err.message);
      req.dbConnected = false;
      next();
    }
  });
}

app.use(createSecurityMiddleware());
app.use(morgan(isProduction ? "combined" : "dev"));

const { CATEGORY_LABELS, CATEGORY_KEYS, HIERARCHICAL_CATEGORIES } = require("./categories");

function buildSessionStore() {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }

  const ssl =
    process.env.DATABASE_SSL === "true" ||
    process.env.DATABASE_URL.includes("sslmode=require") ||
    process.env.DATABASE_URL.includes("neon.tech");

  try {
    // Try to create a PostgreSQL-backed session store. If the DB is unreachable
    // we catch the error and fall back to the default in-memory store to keep
    // the app running (better than crashing with ECONNREFUSED).
    // Use conservative options: do not try to auto-create the sessions table
    // (createTableIfMissing: false) and set a short connection timeout so
    // failures are fast and won't surface as unhandled AggregateError.
    const conObject = ssl ? { ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 2000 } : { connectionTimeoutMillis: 2000 };

    const store = new pgSession({
      conString: process.env.DATABASE_URL,
      conObject,
      tableName: "sessions",
      createTableIfMissing: false
    });

    return store;
  } catch (err) {
    console.error("⚠️ Не удалось создать PostgreSQL session store, используем MemoryStore:", err && err.message ? err.message : err);
    return undefined;
  }
}

const sessionOptions = {
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax"
  }
};

let _sessionStore = null;
// Only attempt PostgreSQL session store in non-Vercel environments when explicitly enabled for development
const usePgSession = !isVercel && USE_POSTGRES && (process.env.NODE_ENV === 'production' || process.env.USE_PG_SESSION === 'true');
if (usePgSession) {
  _sessionStore = buildSessionStore();
  if (_sessionStore) {
    sessionOptions.store = _sessionStore;
  } else {
    console.warn("⚠️ PostgreSQL session store недоступен, используем in-memory сессии (не сохраняются между рестартами)");
  }
} else if (!isVercel && USE_POSTGRES) {
  // In development without explicit opt-in, warn and fallback to memory store
  console.info("ℹ️ В режиме разработки используем in-memory сессии. Чтобы использовать PostgreSQL для сессий, установите USE_PG_SESSION=true");
}

app.use(cookieParser());

if (!isVercel && USE_POSTGRES) {
  app.use(session(sessionOptions));
  if (_sessionStore) {
    console.log("✅ Сессии PostgreSQL включены");
  } else {
    console.log("✅ Сессии (MemoryStore) включены — PostgreSQL недоступна");
  }
} else if (isVercel) {
  console.log("INFO: Vercel — авторизация через JWT cookie (exto_token)");
}

const csrf = require("csurf");
const csrfProtection = csrf({ cookie: true });
app.use(csrfProtection);

const { csrfToken } = require("../middleware/csrf");
app.use(csrfToken);

const csrfSafeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
app.use((req, res, next) => {
  if (!isProduction) {
    return next();
  }
  if (csrfSafeMethods.has(req.method)) {
    return next();
  }

  const baseUrl = process.env.BASE_URL;

  // Build a set of allowed origins (support canonical BASE_URL and www/non-www variants)
  const allowedOrigins = new Set();
  // Always allow the current host origin
  allowedOrigins.add(`${req.protocol}://${req.get("host")}`);

  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl).origin;
      allowedOrigins.add(parsed);

      // Add both www and non-www variants when applicable
      if (parsed.includes('://www.')) {
        allowedOrigins.add(parsed.replace('://www.', '://'));
      } else {
        // insert www variant
        const withWww = parsed.replace('://', '://www.');
        allowedOrigins.add(withWww);
      }
    } catch (error) {
      console.warn("BASE_URL is invalid, falling back to request origin.");
    }
  }

  const origin = req.get("origin");
  const referer = req.get("referer");

  function isAllowed(value) {
    if (!value) return false;
    try {
      const originOnly = new URL(value).origin;
      return allowedOrigins.has(originOnly);
    } catch (e) {
      return false;
    }
  }

  if (origin && isAllowed(origin)) {
    return next();
  }
  if (!origin && referer && isAllowed(referer)) {
    return next();
  }

  // If origin is absent/null and referer is absent, allow when a valid CSRF token was provided.
  // The csurf middleware runs earlier; if the CSRF token was invalid the request would have been rejected already.
  const hasCsrfToken = Boolean(
    req.get('x-csrf-token') || req.get('x-xsrf-token') || req.get('x-xsrf') || (req.body && req.body._csrf)
  );

  if ((!origin || origin === 'null') && !referer && hasCsrfToken) {
    return next();
  }

  // Log mismatch to help debugging on Vercel
  console.warn('Origin/referer mismatch', {
    origin,
    referer,
    host: req.get('host'),
    allowedOrigins: Array.from(allowedOrigins)
  });

  return res.status(403).send("Forbidden");
});

app.use(async (req, res, next) => {
  try {
    const { getUserFromRequestAsync } = require("../middleware/auth");
    const user = await getUserFromRequestAsync(req);

    res.locals.user = user;
    req.user = user;
    res.locals.socket_io_available = !isVercel;

    next();
  } catch (err) {
    next(err);
  }
});

app.use(express.static(path.join(__dirname, "../public")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/utils", express.static(path.join(__dirname, "../utils")));

module.exports = {
  app,
  CATEGORY_LABELS,
  CATEGORY_KEYS,
  HIERARCHICAL_CATEGORIES
};
