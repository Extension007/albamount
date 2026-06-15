// Конфигурация сессий
const session = require("express-session");
const RedisStore = require("connect-redis").default;
const { USE_POSTGRES } = require("./database");
const { redisClient } = require("./redis");
const { Pool } = require("pg");

const isVercel = Boolean(process.env.VERCEL);
const isProduction = process.env.NODE_ENV === 'production' || isVercel;

if (isProduction) {
  const rawSessionSecret = process.env.SESSION_SECRET;
  if (!rawSessionSecret || rawSessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters in production.');
  }
}

const hasRedis = Boolean(process.env.REDIS_HOST || process.env.REDIS_PORT);
const usePgSession = USE_POSTGRES && (process.env.NODE_ENV === 'production' || process.env.USE_PG_SESSION === 'true');

const sessionOptions = {
  secret: process.env.SESSION_SECRET || "exto-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60, // 1 час
    httpOnly: true,
    secure: isProduction, // Только HTTPS в production
    sameSite: 'lax'
  }
};

let store = null;

if (hasRedis) {
  store = new RedisStore({
    client: redisClient,
    prefix: "exto:sess:",
    ttl: 60 * 60 // 1 час в секундах
  });
  console.log("✅ Сессии хранятся в Redis");
} else if (usePgSession) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const pgSession = require("connect-pg-simple")(session);
  store = new pgSession({ pool, tableName: 'session' });
  sessionOptions.store = store;
  console.log("✅ Сессии хранятся в PostgreSQL (connect-pg-simple)");
} else if (USE_POSTGRES && process.env.DATABASE_URL) {
  console.warn("⚠️  PostgreSQL доступен, но Redis не настроен. Используется MemoryStore для сессий.");
} else {
  if (isVercel) {
    console.error("❌ В Vercel обязательно необходимо настроить Redis для хранения сессий");
    process.exit(1);
  } else {
    console.warn("⚠️  Redis не настроен. Используется MemoryStore для сессий (только для локальной разработки).");
  }
}

if (store) {
  sessionOptions.store = store;
}

module.exports = session(sessionOptions);
