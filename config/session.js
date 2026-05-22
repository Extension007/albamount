// Конфигурация сессий
const session = require("express-session");
const MongoStore = require("connect-mongo");
const RedisStore = require("connect-redis").default;
const { USE_POSTGRES } = require("./database");
const { redisClient } = require("./redis");

const isVercel = Boolean(process.env.VERCEL);
const isProduction = process.env.NODE_ENV === 'production' || isVercel;

if (isProduction) {
  const rawSessionSecret = process.env.SESSION_SECRET;
  if (!rawSessionSecret || rawSessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters in production.');
  }
}

// Проверяем, доступен ли Redis
const hasRedis = Boolean(process.env.REDIS_HOST || process.env.REDIS_PORT);

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

// В Vercel среде всегда используем внешнее хранилище сессий
if (hasRedis) {
  // Используем Redis для хранения сессий
  sessionOptions.store = new RedisStore({
    client: redisClient,
    prefix: "exto:sess:",
    ttl: 60 * 60 // 1 час в секундах
  });
  console.log("✅ Сессии хранятся в Redis");
} else if (USE_POSTGRES && process.env.DATABASE_URL) {
  // Резервный вариант: MongoDB для хранения сессий
  sessionOptions.store = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "sessions"
  });
  console.log("✅ Сессии хранятся в MongoDB");
} else {
  // В Vercel без внешнего хранилища сессий использовать нельзя - приложение не будет работать корректно
  if (isVercel) {
    console.error("❌ В Vercel обязательно необходимо настроить Redis или MongoDB для хранения сессий");
    process.exit(1);
  } else {
    console.warn("⚠️  Ни Redis, ни MongoDB не настроены. Используется MemoryStore для сессий (только для локальной разработки).");
  }
}

module.exports = session(sessionOptions);
