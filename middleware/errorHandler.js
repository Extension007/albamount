const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (status >= 500) {
    logger.error({ msg: 'unhandled_error', error: err.message, stack: err.stack });
  }

  const wantsJson =
    req.xhr ||
    req.get('accept')?.includes('application/json') ||
    req.path.startsWith('/api');

  if (wantsJson) {
    return res.status(status).json({
      success: false,
      message: isProduction && status >= 500 ? 'Внутренняя ошибка сервера' : (err.message || 'Ошибка сервера')
    });
  }

  return res.status(status).send(isProduction && status >= 500 ? 'Внутренняя ошибка сервера' : (err.message || 'Ошибка сервера'));
};
