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

const memoryStore = new Map();

async function redisIncrement(key, windowMs) {
  const { hasRedis, redisClient } = require('../config/redis');
  if (!(hasRedis && redisClient && process.env.REDIS_URL)) return null;
  if (!redisClient.isOpen) await redisClient.connect();
  const hits = await redisClient.incr(`guest-rl:${key}`);
  if (hits === 1) await redisClient.pExpire(`guest-rl:${key}`, windowMs);
  return hits;
}

function guestRateLimit({ windowMs = 60000, max = 20 } = {}) {
  return async function (req, res, next) {
    const key = `g:${req.guestId || 'none'}:ip:${req.ip || 'unknown'}`;
    try {
      let count;
      const redisHits = await redisIncrement(key, windowMs);
      if (redisHits != null) {
        count = redisHits;
      } else {
        // Fallback to per-process memory (weaker on serverless, but keeps site up)
        const now = Date.now();
        const cur = memoryStore.get(key);
        if (!cur || cur.resetAt <= now) {
          memoryStore.set(key, { resetAt: now + windowMs, count: 1 });
          return next();
        }
        cur.count += 1;
        memoryStore.set(key, cur);
        count = cur.count;
      }

      if (count > max) {
        const wantsJson =
          (req.headers.accept || '').includes('application/json') ||
          (req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest' ||
          req.path.startsWith('/api/');
        if (wantsJson) return res.status(429).json({ success: false, message: 'Rate limit exceeded (guest)' });
        return res.status(429).send('Rate limit exceeded');
      }
      return next();
    } catch (err) {
      console.error('guest rate-limit error:', err.message);
      // Prefer availability over hard fail when store is flaky
      return next();
    }
  };
}

/** Placeholder until a real captcha provider is wired. */
function captchaHook(req, res, next) { next(); }

module.exports = { ensureGuestId, guestRateLimit, captchaHook };
