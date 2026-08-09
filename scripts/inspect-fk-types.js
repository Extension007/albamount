require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  await c.connect();
  const tables = ['codes', 'entitlements', 'banners', 'products', 'services', 'alba_transactions', 'video_posts', 'comments'];
  for (const t of tables) {
    const r = await c.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = $1
       AND column_name IN ('id','card_id','activation_code_id','related_transaction_id','voters','owner_id','user_id')
       ORDER BY ordinal_position`,
      [t]
    );
    console.log('\n==', t);
    for (const row of r.rows) console.log(row.column_name, row.data_type);
  }
  const votes = await c.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name ILIKE '%vote%'`
  );
  console.log('\nvote tables', votes.rows);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
