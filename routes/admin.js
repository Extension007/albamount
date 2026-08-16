const express = require("express");
const router = express.Router();
const Product = require("../config/database").Product;
const Category = require("../config/database").Category;
const Statistics = require("../config/database").Statistics;
const User = require("../config/database").User;
const { Op } = require("sequelize");
const { USE_POSTGRES } = require("../config/database");
const { requireAdmin, requireAuth } = require("../middleware/auth");
const { productLimiter } = require("../middleware/rateLimiter");
const { isValidEntityId } = require('../utils/idValidation');
const { validateProduct, validateProductId, validateService, validateServiceId, validateModeration } = require("../middleware/validators");
const { csrfProtection, csrfToken } = require("../middleware/csrf");
const { upload } = require("../utils/upload");
const { updateProduct, deleteProduct } = require("../services/productService");
const { notifyAdmin } = require("../services/adminNotificationService");
const { deleteImage, deleteImages } = require("../utils/imageUtils");

const conditionalCsrfToken = csrfToken;
const conditionalCsrfProtection = csrfProtection;

function normalizeCardMedia(rows) {
  return (rows || []).map((row) => {
    const item = { ...row };
    let list = item.images;
    if (typeof list === "string") {
      try {
        list = JSON.parse(list);
      } catch (_) {
        list = [];
      }
    }
    if (!Array.isArray(list)) list = [];
    item.images = list.map((u) => String(u || "").trim()).filter(Boolean);
    if (!item.images.length && item.image_url) {
      item.images = [String(item.image_url)];
    }
    return item;
  });
}

function wantsJsonAdmin(req) {
  return req.xhr || String(req.get("accept") || "").includes("application/json");
}

function respondModeration(req, res, payload) {
  if (wantsJsonAdmin(req)) return res.json(payload);
  return res.redirect("/admin");
}

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
    
    // Cap dashboard payloads (full lists live on dedicated /admin/* pages)
    const DASH_LIMIT = 200;
     const [allProducts, allServices, pendingProducts, pendingServices, visitors, registeredUsers, users] = await Promise.all([
        Product.findAll({
          where: {
            deleted: false,
            [Op.or]: [
              { type: "product" },
              { type: null }
            ]
          },
          order: [['id', 'DESC']],
          include: [{ model: User, as: 'owner', attributes: ['id','username','email'] }],
          limit: DASH_LIMIT,
          raw: true,
          nest: true
        }),

        Product.findAll({
          where: {
            deleted: false,
            type: "service"
          },
          order: [['id', 'DESC']],
          include: [{ model: User, as: 'owner', attributes: ['id','username','email'] }],
          limit: DASH_LIMIT,
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
          include: [{ model: User, as: 'owner', attributes: ['id','username','email'] }],
          limit: DASH_LIMIT,
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
          include: [{ model: User, as: 'owner', attributes: ['id','username','email'] }],
          limit: DASH_LIMIT,
          raw: true,
          nest: true
        }),

       Statistics.increment('value', { by: 1, where: { key: 'visitors' } })
         .then(() => Statistics.findOne({ where: { key: 'visitors' } })),

       User.findAll({
         attributes: ['id', 'username', 'email', 'role', 'accountType', 'emailVerified', 'createdAt'],
         order: [['id', 'DESC']],
         limit: 500
       }),

       User.count()
    ]);
    
    console.log(`📋 Всего товаров: ${allProducts.length}`);
    console.log(`🎯 Всего услуг: ${allServices.length}`);
    console.log(`⏳ Товаров на модерации: ${pendingProducts.length}`);
    console.log(`⏳ Услуг на модерации: ${pendingServices.length}`);

    const visitorCount = visitors ? visitors.value : 0;
    const userCount = users || 0;

    let albaTransactions = [];
    try {
      const AlbaTransaction = require("../config/database").AlbaTransaction;
      const { formatAlbaTransaction } = require("../utils/albaLabels");
      const rows = await AlbaTransaction.findAll({
        order: [["id", "DESC"]],
        limit: 80,
        include: [
          { model: User, as: "user", attributes: ["id", "username", "email"], required: false },
          { model: User, as: "relatedUser", attributes: ["id", "username", "email"], required: false }
        ]
      });
      albaTransactions = rows.map((row) => {
        const formatted = formatAlbaTransaction(row);
        const plain = row.toJSON ? row.toJSON() : row;
        formatted.username = (plain.user && plain.user.username) || "";
        formatted.email = (plain.user && plain.user.email) || "";
        formatted.relatedUsername = (plain.relatedUser && plain.relatedUser.username) || "";
        return formatted;
      });
    } catch (historyErr) {
      console.error("Ошибка загрузки истории ALBA:", historyErr);
    }

    // Генерируем CSRF токен для формы и API запросов
    const csrfTokenValue = res.locals.csrfToken || null;

    res.render("admin", {
      products: normalizeCardMedia(allProducts),
      services: normalizeCardMedia(allServices || []),
      pendingProducts: normalizeCardMedia(pendingProducts),
      pendingServices: normalizeCardMedia(pendingServices || []),
      visitorCount,
      userCount,
      registeredUsers: registeredUsers || [],
      currentAdminId: req.user?.id || req.user?._id,
      categories: require("../config/categories").FLAT_CATEGORIES,
      csrfToken: csrfTokenValue,
      albaTransactions
    });
  } catch (err) {
    console.error("❌ Ошибка получения товаров (админ):", err);
    res.status(500).send("Ошибка базы данных");
  }
});

