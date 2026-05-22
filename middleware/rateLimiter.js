// Rate limiting middleware
const rateLimit = require("express-rate-limit");

// Rate limiter для логина (защита от bruteforce)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // максимум 5 попыток с одного IP
  message: "Слишком много попыток входа. Попробуйте позже.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter для API (рейтинг, Instagram oEmbed)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 минута
  max: 30, // максимум 30 запросов в минуту
  message: "Слишком много запросов. Попробуйте позже.",
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter для создания/редактирования товаров
const productLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // максимум 10 операций в 15 минут
  message: "Слишком много операций. Попробуйте позже.",
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  loginLimiter,
  apiLimiter,
  productLimiter
};






