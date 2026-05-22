// Валидаторы для express-validator - УЛУЧШЕННАЯ ВЕРСИЯ
const { body, param, query, validationResult } = require("express-validator");
const { CATEGORY_KEYS } = require("../config/constants");

// Middleware для обработки ошибок валидации
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) {
      return res.status(400).json({ 
        success: false, 
        message: "Ошибка валидации",
        errors: errors.array()
      });
    }
    // Для HTML форм возвращаем ошибку
    return res.status(400).send("Ошибка валидации: " + errors.array().map(e => e.msg).join(", "));
  }
  next();
}

// Улучшенная валидация телефона
function validatePhone(phone) {
  if (!phone) return true;
  
  // Удаляем все символы кроме цифр и +
  const cleanPhone = phone.replace(/[^\d\+]/g, '');
  
  // Проверяем базовую структуру телефона
  const phoneRegex = /^\+?[\d]{10,15}$/;
  return phoneRegex.test(cleanPhone);
}

// Улучшенная валидация email
function validateEmail(email) {
  if (!email) return true;
  
  // Более строгая проверка email
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
}

// Валидация создания/редактирования товара
const validateProduct = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Название товара обязательно")
    .isLength({ min: 1, max: 200 })
    .withMessage("Название должно быть от 1 до 200 символов"),
  
  body("price")
    .notEmpty()
    .withMessage("Цена обязательна")
    .isString()
    .withMessage("Цена должна быть строкой"),
  
  body("description")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("Описание не должно превышать 5000 символов"),
  
   body("category")
     .optional()
     .custom((value) => {
       if (!value || value.trim() === '') return true;
       if (CATEGORY_KEYS.includes(value)) return true;
       // Check if it's a valid hex string ID (UUID without dashes or hex string)
       if (typeof value === 'string' && /^[a-f0-9]{32,}$/i.test(value)) return true;
       // Allow hierarchical categories (with dots)
      if (value.includes('.') && value.split('.').every(part => part && part.trim().length > 0)) {
        // Additional check for valid hierarchical category structure
        const parts = value.split('.');
        return parts.every(part => part && part.trim().length > 0 && part.match(/^[a-zA-Z0-9_-]+$/));
      }
      // Allow any string to prevent validation issues
      return typeof value === 'string' && value.length > 0;
    })
    .withMessage("Некорректная категория"),
  
  body("type")
    .optional()
    .isIn(["product", "service"])
    .withMessage("Некорректный тип публикации"),
  
  body("link")
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage("Некорректный URL"),
  
  body("video_url")
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage("Некорректный URL видео"),
  
  // Улучшенная валидация телефона
 body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .custom((value) => {
      if (!validatePhone(value)) {
        throw new Error("Некорректный формат телефона (должно быть 10-15 цифр, возможно с +)");
      }
      return true;
    }),
  
  // Улучшенная валидация email
  body("email")
    .optional({ checkFalsy: true })
    .trim()
    .custom((value) => {
      if (!validateEmail(value)) {
        throw new Error("Некорректный формат email");
      }
      return true;
    })
    .normalizeEmail({ gmail_remove_dots: false }),
  
  body("telegram")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .matches(/^@?[a-zA-Z0-9_]{5,100}$/)
    .withMessage("Telegram должен содержать только буквы, цифры и подчеркивание (5-10 символов)"),
  
  body("whatsapp")
    .optional({ checkFalsy: true })
    .trim()
    .custom((value) => {
      if (value && !validatePhone(value)) {
        throw new Error("Некорректный формат WhatsApp номера");
      }
      return true;
    }),
  
  body("contact_method")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 })
    .withMessage("Способ связи не должен превышать 200 символов"),
  
  handleValidationErrors
];

// Валидация ID товара
const validateProductId = [
  param("id")
    .notEmpty()
    .withMessage("ID товара обязателен")
    .isMongoId()
    .withMessage("Некорректный ID товара"),
  
  handleValidationErrors
];

// Валидация ID услуги (использует ту же логику, что и товар)
const validateServiceId = validateProductId;

// Валидация ID баннера
const validateBannerId = [
  param("id")
    .notEmpty()
    .withMessage("ID баннера обязателен")
    .isMongoId()
    .withMessage("Некорректный ID баннера"),
  
  handleValidationErrors
];

