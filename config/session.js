// Конфигурация сессий
const isVercel = Boolean(process.env.VERCEL);
const isProduction = process.env.NODE_ENV === 'production' || isVercel;

if (isProduction) {
  const rawSessionSecret = process.env.SESSION_SECRET;
  if (!rawSessionSecret || rawSessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters in production.');
  }
}

const sessionOptions = {
  secret: process.env.SESSION_SECRET || "exto-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax'
  }
};

module.exports = { sessionOptions };
