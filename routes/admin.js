const express = require("express");
const router = express.Router();
const Product = require("../config/database").Product;
const Banner = require("../config/database").Banner;
const VideoPost = require("../config/database").VideoPost;
const Category = require("../config/database").Category;
const Statistics = require("../config/database").Statistics;
const { Op } = require("sequelize");
const { USE_POSTGRES } = require("../config/database");
const { requireAdmin, requireAuth } = require("../middleware/auth");
const { productLimiter } = require("../middleware/rateLimiter");
const { validateProduct, validateProductId, validateService, validateServiceId, validateBanner, validateBannerId, validateModeration } = require("../middleware/validators");
const { csrfProtection, csrfToken } = require("../middleware/csrf");
const { upload } = require("../utils/upload");

const conditionalCsrfToken = csrfToken;
const conditionalCsrfProtection = csrfProtection;

// Middleware для обработки ошибок multer
function handleMulterError(err, req, res, next) {
  if (err) {
    console.error("❌ Ошибка multer при загрузке файлов:", err);
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ success: false, message: "Максимальное количество изображений: 5" });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: "Размер файла превышает 5MB" });
    }
    return res.status(400).json({ success: false, message: "Ошибка загрузки файлов: " + (err.message || "Неизвестная ошибка") });
  }
  next();
}

// Админка (главная страница)
router.get("/", requireAdmin, conditionalCsrfToken, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).send("Админка недоступна: отсутствует подключение к БД");
    
    // Разделяем товары и услуги (исключаем удаленные)
     const [allProducts, allServices, pendingProducts, pendingServices, allBanners, pendingBanners, allVideos, pendingVideos, visitors, users] = await Promise.all([
       Product.findAll({
         where: {
           deleted: false,
           [Op.or]: [
             { type: "product" },
             { type: null }
           ]
         },
         order: [['id', 'DESC']],
         include: [{ model: require('../models/User'), as: 'owner', attributes: ['id','username','email'] }],
         raw: true,
         nest: true
       }),

       Product.findAll({
         where: {
           deleted: false,
           type: "service"
         },
         order: [['id', 'DESC']],
         include: [{ model: require('../models/User'), as: 'owner', attributes: ['id','username','email'] }],
         raw: true,
         nest: true
       }),

       Product.findAll({
         where: {
           deleted: false,
           [Op.and]: [
             { ownerId: { [Op.not]: null } },
             {
               [Op.or]: [
                 { status: "pending" },
                 { status: null }
               ]
             },
             {
               [Op.or]: [
                 { type: "product" },
                 { type: null }
               ]
             }
           ]
         },
         order: [['id', 'DESC']],
         include: [{ model: require('../models/User'), as: 'owner', attributes: ['id','username','email'] }],
         raw: true,
         nest: true
       }),

       Product.findAll({
         where: {
           deleted: false,
           [Op.and]: [
             { ownerId: { [Op.not]: null } },
             {
               [Op.or]: [
                 { status: "pending" },
                 { status: null }
               ]
             },
             { type: "service" }
           ]
         },
         order: [['id', 'DESC']],
         include: [{ model: require('../models/User'), as: 'owner', attributes: ['id','username','email'] }],
         raw: true,
         nest: true
       }),

       Banner.findAll({
         order: [['id', 'DESC']],
         include: [{ model: require('../models/User'), as: 'owner', attributes: ['id','username','email'] }],
         raw: true,
         nest: true
       }),

       Banner.findAll({
         where: {
           [Op.and]: [
             { ownerId: { [Op.not]: null } },
             {
               [Op.or]: [
                 { status: "pending" },
                 { status: null }
               ]
             }
           ]
         },
         order: [['id', 'DESC']],
         include: [{ model: require('../models/User'), as: 'owner', attributes: ['id','username','email'] }],
         raw: true,
         nest: true
       }),

       VideoPost.findAll({
          order: [['id', 'DESC']],
          include: [{ model: User, as: 'owner', attributes: ['id','username','email'] }],
          raw: true,
          nest: true
       }),

       VideoPost.findAll({
         where: {
           status: "pending"
        },
        order: [['id', 'DESC']],
        include: [{ model: User, as: 'owner', attributes: ['id','username','email'] }],
        raw: true,
        nest: true
       }),

       Statistics.increment('value', { by: 1, where: { key: 'visitors' } })
         .then(() => Statistics.findByPk('visitors')),

       User.count()
    ]);
    
    console.log(`📋 Всего товаров: ${allProducts.length}`);
    console.log(`🎯 Всего услуг: ${allServices.length}`);
    console.log(`⏳ Товаров на модерации: ${pendingProducts.length}`);
    console.log(`⏳ Услуг на модерации: ${pendingServices.length}`);
    console.log(`📋 Всего баннеров: ${allBanners.length}`);
    console.log(`⏳ Баннеров на модерации: ${pendingBanners.length}`);

    const visitorCount = visitors ? visitors.value : 0;
    const userCount = users || 0;

    // Генерируем CSRF токен для формы и API запросов
    const csrfTokenValue = res.locals.csrfToken || null;

    res.render("admin", {
      products: allProducts,
      services: allServices || [],
      pendingProducts,
      pendingServices: pendingServices || [],
      banners: allBanners || [],
      pendingBanners: pendingBanners || [],
      videos: allVideos || [],
      pendingVideos: pendingVideos || [],
      visitorCount,
      userCount,
      categories: require("../config/categories").FLAT_CATEGORIES,
      csrfToken: csrfTokenValue
    });
  } catch (err) {
    console.error("❌ Ошибка получения товаров (админ):", err);
    res.status(500).send("Ошибка базы данных");
  }
});

