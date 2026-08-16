const { sequelize } = require("../config/database");

async function ensureContactMessagesTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL,
      subject VARCHAR(200),
      message TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS idx_contact_messages_is_read ON contact_messages(is_read)`
  ).catch(() => {});
}

module.exports = { ensureContactMessagesTable };