router.post("/users/:id/delete", requireAdmin, conditionalCsrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(503).json({ success: false, message: "Нет БД" });
      return res.status(503).send("Нет БД");
    }

    const { deleteRegisteredUser } = require("../services/userAdminService");
    const { getAuthUserId } = require("../middleware/auth");
    await deleteRegisteredUser(req.params.id, { id: getAuthUserId(req.user) });

    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.json({ success: true, message: "Пользователь удалён" });
    return res.redirect("/admin");
  } catch (err) {
    const logger = require("../utils/logger");
    logger.error({ msg: 'admin_user_delete_failed', error: err.message, stack: err.stack, userId: req.params.id });
    const status = err.status || 500;
    const message = status >= 500 ? "Ошибка удаления пользователя" : (err.message || "Ошибка удаления пользователя");
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(status).json({ success: false, message });
    return res.status(status).send(message);
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
    res.redirect("/admin");
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
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Карточка не найдена" });
    if (product.type === "service") {
      return res.status(400).json({ success: false, message: "Это услуга — одобряйте в разделе услуг" });
    }
    await Product.update(
      { status: "approved", rejectionReason: "", type: product.type || "product" },
      { where: { id: req.params.id } }
    );
    await product.reload();
    
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
    
    respondModeration(req, res, { success: true, status: product.status });
  } catch (err) {
    console.error("❌ Ошибка одобрения карточки:", err);
    res.status(500).json({ success: false, message: "Ошибка одобрения карточки" });
  }
});

// Модерация: отклонить карточку
router.post("/products/:id/reject", requireAdmin, conditionalCsrfProtection, validateProductId, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
    const rejectionReason = (req.body.rejectionReason || req.body.reason || 'Несоответствие правилам публикации').toString().trim();
    const adminComment = (req.body.adminComment || 'Отклонено администратором').toString().trim();
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: "rejectionReason required" });
    }

    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Карточка не найдена" });

    const wasPending = product.status === 'pending';
    const shouldRefundAlba = wasPending && product.tier === 'paid';

    await Product.update(
      { status: "rejected", adminComment, rejectionReason: rejectionReason },
      { where: { id: req.params.id } }
    );
    await product.reload();

    let albaRefund = null;
    if (shouldRefundAlba) {
      const { refundAlbaOnModerationReject } = require('../services/albaService');
      albaRefund = await refundAlbaOnModerationReject({
        card: product,
        actorAdminId: req.user?._id || req.user?.id || null
      });
    }

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
          'Дата отклонения': new Date().toLocaleString('ru-RU'),
          'Возврат ALBA': albaRefund?.refunded ? 'да' : 'нет'
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    return respondModeration(req, res, {
      success: true,
      status: product.status,
      rejection_reason: product.rejection_reason,
      albaRefunded: Boolean(albaRefund?.refunded)
    });
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
     const patch = {
       status: newStatus,
       rejectionReason: newStatus === "rejected" ? "Заблокировано администратором" : ""
     };
     if (newStatus === "approved") patch.type = product.type || "product";
     await Product.update(patch, { where: { id: req.params.id } });
     const updated = await Product.findByPk(req.params.id);
    
    return respondModeration(req, res, { success: true, status: updated.status, message: newStatus === "rejected" ? "Карточка заблокирована" : "Карточка разблокирована" });
  } catch (err) {
    console.error("❌ Ошибка блокировки карточки:", err);
    res.status(500).json({ success: false, message: "Ошибка блокировки карточки" });
  }
});

