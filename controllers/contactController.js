const ContactInfo = require("../models/ContactInfo");
const { notifyAdmin, resolveAdminEmail } = require("../services/adminNotificationService");
const { transporter } = require("../services/emailService");
const emailConfig = require("../config/email");

exports.getContacts = async (req, res) => {
  try {
    let contacts = [];
    try {
      contacts = await ContactInfo.findAll({ order: [["type", "ASC"]] });
    } catch (dbErr) {
      // Если таблица не существует, используем пустой массив
      console.warn('⚠️ ContactInfo table not available, using empty contacts:', dbErr.message);
      contacts = [];
    }

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
      contacts
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
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Имя, email и сообщение обязательны"
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Неверный формат email" });
    }

    const adminContact = await ContactInfo.findOne({ where: { type: "admin" } });
    const adminEmail = resolveAdminEmail(adminContact?.email);
    const emailSubject = subject ? `[Albamount] ${subject}` : "[Albamount] Сообщение с сайта";

    const emailText = `
Новое сообщение с формы контактов

От: ${name} <${email}>
Тема: ${subject || "Без темы"}
Дата: ${new Date().toLocaleString("ru-RU")}

${message}
    `.trim();

    if (emailConfig.enabled) {
      await transporter.sendMail({
        from: emailConfig.from,
        to: adminEmail,
        subject: emailSubject,
        text: emailText,
        replyTo: email
      });
    }

    res.json({ success: true, message: "Сообщение отправлено" });
  } catch (err) {
    console.error("Ошибка отправки сообщения:", err);
    res.status(500).json({ success: false, message: "Ошибка отправки сообщения" });
  }
};
