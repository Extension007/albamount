/**
 * Fail if production env is incomplete. Run: npm run check:prod
 */
require('dotenv').config();
const { assertProductionEnv, isProdLike } = require('../config/production');

// Force prod-like checks even in local when CHECK_AS_PROD=true
if (process.env.CHECK_AS_PROD === 'true') {
  process.env.NODE_ENV = 'production';
}

const result = assertProductionEnv();
if (!isProdLike() && process.env.CHECK_AS_PROD !== 'true') {
  console.log('ℹ️ Not production-like env — set CHECK_AS_PROD=true to validate prod requirements.');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (!result.ok) {
  console.error('Production env check FAILED');
  result.errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}

console.log('✅ Production env check passed');
result.warnings.forEach((w) => console.warn(' -', w));
process.exit(0);