// Модерация: одобрить услугу
router.post("/services/:id/approve", requireAdmin, conditionalCsrfProtection, validateServiceId, async (req, res) => {
  try {
     if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
      const service = await Product.findByPk(req.params.id);
     if (!service) return res.status(404).json({ success: false, message: "Услуга не найдена" });
     if (service.type !== "service") {
       return res.status(400).json({ success: false, message: "Это не услуга" });
     }
      await Product.update(
        { status: "approved", rejectionReason: "", type: "service" },
        { where: { id: req.params.id } }
      );
      await service.reload();
     
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
    
    return respondModeration(req, res, { success: true, status: service.status });
  } catch (err) {
    console.error("❌ Ошибка одобрения услуги:", err);
    res.status(500).json({ success: false, message: "Ошибка одобрения услуги" });
  }
});

// Модерация: отклонить услугу
router.post("/services/:id/reject", requireAdmin, conditionalCsrfProtection, validateServiceId, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
    const rejectionReason = (req.body.rejectionReason || req.body.reason || 'Несоответствие правилам публикации').toString().trim();
    const adminComment = (req.body.adminComment || 'Отклонено администратором').toString().trim();
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: "rejectionReason required" });
    }

    const service = await Product.findByPk(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: "Услуга не найдена" });
    if (service.type !== "service") {
      return res.status(400).json({ success: false, message: "Это не услуга" });
    }

    const wasPending = service.status === 'pending';
    const shouldRefundAlba = wasPending && service.tier === 'paid';

    await Product.update(
      { status: "rejected", adminComment, rejectionReason: rejectionReason },
      { where: { id: req.params.id } }
    );
    await service.reload();

    let albaRefund = null;
    if (shouldRefundAlba) {
      const { refundAlbaOnModerationReject } = require('../services/albaService');
      albaRefund = await refundAlbaOnModerationReject({
        card: service,
        actorAdminId: req.user?._id || req.user?.id || null
      });
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
          'Дата отклонения': new Date().toLocaleString('ru-RU'),
          'Возврат ALBA': albaRefund?.refunded ? 'да' : 'нет'
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    return respondModeration(req, res, {
      success: true,
      status: service.status,
      rejection_reason: service.rejectionReason || service.rejection_reason,
      albaRefunded: Boolean(albaRefund?.refunded)
    });
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
       { status: newStatus, rejectionReason: newStatus === "rejected" ? "Заблокировано администратором" : "" },
       { where: { id: req.params.id } }
     );
     const updated = await Product.findByPk(req.params.id);
    
    return respondModeration(req, res, { success: true, status: updated.status, message: newStatus === "rejected" ? "Услуга заблокирована" : "Услуга разблокирована" });
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
    res.redirect("/admin");
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
        include: [{ model: User, as: 'owner', attributes: ['id','username','email'] }],
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
          include: [{ model: User, as: 'owner', attributes: ['id','username','email'] }],
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

// Подключаем маршруты для управления контактами
const adminContactsRouter = require('./adminContacts');
router.use('/contacts', adminContactsRouter);

module.exports = router;
