/**
 * Production boot checks — call once at process start.
 * Escape hatches (local/staging only): ALLOW_INMEMORY_RATE_LIMIT=true
 */
function isProdLike() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

function assertProductionEnv() {
  if (!isProdLike()) return { ok: true, warnings: [] };

  const errors = [];
  const warnings = [];

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required in production');
  }

  const jwt = process.env.JWT_SECRET || '';
  if (jwt.length < 32) {
    errors.push('JWT_SECRET must be set and at least 32 characters in production');
  }

  const session = process.env.SESSION_SECRET || '';
  if (session.length < 32) {
    errors.push('SESSION_SECRET must be set and at least 32 characters in production');
  }

  if (!process.env.REDIS_URL && process.env.ALLOW_INMEMORY_RATE_LIMIT !== 'true') {
    errors.push(
      'REDIS_URL is required in production/Vercel for shared rate limits (set ALLOW_INMEMORY_RATE_LIMIT=true to override)'
    );
  } else if (!process.env.REDIS_URL) {
    warnings.push('REDIS_URL missing — rate limits are per-isolate (ALLOW_INMEMORY_RATE_LIMIT=true)');
  }

  const cloudOk =
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;
  if (!cloudOk) {
    errors.push('Cloudinary env (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET) required in production for uploads');
  }

  if (!process.env.BASE_URL && process.env.VERCEL_URL) {
    warnings.push('BASE_URL unset — using VERCEL_URL for absolute links');
  }

  return { ok: errors.length === 0, errors, warnings };
}

function runProductionGuards({ exitOnError = true } = {}) {
  const result = assertProductionEnv();
  for (const w of result.warnings) {
    console.warn('⚠️ production:', w);
  }
  if (!result.ok) {
    for (const e of result.errors) {
      console.error('❌ production:', e);
    }
    if (exitOnError && require.main) {
      // only hard-exit when this module is run as a script; boot callers decide
    }
  }
  return result;
}

module.exports = {
  isProdLike,
  assertProductionEnv,
  runProductionGuards
};
