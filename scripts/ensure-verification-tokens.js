require('dotenv').config();
const { sequelize, testConnection } = require('../config/database');
const { ensureVerificationTokensTable } = require('../services/emailVerificationService');

(async () => {
  await testConnection();
  await ensureVerificationTokensTable();
  const [rows] = await sequelize.query(
    "SELECT to_regclass('public.verification_tokens') AS table_name"
  );
  console.log('verification_tokens:', rows[0]);
  await sequelize.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
