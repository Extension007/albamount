const express = require("express");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const pgSession = require("connect-pg-simple")(session);
const morgan = require("morgan");
const { createSecurityMiddleware } = require("./security");
const { sessionOptions } = require("./session");

const app = express();
const isVercel = Boolean(process.env.VERCEL);
const isProduction = process.env.NODE_ENV === "production";

app.set("trust proxy", isVercel ? 1 : false);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

const { formatPriceDisplay } = require("../utils/price");
app.locals.formatPriceDisplay = formatPriceDisplay;

app.use(express.urlencoded({ extended: true, limit: "512kb" }));
app.use(express.json({ limit: "512kb" }));

const USE_POSTGRES = Boolean(process.env.DATABASE_URL);

if (USE_POSTGRES) {
  const { isDbConnected, refreshDbConnection } = require("./database");
  app.use(async (req, res, next) => {
    if (!isDbConnected()) {
      await refreshDbConnection();
    }
    req.dbConnected = isDbConnected();
    next();
  });
}

app.use(createSecurityMiddleware());
app.use(morgan(isProduction ? "combined" : "dev"));

const { sanitizeHtmlInput } = require("../middleware/security");
app.use(sanitizeHtmlInput);

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
    const conObject = ssl
      ? {
          ssl: {
            rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
          },
          connectionTimeoutMillis: 2000
        }
      : { connectionTimeoutMillis: 2000 };

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

app.use(cookieParser(process.env.SESSION_SECRET || "exto-secret-change-in-production"));

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
const { csrfCookieOptions } = require("../middleware/csrf");
const csrfProtection = csrf({ cookie: csrfCookieOptions() });
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

  function hostKey(value) {
    if (!value) return "";
    try {
      return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function isAllowed(value) {
    if (!value) return false;
    try {
      const originOnly = new URL(value).origin;
      if (allowedOrigins.has(originOnly)) return true;
    } catch (e) {
      return false;
    }
    const reqHost = String(req.get("host") || "").replace(/^www\./i, "").split(":")[0].toLowerCase();
    const valueHost = hostKey(value);
    return Boolean(reqHost && valueHost && reqHost === valueHost);
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

  const wantsJson = String(req.get("accept") || "").includes("application/json");
  if (wantsJson) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
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

const normalizeRender = require("../middleware/normalizeRender");
app.use(normalizeRender);

app.use(express.static(path.join(__dirname, "../public")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

module.exports = {
  app,
  CATEGORY_LABELS,
  CATEGORY_KEYS,
  HIERARCHICAL_CATEGORIES
};
