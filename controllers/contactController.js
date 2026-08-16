const ContactInfo = require("../models/ContactInfo");
const { notifyAdmin, resolveAdminEmail } = require("../services/adminNotificationService");
const { transporter } = require("../services/emailService");
const emailConfig = require("../config/email");
const { sanitizeText } = require("../utils/sanitize");
const { ensureContactMessagesTable, saveContactMessage } = require("../services/contactMessageService");

const SUBJECT_LABELS = {
  general: "Общие вопросы",
  partnership: "Сотрудничество",
  technical: "Техническая поддержка",
  business: "Коммерческие предложения",
  other: "Другое"
};

exports.getContacts = async (req, res) => {
  try {
    await ensureContactMessagesTable().catch(() => {});
    res.render("contacts", {
      products: [],
      services: [],
      banners: [],
      visitorCount: 0,
      userCount: 0,
      page: 1,
      totalPages: 1,
      isAuth: Boolean(req.user),
      isAdmin: req.user?.role === "admin",
      isUser: req.user?.role === "user",
      userRole: req.user?.role || null,
      user: req.user,
      votedMap: {},
      categories: {},
      selectedCategory: "all",
      csrfToken: req.csrfToken ? req.csrfToken() : "",
      activeTab: "contacts",
      sent: req.query.sent === "1",
      sendError: req.query.error === "1"
    });
  } catch (err) {
    console.error("Ошибка получения контактов:", err);
    res.status(500).send("Временная ошибка сервера");
  }
};

exports.createContact = async (req, res) => {
  try {
    const { type, email, phone, description } = req.body;

    if (!type || !email) {
      return res.status(400).json({ success: false, message: "Тип и email обязательны" });
    }

    if (!["admin", "founder", "service"].includes(type)) {
      return res.status(400).json({ success: false, message: "Недопустимый тип контакта" });
    }

    const contact = await ContactInfo.create({
      type,
      email,
      phone: phone || null,
      description: description || null
    });

    try {
      await notifyAdmin("Создание контактной информации", "Новая контактная запись.", {
        Тип: contact.type,
        Email: contact.email
      });
    } catch (notificationError) {
      console.error("Ошибка уведомления:", notificationError);
    }

    res.status(201).json({ success: true, message: "Контакт создан", contact });
  } catch (err) {
    console.error("Ошибка создания контакта:", err);
    res.status(500).json({ success: false, message: "Ошибка создания контакта" });
  }
};

exports.updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, email, phone, description } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "ID контакта обязателен" });
    }

    if (type && !["admin", "founder", "service"].includes(type)) {
      return res.status(400).json({ success: false, message: "Недопустимый тип контакта" });
    }

    const contact = await ContactInfo.findByPk(id);
    if (!contact) {
      return res.status(404).json({ success: false, message: "Контакт не найден" });
    }

    if (type) contact.type = type;
    if (email) contact.email = email;
    if (phone !== undefined) contact.phone = phone;
    if (description !== undefined) contact.description = description;
    await contact.save();

    res.json({ success: true, message: "Контакт обновлен", contact });
  } catch (err) {
    console.error("Ошибка обновления контакта:", err);
    res.status(500).json({ success: false, message: "Ошибка обновления контакта" });
  }
};

exports.deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "ID контакта обязателен" });
    }

    const contact = await ContactInfo.findByPk(id);
    if (!contact) {
      return res.status(404).json({ success: false, message: "Контакт не найден" });
    }

    await contact.destroy();
    res.json({ success: true, message: "Контакт удален" });
  } catch (err) {
    console.error("Ошибка удаления контакта:", err);
    res.status(500).json({ success: false, message: "Ошибка удаления контакта" });
  }
};

exports.sendContactMessage = async (req, res) => {
  try {
    const name = sanitizeText(req.body.name, 120);
    const email = sanitizeText(req.body.email, 255).toLowerCase();
    const subjectKey = sanitizeText(req.body.subject, 40);
    const message = sanitizeText(req.body.message, 4000);

    if (!name || !email || !message) {
      const wantsJson = String(req.get("accept") || "").includes("application/json");
      if (wantsJson) {
        return res.status(400).json({
          success: false,
          message: "Имя, email и сообщение обязательны"
        });
      }
      return res.redirect("/contacts?error=1");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const wantsJson = String(req.get("accept") || "").includes("application/json");
      if (wantsJson) {
        return res.status(400).json({ success: false, message: "Неверный формат email" });
      }
      return res.redirect("/contacts?error=1");
    }

    const subjectLabel = SUBJECT_LABELS[subjectKey] || subjectKey || "Без темы";

    const savedId = await saveContactMessage({
      name,
      email,
      subject: subjectLabel,
      message
    });
    console.log("contact_message_saved", { id: savedId, email, subject: subjectLabel });

    try {
      await notifyAdmin("Сообщение с формы контактов", "Новое обращение с сайта.", {
        От: name,
        Email: email,
        Тема: subjectLabel
      });
    } catch (notificationError) {
      console.error("Ошибка уведомления:", notificationError);
    }

    if (emailConfig.enabled) {
      try {
        const adminContact = await ContactInfo.findOne({ where: { type: "admin" } });
        const adminEmail = resolveAdminEmail(adminContact?.email);
        await transporter.sendMail({
          from: emailConfig.from,
          to: adminEmail,
          subject: `[Albamount] ${subjectLabel}`,
          text: `От: ${name} <${email}>\nТема: ${subjectLabel}\n\n${message}`,
          replyTo: email
        });
      } catch (mailErr) {
        console.error("Ошибка email по контакту:", mailErr.message);
      }
    }

    const wantsJson = String(req.get("accept") || "").includes("application/json");
    if (wantsJson) {
      return res.json({ success: true, message: "Сообщение отправлено", id: savedId });
    }
    return res.redirect("/contacts?sent=1");
  } catch (err) {
    console.error("Ошибка отправки сообщения:", err);
    const wantsJson = String(req.get("accept") || "").includes("application/json");
    if (wantsJson) {
      return res.status(500).json({ success: false, message: "Ошибка отправки сообщения" });
    }
    return res.redirect("/contacts?error=1");
  }
};
