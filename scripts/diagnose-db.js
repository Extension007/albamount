/**
 * Postgres connectivity check (replaces legacy Mongo diagnose scripts).
 */
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const ssl =
    process.env.DATABASE_SSL === 'true' ||
    url.includes('sslmode=require') ||
    url.includes('neon.tech');

  const client = new Client({
    connectionString: url,
    ssl: ssl ? { rejectUnauthorized: false } : false
  });

  await client.connect();
  const now = await client.query('SELECT NOW() AS now');
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  );
  const users = await client.query('SELECT COUNT(*)::int AS c FROM users');

  console.log('✅ PostgreSQL connected');
  console.log('time:', now.rows[0].now);
  console.log('users:', users.rows[0].c);
  console.log('tables:', tables.rows.map((r) => r.table_name).join(', '));
  await client.end();
}

main().catch((err) => {
  console.error('❌ diagnose failed:', err.message);
  process.exit(1);
});