// ДОСТУП ЗАБЛОКИРОВАН: Админы не могут создавать товары/услуги напрямую
// Это нарушает бизнес-инварианты (только пользователи могут создавать карточки)
router.post("/products", requireAdmin, async (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Администраторы не могут создавать товары/услуги напрямую. Используйте модерацию существующих карточек."
  });
});

// Удаление товара (soft delete)
router.post("/products/:id/delete", requireAdmin, conditionalCsrfProtection, validateProductId, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
      return res.status(503).send("Недоступно: отсутствует подключение к БД");
    }
    
    // Получаем информацию о товаре до удаления для уведомления
     const product = await Product.findByPk(req.params.id);
    
    await deleteProduct(req.params.id);
    
    // Отправляем уведомление администратору об удалении товара
    try {
      await notifyAdmin(
        'Удаление товара',
        `Администратор удалил товар.`,
        {
          'ID товара': req.params.id,
          'Название': product ? product.name : 'Неизвестно',
          'Тип': product ? product.type || 'product' : 'Неизвестно',
          'Дата удаления': new Date().toLocaleString('ru-RU'),
          'Удален администратором': req.user?.username || 'Неизвестно'
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }
    
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.json({ success: true, message: "Товар удален" });
    res.redirect("/admin/products");
  } catch (err) {
    console.error("❌ Ошибка удаления товара:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка удаления товара: " + err.message });
    res.status(500).send("Ошибка базы данных");
  }
});

// Редактирование товара (форма)
router.get("/products/:id/edit", requireAdmin, validateProductId, conditionalCsrfToken, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
      return res.status(503).send("Недоступно: отсутствует подключение к БД");
    }
     const product = await Product.findByPk(req.params.id);
    if (!product || product.deleted) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(404).json({ success: false, message: "Товар не найден" });
      return res.redirect("/admin");
    }
    
    // Генерируем CSRF токен для формы и API запросов
    const csrfTokenValue = res.locals.csrfToken || null;
    
    res.render("products/edit", { product, mode: "admin", csrfToken: csrfTokenValue });
  } catch (err) {
    console.error("❌ Ошибка получения товара для редактирования:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка базы данных: " + err.message });
    res.status(500).send("Ошибка базы данных");
  }
});

// Редактирование товара (сохранение)
router.post("/products/:id/edit", requireAdmin, productLimiter, upload, handleMulterError, csrfProtection, validateProductId, validateProduct, async (req, res) => {
  if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
  try {
    const updateData = {
      name: req.body.name,
      description: req.body.description,
      price: req.body.price,
      link: req.body.link,
      video_url: req.body.video_url,
      category: req.body.category,
      type: req.body.type,
      phone: req.body.phone,
      email: req.body.email,
      telegram: req.body.telegram,
      whatsapp: req.body.whatsapp,
      contact_method: req.body.contact_method,
      current_images: req.body.current_images
    };

     await updateProduct(req.params.id, updateData, req.files || [], {});

     // Получаем обновленный продукт для редиректа
     const updated = await Product.findByPk(req.params.id);

     const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
     if (wantsJson) {
       return res.json({ success: true, message: "Товар успешно обновлен" });
     }
     // Перенаправляем на страницу редактирования
     res.redirect(`/admin/products/${updated.id}/edit`);
  } catch (err) {
    console.error("❌ Ошибка редактирования товара:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) {
      return res.status(500).json({ success: false, message: "Ошибка редактирования товара: " + err.message });
    }
    res.status(500).send("Ошибка загрузки изображения или базы данных");
  }
});

// Модерация: одобрить карточку
router.post("/products/:id/approve", requireAdmin, conditionalCsrfProtection, validateProductId, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
     await Product.update(
       { status: "approved", rejection_reason: "" },
       { where: { id: req.params.id } }
     );
     const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Карточка не найдена" });
    
    // Отправляем уведомление администратору о модерации
    try {
       await notifyAdmin(
         'Модерация товара - Одобрение',
         `Администратор одобрил товар.`,
         {
           'ID товара': product.id.toString(),
           'Название': product.name,
           'Тип': product.type || 'product',
           'Статус': 'approved',
           'Одобрено администратором': req.user?.username || 'Неизвестно',
           'Дата одобрения': new Date().toLocaleString('ru-RU')
         }
       );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }
    
    res.json({ success: true, status: product.status });
  } catch (err) {
    console.error("❌ Ошибка одобрения карточки:", err);
    res.status(500).json({ success: false, message: "Ошибка одобрения карточки" });
  }
});

