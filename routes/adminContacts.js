const express = require("express");
const router = express.Router();
const ContactMessage = require("../models/ContactMessage");
const { USE_POSTGRES } = require("../config/database");
const { requireAdmin } = require("../middleware/auth");
const { csrfToken, csrfProtection } = require("../middleware/csrf");
const { listContactMessages } = require("../services/contactMessageService");

router.get("/", requireAdmin, csrfToken, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).send("Админка недоступна: отсутствует подключение к БД");

    const messages = await listContactMessages();
    const unreadCount = messages.filter((m) => !m.isRead).length;

    const Statistics = require("../models/Statistics");
    const User = require("../models/User");
    const [visitors, users] = await Promise.all([
      Statistics.findOne({ where: { key: "visitors" } }),
      User.count()
    ]);

    res.render("admin-contacts", {
      messages: messages || [],
      unreadCount,
      visitorCount: visitors ? visitors.value : 0,
      userCount: users || 0,
      csrfToken: res.locals.csrfToken || (req.csrfToken ? req.csrfToken() : "")
    });
  } catch (err) {
    console.error("Ошибка получения сообщений (админ):", err);
    res.status(500).send("Ошибка базы данных");
  }
});

router.post("/messages/:id/read", requireAdmin, csrfProtection, async (req, res) => {
  try {
    const row = await ContactMessage.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Сообщение не найдено" });
    row.isRead = true;
    await row.save();
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.json({ success: true });
    return res.redirect("/admin/contacts");
  } catch (err) {
    console.error("Ошибка прочтения сообщения:", err);
    return res.status(500).json({ success: false, message: "Ошибка" });
  }
});

router.post("/messages/:id/delete", requireAdmin, csrfProtection, async (req, res) => {
  try {
    const row = await ContactMessage.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Сообщение не найдено" });
    await row.destroy();
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.json({ success: true });
    return res.redirect("/admin/contacts");
  } catch (err) {
    console.error("Ошибка удаления сообщения:", err);
    return res.status(500).json({ success: false, message: "Ошибка" });
  }
});

module.exports = router;
