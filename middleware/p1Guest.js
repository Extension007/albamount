const crypto = require('crypto');

function ensureGuestId(req, res, next) {
  let gid = req.cookies?.guestId;
  if (!gid || typeof gid !== 'string' || gid.length < 16) {
    gid = crypto.randomBytes(18).toString('hex');
    res.cookie('guestId', gid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
    });
  }
  req.guestId = gid;
  next();
}

function guestRateLimit({ windowMs = 60000, max = 20 } = {}) {
  const store = new Map();
  return function (req, res, next) {
    const key = `g:${req.guestId || 'none'}:ip:${req.ip || 'unknown'}`;
    const now = Date.now();
    const cur = store.get(key);
    if (!cur || cur.resetAt <= now) {
      store.set(key, { resetAt: now + windowMs, count: 1 });
      return next();
    }
    cur.count += 1;
    store.set(key, cur);
    if (cur.count > max) {
      const wantsJson =
        (req.headers.accept || '').includes('application/json') ||
        (req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest' ||
        req.path.startsWith('/api/');
      if (wantsJson) return res.status(429).json({ success: false, message: 'Rate limit exceeded (guest)' });
      return res.status(429).send('Rate limit exceeded');
    }
    next();
  };
}

function captchaHook(req, res, next) { next(); }

module.exports = { ensureGuestId, guestRateLimit, captchaHook };