// Модерация: отклонить карточку
router.post("/products/:id/reject", requireAdmin, conditionalCsrfProtection, validateProductId, validateModeration, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
    const { adminComment, rejectionReason } = req.body;

    // P1: Validate required fields for reject
    if (!adminComment) {
      return res.status(400).json({ success: false, message: "adminComment required" });
    }
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: "rejectionReason required" });
    }

     await Product.update(
       { status: "rejected", adminComment, rejection_reason: rejectionReason },
       { where: { id: req.params.id } }
     );
     const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Карточка не найдена" });

     // Отправляем уведомление администратору о модерации
     try {
       await notifyAdmin(
         'Модерация товара - Отклонение',
         `Администратор отклонил товар.`,
         {
           'ID товара': product.id.toString(),
          'Название': product.name,
          'Тип': product.type || 'product',
          'Статус': 'rejected',
          'Причина отклонения': rejectionReason,
          'Комментарий администратора': adminComment,
          'Отклонено администратором': req.user?.username || 'Неизвестно',
          'Дата отклонения': new Date().toLocaleString('ru-RU')
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    res.json({ success: true, status: product.status, rejection_reason: product.rejection_reason });
  } catch (err) {
    console.error("❌ Ошибка отклонения карточки:", err);
    res.status(500).json({ success: false, message: "Ошибка отклонения карточки" });
  }
});

// Блокировка карточки (скрытие с главной страницы)
router.post("/products/:id/toggle-visibility", requireAdmin, conditionalCsrfProtection, validateProductId, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
     const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Карточка не найдена" });
    
     const newStatus = product.status === "approved" ? "rejected" : "approved";
     await Product.update(
       { status: newStatus, rejection_reason: newStatus === "rejected" ? "Заблокировано администратором" : "" },
       { where: { id: req.params.id } }
     );
     const updated = await Product.findByPk(req.params.id);
    
    res.json({ success: true, status: updated.status, message: newStatus === "rejected" ? "Карточка заблокирована" : "Карточка разблокирована" });
  } catch (err) {
    console.error("❌ Ошибка блокировки карточки:", err);
    res.status(500).json({ success: false, message: "Ошибка блокировки карточки" });
  }
});

// Блокировка/Разблокировка баннера
router.post("/banners/:id/toggle-visibility", requireAdmin, conditionalCsrfProtection, validateBannerId, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
     const banner = await Banner.findByPk(req.params.id);
    if (!banner) return res.status(404).json({ success: false, message: "Баннер не найден" });
    
    // Переключаем статус
    if (banner.status === "published" || banner.status === "approved") {
      banner.status = "blocked";
    } else {
      banner.status = "published";
    }
    
    await banner.save();
    res.json({ success: true, message: `Баннер ${banner.status === "blocked" ? "заблокирован" : "разблокирован"}`, status: banner.status });
  } catch (err) {
    console.error("❌ Ошибка переключения видимости баннера:", err);
    res.status(500).json({ success: false, message: "Ошибка изменения статуса баннера" });
  }
});

// Модерация баннеров: одобрить баннер
router.post("/banners/:id/approve", requireAdmin, conditionalCsrfProtection, validateBannerId, async (req, res) => {
  try {
     if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
     await Banner.update(
        { status: "approved", rejection_reason: "" },
        { where: { id: req.params.id } }
      );
      const banner = await Banner.findByPk(req.params.id);
     if (!banner) return res.status(404).json({ success: false, message: "Баннер не найден" });
     
     // Отправляем уведомление администратору о модерации
     try {
       await notifyAdmin(
         'Модерация баннера - Одобрение',
         `Администратор одобрил баннер.`,
         {
           'ID баннера': banner.id.toString(),
          'Заголовок': banner.title,
          'Статус': 'approved',
          'Одобрен администратором': req.user?.username || 'Неизвестно',
          'Дата одобрения': new Date().toLocaleString('ru-RU')
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }
    
    res.json({ success: true, status: banner.status });
  } catch (err) {
    console.error("❌ Ошибка одобрения баннера:", err);
    res.status(500).json({ success: false, message: "Ошибка одобрения баннера" });
  }
});

// Модерация баннеров: отклонить баннер
router.post("/banners/:id/reject", requireAdmin, conditionalCsrfProtection, validateBannerId, validateModeration, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
    const { adminComment, rejectionReason } = req.body;

    // P1: Validate required fields for reject
    if (!adminComment) {
      return res.status(400).json({ success: false, message: "adminComment required" });
    }
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: "rejectionReason required" });
    }

     await Banner.update(
       { status: "rejected", adminComment, rejection_reason: rejectionReason },
       { where: { id: req.params.id } }
     );
     const banner = await Banner.findByPk(req.params.id);
    if (!banner) return res.status(404).json({ success: false, message: "Баннер не найден" });

     // Отправляем уведомление администратору о модерации
     try {
       await notifyAdmin(
         'Модерация баннера - Отклонение',
         `Администратор отклонил баннер.`,
         {
           'ID баннера': banner.id.toString(),
          'Заголовок': banner.title,
          'Статус': 'rejected',
          'Причина отклонения': rejectionReason,
          'Комментарий администратора': adminComment,
          'Отклонен администратором': req.user?.username || 'Неизвестно',
          'Дата отклонения': new Date().toLocaleString('ru-RU')
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    res.json({ success: true, status: banner.status, rejection_reason: banner.rejection_reason });
  } catch (err) {
    console.error("❌ Ошибка отклонения баннера:", err);
    res.status(500).json({ success: false, message: "Ошибка отклонения баннера" });
  }
});

