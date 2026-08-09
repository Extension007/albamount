const { assertProductionEnv } = require('../../config/production');

describe('assertProductionEnv', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  test('passes in development without prod secrets', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VERCEL;
    const result = assertProductionEnv();
    expect(result.ok).toBe(true);
  });

  test('fails production without REDIS and secrets', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.VERCEL;
    delete process.env.REDIS_URL;
    delete process.env.ALLOW_INMEMORY_RATE_LIMIT;
    process.env.JWT_SECRET = 'short';
    process.env.SESSION_SECRET = 'short';
    delete process.env.DATABASE_URL;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    const result = assertProductionEnv();
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(2);
  });

  test('passes production with full env', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://u:p@h/db';
    process.env.JWT_SECRET = 'x'.repeat(32);
    process.env.SESSION_SECRET = 'y'.repeat(32);
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.CLOUDINARY_CLOUD_NAME = 'c';
    process.env.CLOUDINARY_API_KEY = 'k';
    process.env.CLOUDINARY_API_SECRET = 's';
    const result = assertProductionEnv();
    expect(result.ok).toBe(true);
  });
});
