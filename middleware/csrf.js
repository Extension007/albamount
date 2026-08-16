const csrf = require('csurf');

function csrfCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/'
  };
}

const csrfProtection = csrf({ cookie: csrfCookieOptions() });

function csrfToken(req, res, next) {
  if (typeof req.csrfToken === 'function') {
    res.locals.csrfToken = req.csrfToken();
  } else {
    res.locals.csrfToken = '';
  }
  next();
}

module.exports = { csrfToken, csrfProtection, csrfCookieOptions };