// Модерация: одобрить услугу
router.post("/services/:id/approve", requireAdmin, conditionalCsrfProtection, validateServiceId, async (req, res) => {
  try {
     if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
      await Product.update(
        { status: "approved", rejection_reason: "" },
        { where: { id: req.params.id } }
      );
      const service = await Product.findByPk(req.params.id);
     if (!service) return res.status(404).json({ success: false, message: "Услуга не найдена" });
     // Проверяем, что это действительно услуга
     if (service.type !== "service") {
       return res.status(400).json({ success: false, message: "Это не услуга" });
     }
     
     // Отправляем уведомление администратору о модерации
     try {
       await notifyAdmin(
         'Модерация услуги - Одобрение',
         `Администратор одобрил услугу.`,
         {
           'ID услуги': service.id.toString(),
          'Название': service.name,
          'Тип': service.type || 'service',
          'Статус': 'approved',
          'Одобрено администратором': req.user?.username || 'Неизвестно',
          'Дата одобрения': new Date().toLocaleString('ru-RU')
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }
    
    res.json({ success: true, status: service.status });
  } catch (err) {
    console.error("❌ Ошибка одобрения услуги:", err);
    res.status(500).json({ success: false, message: "Ошибка одобрения услуги" });
  }
});

// Модерация: отклонить услугу
router.post("/services/:id/reject", requireAdmin, conditionalCsrfProtection, validateServiceId, validateModeration, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
    const { adminComment, rejectionReason } = req.body;

    // P1: Validate required fields for reject
    if (!adminComment) {
      return res.status(400).json({ success: false, message: "adminComment required" });
    }
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: "rejectionReason required" });
    }

     await Product.update(
       { status: "rejected", adminComment, rejection_reason: rejectionReason },
       { where: { id: req.params.id } }
     );
     const service = await Product.findByPk(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: "Услуга не найдена" });
    // Проверяем, что это действительно услуга
    if (service.type !== "service") {
      return res.status(400).json({ success: false, message: "Это не услуга" });
    }

     // Отправляем уведомление администратору о модерации
     try {
       await notifyAdmin(
         'Модерация услуги - Отклонение',
         `Администратор отклонил услугу.`,
         {
           'ID услуги': service.id.toString(),
          'Название': service.name,
          'Тип': service.type || 'service',
          'Статус': 'rejected',
          'Причина отклонения': rejectionReason,
          'Комментарий администратора': adminComment,
          'Отклонено администратором': req.user?.username || 'Неизвестно',
          'Дата отклонения': new Date().toLocaleString('ru-RU')
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    res.json({ success: true, status: service.status, rejection_reason: service.rejection_reason });
  } catch (err) {
    console.error("❌ Ошибка отклонения услуги:", err);
    res.status(500).json({ success: false, message: "Ошибка отклонения услуги" });
  }
});

// Блокировка услуги (скрытие с главной страницы)
router.post("/services/:id/toggle-visibility", requireAdmin, conditionalCsrfProtection, validateServiceId, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
     const service = await Product.findByPk(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: "Услуга не найдена" });
    
    // Проверяем, что это действительно услуга
    if (service.type !== "service") {
      return res.status(400).json({ success: false, message: "Это не услуга" });
    }
    
     const newStatus = service.status === "approved" ? "rejected" : "approved";
     await Product.update(
       { status: newStatus, rejection_reason: newStatus === "rejected" ? "Заблокировано администратором" : "" },
       { where: { id: req.params.id } }
     );
     const updated = await Product.findByPk(req.params.id);
    
    res.json({ success: true, status: updated.status, message: newStatus === "rejected" ? "Услуга заблокирована" : "Услуга разблокирована" });
  } catch (err) {
    console.error("❌ Ошибка блокировки услуги:", err);
    res.status(500).json({ success: false, message: "Ошибка блокировки услуги" });
  }
});

