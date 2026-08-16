function httpError(status, message, code = 'ERR') {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  err.code = code;
  err.expose = true;
  return err;
}

function publicErrorMessage(err, fallback) {
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (isProduction || !err || !err.message) return fallback;
  return err.message;
}

module.exports = { httpError, publicErrorMessage };