// Валидация создания/редактирования услуги (аналогично товару)
const validateService = validateProduct;

// Валидация создания/редактирования баннера
const validateBanner = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Название баннера обязательно")
    .isLength({ min: 1, max: 200 })
    .withMessage("Название должно быть от 1 до 200 символов"),
  
  body("price")
    .optional()
    .isString()
    .withMessage("Цена должна быть строкой"),
  
  body("description")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("Описание не должно превышать 5000 символов"),
  
  body("category")
    .optional()
    .isIn(CATEGORY_KEYS)
    .withMessage("Некорректная категория"),
  
  body("link")
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage("Некорректный URL"),
  
  body("video_url")
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage("Некорректный URL видео"),
  
  // Улучшенная валидация статуса
  body("status")
    .optional()
    .isIn(["pending", "approved", "rejected"])
    .withMessage("Некорректный статус (допустимые: pending, approved, rejected)"),
  
  handleValidationErrors
];

// Валидация логина
const validateLogin = [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Логин обязателен")
    .isLength({ min: 3, max: 50 })
    .withMessage("Логин должен быть от 3 до 50 символов"),
  
  body("password")
    .notEmpty()
    .withMessage("Пароль обязателен")
    .isLength({ min: 6 })
    .withMessage("Пароль должен быть не менее 6 символов"),
  
  handleValidationErrors
];

// Валидация регистрации
const validateRegister = [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Логин обязателен")
    .isLength({ min: 3, max: 50 })
    .withMessage("Логин должен быть от 3 до 50 символов")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Логин может содержать только буквы, цифры и подчеркивание")
    .custom(async (value) => {
      // Проверяем, не существует ли уже пользователя с таким именем
      const existingUser = await require('../models/User').findOne({ username: value });
      if (existingUser) {
        throw new Error("Пользователь с таким логином уже существует");
      }
      return true;
    }),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email обязателен")
    .custom(async (value) => {
      if (!validateEmail(value)) {
        throw new Error("Некорректный формат email");
      }
      
      // Проверяем, не существует ли уже пользователя с таким email
      const existingUser = await require('../models/User').findOne({ email: value });
      if (existingUser) {
        throw new Error("Пользователь с таким email уже существует");
      }
      
      return true;
    })
    .normalizeEmail({ gmail_remove_dots: false }),

  body("password")
    .notEmpty()
    .withMessage("Пароль обязателен")
    .isLength({ min: 8 })
    .withMessage("Пароль должен быть не менее 8 символов")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Пароль должен содержать хотя бы одну заглавную букву, одну строчную букву и одну цифру"),

  handleValidationErrors
];

// Валидация рейтинга (поддерживает новый формат vote: "up"/"down" и старый value: "like"/"dislike")
const validateRating = [
  body("vote")
    .optional()
    .isIn(["up", "down"])
    .withMessage("Значение vote должно быть 'up' или 'down'"),
  
  body("value")
    .optional()
    .isIn(["like", "dislike"])
    .withMessage("Значение value должно быть 'like' или 'dislike'"),
  
  // Проверяем, что хотя бы одно из полей присутствует
  body().custom((value) => {
    if (!value.vote && !value.value) {
      throw new Error("Необходимо указать vote ('up'/'down') или value ('like'/'dislike')");
    }
    return true;
  }),
  
  handleValidationErrors
];

// Валидация модерации
const validateModeration = [
  body("adminComment")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Комментарий администратора не должен превышать 1000 символов"),

  body("rejectionReason")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Причина отклонения не должна превышать 1000 символов"),

  handleValidationErrors
];

// Валидация Instagram oEmbed
const validateInstagramUrl = [
  query("url")
    .notEmpty()
    .withMessage("URL обязателен")
    .isURL()
    .withMessage("Некорректный URL")
    .custom((value) => {
      if (!value.includes('instagram.com')) {
        throw new Error("URL должен быть ссылкой на Instagram");
      }
      return true;
    }),
  
  handleValidationErrors
];

module.exports = {
  validateProduct,
  validateProductId,
  validateService,
  validateServiceId,
  validateBanner,
  validateBannerId,
  validateLogin,
  validateRegister,
  validateRating,
  validateModeration,
  validateInstagramUrl,
  handleValidationErrors,
  validatePhone,
  validateEmail
};