// Редактирование услуги (форма)
router.get("/services/:id/edit", requireAdmin, validateServiceId, conditionalCsrfToken, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
      return res.status(503).send("Недоступно: отсутствует подключение к БД");
    }
     const service = await Product.findByPk(req.params.id);
    if (!service || service.deleted) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(404).json({ success: false, message: "Услуга не найдена" });
      return res.redirect("/admin");
    }
    
    // Проверяем, что это действительно услуга
    if (service.type !== "service") {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(40).json({ success: false, message: "Это не услуга" });
      return res.redirect("/admin");
    }
    
    // Генерируем CSRF токен для формы и API запросов
    const csrfTokenValue = res.locals.csrfToken || null;
    
    res.render("products/edit", { service, mode: "admin", csrfToken: csrfTokenValue });
  } catch (err) {
    console.error("❌ Ошибка получения услуги для редактирования:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка базы данных: " + err.message });
    res.status(500).send("Ошибка базы данных");
  }
});

// Редактирование услуги (сохранение)
router.post("/services/:id/edit", requireAdmin, productLimiter, upload, handleMulterError, csrfProtection, validateServiceId, validateService, async (req, res) => {
  if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
  try {
     const service = await Product.findByPk(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: "Услуга не найдена" });
    }

    // Проверяем, что это действительно услуга
    if (service.type !== "service") {
      return res.status(400).json({ success: false, message: "Это не услуга" });
    }

    const updateData = {
      name: req.body.name,
      description: req.body.description,
      price: req.body.price,
      link: req.body.link,
      video_url: req.body.video_url,
      category: req.body.category,
      type: req.body.type,
      phone: req.body.phone,
      email: req.body.email,
      telegram: req.body.telegram,
      whatsapp: req.body.whatsapp,
      contact_method: req.body.contact_method,
      current_images: req.body.current_images
    };

     await updateProduct(req.params.id, updateData, req.files || [], {});

     // Получаем обновленную услугу для редиректа
     const updated = await Product.findByPk(req.params.id);
     
     const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
     if (wantsJson) {
       return res.json({ success: true, message: "Услуга успешно обновлена" });
     }
     // Перенаправляем на страницу редактирования
     res.redirect(`/admin/services/${updated.id}/edit`);
  } catch (err) {
    console.error("❌ Ошибка редактирования услуги:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) {
      return res.status(500).json({ success: false, message: "Ошибка редактирования услуги: " + err.message });
    }
    res.status(500).send("Ошибка загрузки изображения или базы данных");
  }
});

// Удаление услуги (soft delete)
router.post("/services/:id/delete", requireAdmin, conditionalCsrfProtection, validateServiceId, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
      return res.status(503).send("Недоступно: отсутствует подключение к БД");
    }
     const service = await Product.findByPk(req.params.id);
    if (!service) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(404).json({ success: false, message: "Услуга не найдена" });
      return res.redirect("/admin");
    }

    // Проверяем, что это действительно услуга
    if (service.type !== "service") {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(400).json({ success: false, message: "Это не услуга" });
      return res.redirect("/admin");
    }

    await deleteProduct(req.params.id);
    
    // Отправляем уведомление администратору об удалении услуги
    try {
      await notifyAdmin(
        'Удаление услуги',
        `Администратор удалил услугу.`,
        {
          'ID услуги': req.params.id,
          'Название': service.name,
          'Тип': service.type || 'service',
          'Дата удаления': new Date().toLocaleString('ru-RU'),
          'Удалена администратором': req.user?.username || 'Неизвестно'
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.json({ success: true, message: "Услуга удалена" });
    res.redirect("/admin/services");
  } catch (err) {
    console.error("❌ Ошибка удаления услуги:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка удаления услуги: " + err.message });
    res.status(500).send("Ошибка базы данных");
  }
});

// Каталог товаров
router.get("/products", requireAdmin, csrfToken, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
      return res.status(503).send("Недоступно: отсутствует подключение к БД");
    }
    
    // Получаем все товары (type: "product" или без type)
     const products = await Product.findAll({
       where: {
         deleted: false,
         [Op.or]: [
           { type: "product" },
           { type: null }
         ]
       },
       order: [['id', 'DESC']],
       include: [{ model: require('../models/User'), as: 'owner', attributes: ['id','username','email'] }],
       raw: true,
       nest: true
     })
    
    // Генерируем CSRF токен для формы и API запросов
    const csrfTokenValue = res.locals.csrfToken || '';
    
    res.render("admin-products", {
      products: products || [],
      csrfToken: csrfTokenValue,
      categories: CATEGORY_LABELS
    });
  } catch (err) {
    console.error("❌ Ошибка получения товаров:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка базы данных: " + err.message });
    res.status(500).send("Ошибка базы данных");
  }
});

