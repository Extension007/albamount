require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
  const ssl =
    process.env.DATABASE_SSL === 'true' ||
    (process.env.DATABASE_URL || '').includes('sslmode=require') ||
    (process.env.DATABASE_URL || '').includes('neon.tech');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: ssl ? { rejectUnauthorized: false } : false
  });

  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        target_type VARCHAR(20) NOT NULL,
        target_id INTEGER NOT NULL,
        user_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE,
        guest_key VARCHAR(64) NULL,
        vote VARCHAR(10) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT votes_vote_check CHECK (vote IN ('up', 'down')),
        CONSTRAINT votes_target_type_check CHECK (target_type IN ('product', 'service', 'banner', 'video')),
        CONSTRAINT votes_voter_present CHECK (user_id IS NOT NULL OR guest_key IS NOT NULL)
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS votes_target_idx ON votes (target_type, target_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS votes_user_idx ON votes (user_id)`);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS votes_user_unique
      ON votes (target_type, target_id, user_id)
      WHERE user_id IS NOT NULL
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS votes_guest_unique
      ON votes (target_type, target_id, guest_key)
      WHERE guest_key IS NOT NULL
    `);

    console.log('✅ votes table migrated');
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error('❌ votes migration failed:', err);
  process.exit(1);
});
