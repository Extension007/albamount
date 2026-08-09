// Rate limiting — uses Redis when REDIS_URL is set (shared across Vercel isolates)
const rateLimit = require("express-rate-limit");

function buildOptions(extra) {
  const options = {
    standardHeaders: true,
    legacyHeaders: false,
    ...extra
  };

  try {
    const { hasRedis, redisClient } = require("../config/redis");
    if (hasRedis && redisClient && process.env.REDIS_URL) {
      // Minimal compatible store for express-rate-limit v6–v8 style increment API
      options.store = {
        async increment(key) {
          try {
            if (!redisClient.isOpen) await redisClient.connect();
            const hits = await redisClient.incr(`rl:${key}`);
            if (hits === 1) {
              const windowMs = options.windowMs || 60000;
              await redisClient.pExpire(`rl:${key}`, windowMs);
            }
            const pttl = await redisClient.pTTL(`rl:${key}`);
            return {
              totalHits: hits,
              resetTime: new Date(Date.now() + Math.max(pttl, 1))
            };
          } catch (err) {
            console.warn("rate-limit redis error:", err.message);
            return { totalHits: 1, resetTime: new Date(Date.now() + (options.windowMs || 60000)) };
          }
        },
        async decrement(key) {
          try {
            if (!redisClient.isOpen) await redisClient.connect();
            await redisClient.decr(`rl:${key}`);
          } catch (_) { /* ignore */ }
        },
        async resetKey(key) {
          try {
            if (!redisClient.isOpen) await redisClient.connect();
            await redisClient.del(`rl:${key}`);
          } catch (_) { /* ignore */ }
        }
      };
    }
  } catch (err) {
    console.warn("rate-limit store init skipped:", err.message);
  }

  return options;
}

const loginLimiter = rateLimit(buildOptions({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Слишком много попыток входа. Попробуйте позже."
}));

const apiLimiter = rateLimit(buildOptions({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: "Слишком много запросов. Попробуйте позже."
}));

const productLimiter = rateLimit(buildOptions({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Слишком много операций. Попробуйте позже."
}));

const registerLimiter = rateLimit(buildOptions({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Слишком много попыток регистрации. Попробуйте позже."
}));

const contactLimiter = rateLimit(buildOptions({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Слишком много сообщений. Попробуйте позже."
}));

module.exports = {
  loginLimiter,
  registerLimiter,
  apiLimiter,
  productLimiter,
  contactLimiter
};