// Каталог услуг
router.get("/services", requireAdmin, csrfToken, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
      return res.status(503).send("Недоступно: отсутствует подключение к БД");
    }
    
    // Получаем все услуги (type: "service")
     const services = await Product.findAll({ 
       where: {
         type: "service",
         deleted: false
       },
       order: [['id', 'DESC']],
       include: [{ model: require('../models/User'), as: 'owner', attributes: ['id','username','email'] }],
       raw: true,
       nest: true
     })
    
    // Генерируем CSRF токен для формы и API запросов
    const csrfTokenValue = res.locals.csrfToken || '';
    
    res.render("admin-services", {
      services: services || [],
      csrfToken: csrfTokenValue
    });
  } catch (err) {
    console.error("❌ Ошибка получения услуг:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка базы данных: " + err.message });
    res.status(500).send("Ошибка базы данных");
  }
});

// Каталог баннеров
router.get("/banners", requireAdmin, csrfToken, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
      return res.status(503).send("Недоступно: отсутствует подключение к БД");
    }
    
    // Получаем все баннеры (для админа показываем все, не только published)
      const banners = await Banner.findAll({
        order: [['createdAt', 'DESC']],
        include: [{ model: User, as: 'owner', attributes: ['id','username','email'] }],
        raw: true,
        nest: true
      })
    
    // Генерируем CSRF токен для формы и API запросов
    const csrfTokenValue = res.locals.csrfToken || (req.csrfToken ? req.csrfToken() : '');
    
    res.render("admin-banners", {
      banners: banners || [],
      csrfToken: csrfTokenValue
    });
  } catch (err) {
    console.error("❌ Ошибка получения баннеров:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка базы данных: " + err.message });
    res.status(500).send("Ошибка базы данных");
  }
});

// Добавление баннера (админом)
router.post("/banners", requireAdmin, productLimiter, upload, handleMulterError, csrfProtection, validateBanner, async (req, res) => {
  if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
  try {
    const { title, description, price, link, video_url, category, status } = req.body;
    
    // Валидация
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Название баннера обязательно" });
    }
    
    // Обработка изображений
    let images = [];
    let image_url = null;
    
    if (req.files && req.files.length > 0) {
      const filesToProcess = req.files.slice(0, 5);
      filesToProcess.forEach(file => {
        let imagePath = null;
        if (file.path && !file.path.startsWith('http')) {
          imagePath = '/uploads/' + file.filename;
        } else {
          imagePath = file.path;
        }
        if (imagePath) {
          images.push(imagePath);
        }
      });
      image_url = images.length > 0 ? images[0] : null;
    }
    
    const bannerData = {
      title: title.trim(),
      description: description ? description.trim() : "",
      price: price ? Number(price) : 0,
      link: link ? link.trim() : "",
      video_url: video_url ? video_url.trim() : "",
      category: category ? category.trim() : "",
      status: status || "published",
      images: images,
      image_url: image_url,
      owner: null, // Админ создает без владельца
      rating_up: 0,
      rating_down: 0
    };
    
    const banner = await Banner.create(bannerData);
    
     console.log("✅ Баннер создан:", { id: banner.id, title: banner.title });
    
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) {
      return res.json({ success: true, message: "Баннер успешно добавлен", banner });
    }
    res.redirect("/admin");
  } catch (err) {
    console.error("❌ Ошибка добавления баннера:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) {
      return res.status(500).json({ success: false, message: "Ошибка добавления баннера: " + err.message });
    }
    res.status(500).send("Ошибка загрузки изображения или базы данных");
  }
});

// Редактирование баннера (форма)
router.get("/banners/:id/edit", requireAdmin, validateBannerId, csrfToken, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
      return res.status(503).send("Недоступно: отсутствует подключение к БД");
    }
     const banner = await Banner.findByPk(req.params.id);
    if (!banner) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(404).json({ success: false, message: "Баннер не найден" });
      return res.redirect("/admin");
    }
    
    // Генерируем CSRF токен для формы и API запросов
    const csrfTokenValue = res.locals.csrfToken || '';
    
     res.render("products/edit", { 
       product: {
         id: banner.id,
         name: banner.title,
         description: banner.description,
         price: banner.price,
         link: banner.link,
         video_url: banner.video_url,
         category: banner.category,
         images: banner.images || [],
         image_url: banner.image_url,
         status: banner.status,
         owner: banner.owner,
         type: "banner"
       },
      mode: "admin", 
      csrfToken: csrfTokenValue 
    });
  } catch (err) {
    console.error("❌ Ошибка получения баннера для редактирования:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка базы данных: " + err.message });
    res.status(500).send("Ошибка базы данных");
  }
});

