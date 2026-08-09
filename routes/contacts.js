const express = require("express");
const router = express.Router();

const contactController = require("../controllers/contactController");
const { requireAdmin } = require("../middleware/auth");
const { contactLimiter } = require("../middleware/rateLimiter");

// Страница контактов
router.get("/", contactController.getContacts);

// Отправка сообщения из формы контактов (доступно всем)
router.post("/send-message", contactLimiter, contactController.sendContactMessage);

// CRUD операции для контактов (только для администраторов)
router.post("/create", requireAdmin, contactController.createContact);
router.post("/:id/update", requireAdmin, contactController.updateContact);
router.post("/:id/delete", requireAdmin, contactController.deleteContact);

module.exports = router;
