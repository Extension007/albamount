// Роуты для управления контактами в админ-панели
const express = require("express");
const router = express.Router();
const ContactInfo = require("../models/ContactInfo");
const { USE_POSTGRES } = require("../config/database");
const { requireAdmin } = require("../middleware/auth");
const { csrfToken, csrfProtection } = require("../middleware/csrf");
const { notifyAdmin } = require("../services/adminNotificationService");

// CSRF token middleware
const conditionalCsrfToken = csrfToken;

// Страница управления контактами (только для админов)
router.get("/", requireAdmin, conditionalCsrfToken, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).send("Админка недоступна: отсутствует подключение к БД");

    // Получаем все контакты
    const contacts = await ContactInfo.findAll({ order: [['type', 'ASC'], ['updatedAt', 'DESC']] });

    // Получаем статистику для отображения в шапке
    const Statistics = require("../models/Statistics");
    const User = require("../models/User");
    const [visitors, users] = await Promise.all([
      Statistics.findOne({ where: { key: "visitors" } }),
      User.count()
    ]);

    const visitorCount = visitors ? visitors.value : 0;
    const userCount = users || 0;

    // Генерируем CSRF токен для формы и API запросов
    const csrfTokenValue = res.locals.csrfToken || (req.csrfToken ? req.csrfToken() : '');

    res.render("admin-contacts", {
      contacts: contacts || [],
      visitorCount,
      userCount,
      csrfToken: csrfTokenValue
    });
  } catch (err) {
    console.error("❌ Ошибка получения контактов (админ):", err);
    res.status(500).send("Ошибка базы данных");
  }
});

// Добавление контакта (админом)
router.post("/create", requireAdmin, csrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });

    const { type, email, phone, description } = req.body;

    // Валидация обязательных полей
    if (!type || !email) {
      return res.status(400).json({ 
        success: false, 
        message: "Тип и email обязательны для заполнения" 
      });
    }

    // Проверка на допустимый тип
    if (!["admin", "founder", "service"].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: "Недопустимый тип контакта" 
      });
    }

    // Создание нового контакта
    const contact = new ContactInfo({
      type,
      email,
      phone: phone || undefined,
      description: description || undefined
    });

    await contact.save();

    // Отправляем уведомление администратору о создании контакта
    try {
      await notifyAdmin(
        'Создание контактной информации',
        `Администратор создал новую контактную информацию.`,
        {
          'Тип': contact.type,
          'Email': contact.email,
          'Телефон': contact.phone || 'Не указан',
          'Описание': contact.description || 'Не указано',
          'Дата создания': new Date().toLocaleString('ru-RU'),
          'Создано администратором': req.user?.username || 'Неизвестно'
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    res.status(201).json({ 
      success: true, 
      message: "Контакт успешно создан", 
      contact 
    });
  } catch (err) {
    console.error("❌ Ошибка создания контакта:", err);
    res.status(500).json({ 
      success: false, 
      message: "Ошибка создания контакта: " + err.message 
    });
  }
});

// Обновление контакта (админом)
router.post("/:id/update", requireAdmin, csrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });

    const { id } = req.params;
    const { type, email, phone, description } = req.body;

    // Валидация ID
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: "ID контакта обязателен" 
      });
    }

    // Валидация типа, если он предоставлен
    if (type && !["admin", "founder", "service"].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: "Недопустимый тип контакта" 
      });
    }

    // Обновление контакта
    const updateData = {};
    if (type) updateData.type = type;
    if (email) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (description !== undefined) updateData.description = description;
    
    updateData.updatedAt = Date.now(); // Обновляем время последнего изменения

     await ContactInfo.update(updateData, { where: { id } });
     const contact = await ContactInfo.findByPk(id);

    if (!contact) {
      return res.status(404).json({ 
        success: false, 
        message: "Контакт не найден" 
      });
    }

     // Отправляем уведомление администратору об обновлении контакта
     try {
       await notifyAdmin(
         'Обновление контактной информации',
         `Администратор обновил контактную информацию.`,
         {
           'ID контакта': contact.id.toString(),
          'Тип': contact.type,
          'Email': contact.email,
          'Телефон': contact.phone || 'Не указан',
          'Описание': contact.description || 'Не указано',
          'Дата обновления': new Date().toLocaleString('ru-RU'),
          'Обновлено администратором': req.user?.username || 'Неизвестно'
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    res.json({ 
      success: true, 
      message: "Контакт успешно обновлен", 
      contact 
    });
  } catch (err) {
    console.error("❌ Ошибка обновления контакта:", err);
    res.status(500).json({ 
      success: false, 
      message: "Ошибка обновления контакта: " + err.message 
    });
  }
});

// Удаление контакта (админом)
router.post("/:id/delete", requireAdmin, csrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });

    const { id } = req.params;

    // Валидация ID
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: "ID контакта обязателен" 
      });
    }

     const contact = await ContactInfo.findByPk(id);

    if (!contact) {
      return res.status(404).json({ 
        success: false, 
        message: "Контакт не найден" 
      });
    }

     await ContactInfo.destroy({ where: { id } });

    // Отправляем уведомление администратору об удалении контакта
    try {
      await notifyAdmin(
        'Удаление контактной информации',
        `Администратор удалил контактную информацию.`,
        {
          'ID контакта': id,
          'Тип': contact.type,
          'Email': contact.email,
          'Телефон': contact.phone || 'Не указан',
          'Описание': contact.description || 'Не указано',
          'Дата удаления': new Date().toLocaleString('ru-RU'),
          'Удалено администратором': req.user?.username || 'Неизвестно'
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) {
      return res.json({ 
        success: true, 
        message: "Контакт успешно удален" 
      });
    }
    res.redirect("/admin/contacts"); // Редирект после успешного удаления
  } catch (err) {
    console.error("❌ Ошибка удаления контакта:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) {
      return res.status(500).json({ 
        success: false, 
        message: "Ошибка удаления контакта: " + err.message 
      });
    }
    res.status(500).send("Ошибка базы данных");
 }
});

module.exports = router;
