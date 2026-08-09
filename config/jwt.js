// Конфигурация JWT
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Секретный ключ для подписи JWT токенов
const JWT_SECRET = process.env.JWT_SECRET || 'exto-jwt-secret-change-in-production';
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

if (isProduction) {
  const rawSecret = process.env.JWT_SECRET;
  if (!rawSecret || rawSecret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters in production.');
  }
}

// Время жизни токена (по умолчанию 24 часа)
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Создание JWT токена
 * @param {Object} payload - данные для включения в токен
 * @param {string} expiresIn - время жизни токена
 * @returns {string} - подписанный JWT токен
 */
const generateToken = (payload, expiresIn = JWT_EXPIRES_IN) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

/**
 * Проверка и декодирование JWT токена
 * @param {string} token - JWT токен для проверки
 * @returns {Object|null} - декодированные данные токена или null в случае ошибки
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    logger.warn({
      msg: 'jwt.verify_failed',
      error: error.message,
      name: error.name
    });
    return null;
  }
};

module.exports = {
 JWT_SECRET,
  JWT_EXPIRES_IN,
  generateToken,
  verifyToken
};