// Редактирование баннера (сохранение)
router.post("/banners/:id/edit", requireAdmin, productLimiter, upload, handleMulterError, csrfProtection, validateBannerId, validateBanner, async (req, res) => {
  if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
  try {
     const banner = await Banner.findByPk(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, message: "Баннер не найден" });
    }

    // Обновляем данные
    banner.title = req.body.name || banner.title;
    banner.description = req.body.description || "";
    banner.price = req.body.price ? Number(req.body.price) : 0;
    banner.link = req.body.link || "";
    banner.video_url = req.body.video_url || "";
    banner.category = req.body.category || "";

    // Обработка изображений
    if (req.body.current_images) {
      const currentImages = Array.isArray(req.body.current_images) 
        ? req.body.current_images 
        : [req.body.current_images].filter(Boolean);
      banner.images = currentImages;
      banner.image_url = currentImages.length > 0 ? currentImages[0] : null;
    }

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => {
        if (file.path && !file.path.startsWith('http')) {
          return '/uploads/' + file.filename;
        }
        return file.path;
      });
      banner.images = [...(banner.images || []), ...newImages].slice(0, 5);
      if (banner.images.length > 0 && !banner.image_url) {
        banner.image_url = banner.images[0];
      }
    }

    await banner.save();

    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
     if (wantsJson) {
       return res.json({ success: true, message: "Баннер успешно обновлен" });
     }
     res.redirect(`/admin/banners/${banner.id}/edit`);
  } catch (err) {
    console.error("❌ Ошибка редактирования баннера:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) {
      return res.status(500).json({ success: false, message: "Ошибка редактирования баннера: " + err.message });
    }
    res.status(500).send("Ошибка базы данных");
  }
});

// Удаление баннера (POST для форм)
router.post("/banners/:id/delete", requireAdmin, conditionalCsrfProtection, validateBannerId, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
      return res.status(503).send("Недоступно: отсутствует подключение к БД");
    }

     if (!/^[a-f0-9]{32,}$/i.test(req.params.id)) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(400).json({ success: false, message: "Неверный формат ID баннера" });
      return res.status(400).send("Неверный формат ID баннера");
    }

    const bannerId = req.params.id;
    console.log("🗑️ Удаление баннера", { bannerId });

    // Найти баннер в базе
     const banner = await Banner.findByPk(bannerId);
    if (!banner) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(404).json({ success: false, message: "Баннер не найден" });
      return res.status(404).send("Баннер не найден");
    }

    // Удалить изображения из Cloudinary
    if (banner.images && banner.images.length > 0) {
      for (const imageUrl of banner.images) {
        try {
          await deleteImage(imageUrl);
        } catch (err) {
          console.error("Ошибка удаления изображения:", err);
        }
      }
    } else if (banner.image_url) {
      try {
        await deleteImage(banner.image_url);
      } catch (err) {
        console.error("Ошибка удаления изображения:", err);
      }
    }

    // Удалить баннер из БД
     await Banner.destroy({ where: { id: bannerId } });

    // Отправляем уведомление администратору об удалении баннера
    try {
      await notifyAdmin(
        'Удаление баннера',
        `Администратор удалил баннер.`,
        {
          'ID баннера': bannerId,
          'Заголовок': banner.title,
          'Дата удаления': new Date().toLocaleString('ru-RU'),
          'Удален администратором': req.user?.username || 'Неизвестно'
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    console.log("✅ Баннер удален:", { bannerId });
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.json({ success: true, message: "Баннер удален" });
    res.redirect("/admin/banners");
  } catch (err) {
    console.error("❌ Ошибка удаления баннера:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка удаления баннера: " + err.message });
    res.status(500).send("Ошибка базы данных");
  }
});

// Удаление баннера (DELETE для API)
router.delete("/banners/:id", requireAdmin, conditionalCsrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      return res.status(503).json({ success: false, message: 'Недоступно: нет БД' });
    }

     if (!/^[a-f0-9]{32,}$/i.test(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID баннера" });
    }

    const bannerId = req.params.id;
    console.log("🗑️ Удаление баннера", { bannerId });

    // Найти баннер в базе
     const banner = await Banner.findByPk(bannerId);
    if (!banner) {
      return res.status(404).json({ success: false, message: "Баннер не найден" });
    }

    // Удаляем изображения из Cloudinary (или локального хранилища)
    if (banner.images && banner.images.length > 0) {
      console.log(`🔄 Удаление ${banner.images.length} изображений баннера из хранилища`);
      const deletedCount = await deleteImages(banner.images);
      console.log(`✅ Удалено ${deletedCount} из ${banner.images.length} изображений баннера`);
    } else if (banner.image_url) {
      console.log(`🔄 Удаление изображения баннера из хранилища: ${banner.image_url}`);
      const deleted = await deleteImage(banner.image_url);
      if (deleted) {
        console.log(`✅ Изображение баннера успешно удалено из хранилища`);
      } else {
        console.warn(`⚠️ Не удалось удалить изображение баннера из хранилища`);
      }
    }

    // Полное удаление из MongoDB
     await Banner.destroy({ where: { id: bannerId } });

    console.log(`✅ Баннер ${bannerId} полностью удален из БД`);

    return res.json({ success: true, message: "Баннер успешно удален" });
  } catch (err) {
    if (err.code === 'EBADCSRFTOKEN') {
      console.error('❌ CSRF validation failed for banner deletion:', err);
      return res.status(403).json({ success: false, message: "Неверный CSRF-токен. Обновите страницу и попробуйте снова." });
    }
    console.error('❌ Ошибка удаления баннера:', err);
    return res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

// Управление категориями
router.get("/categories", requireAdmin, conditionalCsrfToken, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      return res.status(503).send("Админка недоступна: отсутствует подключение к БД");
    }

    res.render("admin-categories", {
      csrfToken: res.locals.csrfToken || null
    });
  } catch (err) {
    console.error("❌ Ошибка загрузки админки категорий:", err);
    res.status(500).send("Ошибка сервера");
  }
});

