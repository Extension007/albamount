const { sequelize } = require("../config/database");
const ContactMessage = require("../models/ContactMessage");

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

async function saveContactMessage({ name, email, subject, message }) {
  await ensureContactMessagesTable();
  const created = await ContactMessage.create({
    name,
    email,
    subject: subject || null,
    message,
    isRead: false
  });
  return created.id;
}

async function listContactMessages() {
  await ensureContactMessagesTable();
  return ContactMessage.findAll({ order: [["id", "DESC"]] });
}

module.exports = { ensureContactMessagesTable, saveContactMessage, listContactMessages };
