const { QueryTypes } = require("sequelize");
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
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    isRead: row.is_read === true || row.is_read === "t" || row.isRead === true,
    createdAt: row.created_at || row.createdAt
  };
}

async function saveContactMessage({ name, email, subject, message }) {
  await ensureContactMessagesTable();
  const rows = await sequelize.query(
    `INSERT INTO contact_messages (name, email, subject, message, is_read, created_at, updated_at)
     VALUES (:name, :email, :subject, :message, false, NOW(), NOW())
     RETURNING id, name, email, subject, message, is_read, created_at`,
    {
      replacements: {
        name,
        email,
        subject: subject || null,
        message
      },
      type: QueryTypes.SELECT
    }
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || !row.id) {
    throw new Error("contact_messages insert returned no id");
  }
  return row.id;
}

async function listContactMessages() {
  await ensureContactMessagesTable();
  const rows = await sequelize.query(
    `SELECT id, name, email, subject, message, is_read, created_at
     FROM contact_messages
     ORDER BY id DESC
     LIMIT 200`,
    { type: QueryTypes.SELECT }
  );
  return (rows || []).map(mapRow);
}

module.exports = { ensureContactMessagesTable, saveContactMessage, listContactMessages };