// Подключаем маршруты для управления контактами
const adminContactsRouter = require('./adminContacts');
router.use('/contacts', adminContactsRouter);

// Маршруты для модерации видео
const { listPending, listAll, moderate } = require('../services/videoService');

// Модерация видео: одобрить
router.post('/videos/:id/approve', requireAdmin, conditionalCsrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
    const { moderate } = require('../services/videoService');
    const video = await moderate({ id: req.params.id, action: 'approve', adminComment: req.body.adminComment || '' });
    if (!video) return res.status(404).json({ success: false, message: "Видео не найдено" });
    
    // Отправляем уведомление администратору о модерации
    try {
      const { notifyAdmin } = require('../services/adminNotificationService');
       await notifyAdmin(
         'Модерация видео - Одобрение',
         `Администратор одобрил видео.`,
         {
           'ID видео': video.id.toString(),
           'Название': video.title,
           'Статус': 'approved',
           'Одобрено администратором': req.user?.username || 'Неизвестно',
           'Дата одобрения': new Date().toLocaleString('ru-RU')
         }
       );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }
    
    res.json({ success: true, status: video.status });
  } catch (err) {
    console.error("❌ Ошибка одобрения видео:", err);
    res.status(500).json({ success: false, message: "Ошибка одобрения видео" });
  }
});

// Модерация видео: отклонить
router.post('/videos/:id/reject', requireAdmin, conditionalCsrfProtection, validateModeration, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
    const { moderate } = require('../services/videoService');
    const { adminComment, rejectionReason } = req.body;

    // P1: Validate required fields for reject
    if (!adminComment) {
      return res.status(400).json({ success: false, message: "adminComment required" });
    }
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: "rejectionReason required" });
    }

    const video = await moderate({ id: req.params.id, action: 'reject', adminComment, rejectionReason });
    if (!video) return res.status(404).json({ success: false, message: "Видео не найдено" });

    // Отправляем уведомление администратору о модерации
    try {
      const { notifyAdmin } = require('../services/adminNotificationService');
       await notifyAdmin(
         'Модерация видео - Отклонение',
         `Администратор отклонил видео.`,
         {
           'ID видео': video.id.toString(),
           'Название': video.title,
           'Статус': 'rejected',
           'Причина отклонения': rejectionReason,
           'Комментарий администратора': adminComment,
           'Отклонено администратором': req.user?.username || 'Неизвестно',
           'Дата отклонения': new Date().toLocaleString('ru-RU')
         }
       );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    res.json({ success: true, status: video.status, rejection_reason: video.rejectionReason });
  } catch (err) {
    console.error("❌ Ошибка отклонения видео:", err);
    res.status(500).json({ success: false, message: "Ошибка отклонения видео" });
  }
});

// Блокировка видео (переключение статуса)
router.post('/videos/:id/toggle-visibility', requireAdmin, conditionalCsrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
     const video = await VideoPost.findByPk(req.params.id);
    if (!video) return res.status(404).json({ success: false, message: "Видео не найдено" });
    
     const newStatus = video.status === "approved" ? "rejected" : "approved";
     await VideoPost.update(
       { status: newStatus, rejectionReason: newStatus === "rejected" ? "Заблокировано администратором" : "" },
       { where: { id: req.params.id } }
     );
     const updated = await VideoPost.findByPk(req.params.id);
    
    res.json({ success: true, status: updated.status, message: newStatus === "rejected" ? "Видео заблокировано" : "Видео разблокировано" });
  } catch (err) {
    console.error("❌ Ошибка блокировки видео:", err);
    res.status(500).json({ success: false, message: "Ошибка блокировки видео" });
  }
});

// Удаление видео
router.post('/videos/:id/delete', requireAdmin, conditionalCsrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
      return res.status(503).send("Недоступно: отсутствует подключение к БД");
    }

    const videoId = req.params.id;
    console.log("🗑️ Удаление видео", { videoId });

    // Найти видео в базе
     const video = await VideoPost.findByPk(videoId);
    if (!video) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(404).json({ success: false, message: "Видео не найдено" });
      return res.status(404).send("Видео не найдено");
    }

    // Удалить видео из БД
     await VideoPost.destroy({ where: { id: videoId } });

    console.log("✅ Видео удалено:", { videoId });
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.json({ success: true, message: "Видео удалено" });
    res.redirect("/admin/videos");
  } catch (err) {
    console.error("❌ Ошибка удаления видео:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка удаления видео: " + err.message });
    res.status(500).send("Ошибка базы данных");
  }
});

module.exports = router;
