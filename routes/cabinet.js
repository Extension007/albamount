const express = require("express");
const router = express.Router();
const { Op } = require('sequelize');
const Product = require("../models/Product");
const Banner = require("../models/Banner");
const Category = require("../models/Category");
const User = require("../models/User");
const AlbaTransaction = require("../models/AlbaTransaction");
const { USE_POSTGRES } = require("../config/database");
const { requireUser } = require("../middleware/auth");
const { productLimiter } = require("../middleware/rateLimiter");
const { validateProduct, validateProductId } = require("../middleware/validators");
const { csrfProtection, csrfToken } = require("../middleware/csrf");
const { upload, bannerUpload, mobileOptimization } = require("../utils/upload");
const { createProduct, updateProduct } = require("../services/productService");
const { notifyAdmin } = require("../services/adminNotificationService");
const { getUserAlbaBalance } = require("../services/albaService");

const isVercel = Boolean(process.env.VERCEL);

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
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ success: false, message: "Неожиданное поле для загрузки файла" });
    }
    if (err.message && err.message.includes('Недопустимый тип файла')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(400).json({ success: false, message: "Ошибка загрузки файлов: " + (err.message || "Неизвестная ошибка") });
  }
  next();
}

// Личный кабинет
router.get("/", requireUser, conditionalCsrfToken, async (req, res) => {
  if (!USE_POSTGRES) {
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(503).json({ success: false, message: "Личный кабинет недоступен: нет БД" });
    return res.status(503).send("Личный кабинет недоступен: нет БД");
  }
   try {
     // Разделяем товары и услуги (исключаем удаленные)
     const myProducts = await Product.findAll({
       where: {
         ownerId: req.user._id,
         deleted: false,
         [Op.or]: [
           { type: "product" },
           { type: null }
         ]
       },
       order: [['id', 'DESC']]
     });

     const myServices = await Product.findAll({
       where: {
         ownerId: req.user._id,
         deleted: false,
         type: "service"
       },
       order: [['id', 'DESC']]
     });

     // Получаем баннеры пользователя
     const myBanners = await Banner.findAll({
       where: { ownerId: req.user._id },
       order: [['id', 'DESC']]
     });

    // Получаем дерево категорий для всех типов
    const categoryTree = await Category.getTree('all');
    const categoryFlat = await Category.getFlatList('all');

     // Получаем свежие данные пользователя и актуальный ALBA баланс
     const freshUser = await User.findByPk(req.user._id, {
       attributes: ['id', 'username', 'email', 'role', 'emailVerified', 'albaBalance', 'refCode', 'referredBy', 'refBonusGranted', 'createdAt', 'updatedAt'],
       raw: true
     });

     // Вычисляем баланс как сумму транзакций, чтобы обеспечить согласованность
     const actualBalance = await getUserAlbaBalance(req.user._id);
     freshUser.albaBalance = actualBalance;
     
     // Получаем последние транзакции ALBA для пользователя
     const albaTransactions = await AlbaTransaction.findAll({
       where: { userId: req.user._id },
       order: [['createdAt', 'DESC']],
       limit: 50,
       raw: true
     });

    // Генерируем CSRF токен
    const csrfTokenValue = res.locals.csrfToken || (req.csrfToken ? req.csrfToken() : '');

    res.render("cabinet", {
      user: freshUser, // используем свежие данные из базы
      albaTransactions, // передаем транзакции в шаблон
      products: myProducts,
      services: myServices || [],
      banners: myBanners || [],
      csrfToken: csrfTokenValue,
      socket_io_available: res.locals.socket_io_available,
      categories: categoryFlat, // Новая система категорий
      hierarchicalCategories: categoryTree // Дерево категорий
    });
  } catch (err) {
    console.error("❌ Ошибка загрузки кабинета:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка загрузки кабинета: " + err.message });
    res.status(500).send("Ошибка загрузки кабинета");
  }
});

// Пользователь создаёт карточку
router.post("/product", requireUser, productLimiter, mobileOptimization, upload, handleMulterError, conditionalCsrfProtection, validateProduct, async (req, res) => {
  if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "Необходима авторизация" });
    }

    // Проверка наличия изображений (если обязательны)
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "Необходимо загрузить хотя бы одно изображение" });
    }

    const productData = {
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
      ownerId: req.user._id,
      status: "pending"
    };

    console.log(`📋 Creating product: device=${req.isMobile ? 'mobile' : 'desktop'}, filesCount=${req.files ? req.files.length : 0}`);

    // Use new product creation with entitlement check
    const { createProductWithEntitlementCheck } = require('../services/productService');
    const result = await createProductWithEntitlementCheck(productData, req.files || [], req.user);

    const imagesCount = result.product.images?.length || 0;

     console.log("✅ Карточка создана пользователем:", {
       id: result.product.id.toString(),
       name: result.product.name,
       owner: result.product.owner.toString(),
       imagesCount,
       deviceType: req.isMobile ? 'mobile' : 'desktop',
       tier: result.product.tier,
       entitlementConsumed: result.entitlementConsumed
     });

     res.json({
       success: true,
       productId: result.product.id,
      tier: result.product.tier,
      entitlementConsumed: result.entitlementConsumed
    });
  } catch (err) {
    console.error("❌ Ошибка создания карточки:", err);
    res.status(500).json({ success: false, message: "Ошибка создания карточки: " + err.message });
  }
});

// Пользователь меняет цену своей карточки
router.post("/product/:id/price", requireUser, conditionalCsrfProtection, validateProductId, async (req, res) => {
  if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
   try {
     const price = req.body.price;
     if (!price || price.trim().length === 0) {
       return res.status(400).json({ success: false, message: "Цена не может быть пустой" });
     }
     
     // Check product ownership
     const productCheck = await Product.findOne({
       where: { id: req.params.id, ownerId: req.user._id, deleted: false }
     });
     if (!productCheck) {
       return res.status(404).json({ success: false, message: "Карточка не найдена" });
     }

     const [updated] = await Product.update(
       { price },
       { where: { id: req.params.id } }
     );
     
     res.json({ success: true, price: price });
   } catch (err) {
    console.error("❌ Ошибка изменения цены:", err);
    res.status(500).json({ success: false, message: "Ошибка изменения цены" });
  }
});

// Получение формы редактирования товара
router.get("/product/:id/edit", requireUser, validateProductId, conditionalCsrfToken, async (req, res) => {
  if (!USE_POSTGRES) {
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
    return res.status(503).send("Недоступно: отсутствует подключение к БД");
  }
  try {
     const product = await Product.findOne({
       where: { id: req.params.id, ownerId: req.user._id, deleted: false }
     });
    if (!product) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(404).json({ success: false, message: "Карточка не найдена или у вас нет прав для редактирования" });
      return res.status(404).send("Карточка не найдена или у вас нет прав для редактирования");
    }

    // Генерируем CSRF токен для формы и API запросов
    const csrfTokenValue = res.locals.csrfToken || (req.csrfToken ? req.csrfToken() : null);

    res.render("products/edit", { product, user: req.user, mode: "user", csrfToken: csrfTokenValue });
  } catch (err) {
    console.error("❌ Ошибка получения товара для редактирования:", err);
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(500).json({ success: false, message: "Ошибка базы данных: " + err.message });
    res.status(500).send("Ошибка базы данных");
  }
});

// Редактирование товара пользователем
router.post("/product/:id/edit", requireUser, productLimiter, mobileOptimization, upload, handleMulterError, conditionalCsrfProtection, validateProductId, validateProduct, async (req, res) => {
  if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
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

    const updated = await updateProduct(
      req.params.id,
      updateData,
      req.files || [],
      { ownerId: req.user._id }
    );
    
     console.log("✅ Карточка обновлена пользователем:", {
       id: updated.id.toString(),
       name: updated.name,
       owner: updated.owner.toString()
     });
    
    // Проверяем, является ли запрос AJAX
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) {
      return res.json({ success: true, product: updated });
    }
     // Перенаправляем на страницу редактирования
     res.redirect(`/cabinet/product/${updated.id}/edit`);
  } catch (err) {
    console.error("❌ Ошибка редактирования карточки:", err);
    if (err.message.includes("не найден") || err.message.includes("нет прав")) {
      return res.status(404).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: "Ошибка редактирования карточки: " + err.message });
  }
});

// Загрузка баннера пользователем
router.post("/banner", requireUser, productLimiter, bannerUpload, handleMulterError, conditionalCsrfProtection, async (req, res) => {
  if (!USE_POSTGRES) {
    return res.status(503).json({ success: false, message: "Нет БД" });
  }
  
  try {
    // Проверка наличия файла
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Изображение баннера обязательно" });
    }
    
    // Обработка пути к изображению
    let imageUrl = null;
    try {
      if (req.file.path && !req.file.path.startsWith('http')) {
        imageUrl = '/uploads/' + req.file.filename;
      } else {
        imageUrl = req.file.path;
      }
    } catch (fileErr) {
      console.error("❌ Ошибка обработки файла:", fileErr);
      return res.status(400).json({ success: false, message: "Ошибка обработки загруженного файла" });
    }
    
     let ownerId = null;
     try {
       if (req.user && req.user._id) {
         const userId = req.user._id;
         // Already validated JWT, just use as-is (string)
         ownerId = userId;
       } else {
         ownerId = null;
       }
     } catch (ownerErr) {
       console.error("❌ Ошибка обработки ownerId:", ownerErr);
       return res.status(400).json({ success: false, message: "Ошибка обработки данных пользователя" });
     }
    
    // Создание баннера
    const bannerData = {
      title: req.body.title || req.body.name || "Баннер",
      description: req.body.description || "",
      image_url: imageUrl,
      images: [imageUrl], // Добавляем в массив для совместимости
      link: req.body.link ? req.body.link.trim() : "",
      owner: ownerId,
      status: "pending",
      price: req.body.price || "",
      category: req.body.category || ""
    };
    
    const created = await Banner.create(bannerData);
    
    // Отправляем уведомление администратору о новом баннере
    try {
      await notifyAdmin(
        'Новый баннер на модерацию',
        `Загружен новый баннер пользователем и отправлен на модерацию.`,
        {
          'Заголовок': bannerData.title,
           'Описание': bannerData.description,
           'Ссылка': bannerData.link,
           'Категория': bannerData.category,
           'Цена': bannerData.price,
           'ID баннера': created.id.toString(),
           'Владелец': created.owner ? created.owner.toString() : 'Неизвестен',
           'Дата создания': new Date().toLocaleString('ru-RU')
         }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

     console.log("✅ Баннер создан:", {
       id: created.id.toString(),
       status: created.status,
       owner: created.owner ? created.owner.toString() : 'null'
     });
     
     return res.json({ success: true, bannerId: created.id, banner: created });
  } catch (err) {
    console.error("❌ Ошибка создания баннера:", err);
    console.error("❌ Стек ошибки:", err.stack);
    
    // Возвращаем JSON с описанием ошибки
    return res.status(500).json({ 
      success: false, 
      error: "Internal Server Error",
      message: err.message || "Ошибка создания баннера"
    });
  }
});

// Получение формы редактирования баннера
router.get("/banner/:id/edit", requireUser, conditionalCsrfToken, async (req, res) => {
  if (!USE_POSTGRES) {
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) return res.status(503).json({ success: false, message: "Недоступно: отсутствует подключение к БД" });
    return res.status(503).send("Недоступно: отсутствует подключение к БД");
  }
  try {
    const banner = await Banner.findOne({ 
      _id: req.params.id, 
      owner: req.user._id
    });
    if (!banner) {
      const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
      if (wantsJson) return res.status(404).json({ success: false, message: "Баннер не найден или у вас нет прав для редактирования" });
      return res.status(404).send("Баннер не найден или у вас нет прав для редактирования");
    }
    
    // Генерируем CSRF токен
    const csrfTokenValue = res.locals.csrfToken || (req.csrfToken ? req.csrfToken() : '');
    
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
      user: req.user, 
      mode: "user", 
      csrfToken: csrfTokenValue 
    });
  } catch (err) {
    console.error("❌ Ошибка получения баннера для редактирования:", err);
    console.error("❌ Стек ошибки:", err.stack);
    
    const wantsJson = req.xhr || req.get("accept")?.includes("application/json");
    if (wantsJson) {
      return res.status(500).json({ 
        success: false, 
        error: "Internal Server Error",
        message: err.message || "Ошибка базы данных"
      });
    }
    return res.status(500).send("Ошибка базы данных");
  }
});

// Редактирование баннера пользователем
router.post("/banner/:id/edit", requireUser, productLimiter, bannerUpload, handleMulterError, conditionalCsrfProtection, async (req, res) => {
  if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
  try {
    const banner = await Banner.findOne({ 
      _id: req.params.id, 
      owner: req.user._id
    });
    if (!banner) {
      return res.status(404).json({ success: false, message: "Баннер не найден или у вас нет прав для редактирования" });
    }

    // Обновляем данные
    banner.title = req.body.name || banner.title;
    banner.description = req.body.description || "";
    banner.price = req.body.price || "";
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
       return res.json({ success: true, banner });
     }
     res.redirect(`/cabinet/banner/${banner.id}/edit`);
  } catch (err) {
    console.error("❌ Ошибка редактирования баннера:", err);
    res.status(500).json({ success: false, message: "Ошибка редактирования баннера: " + err.message });
  }
});

// Удаление товара/услуги пользователем
router.delete("/product/:id", requireUser, conditionalCsrfProtection, async (req, res) => {
  if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Нет БД" });
  try {
     const product = await Product.findOne({
       where: { id: req.params.id, ownerId: req.user._id, deleted: false }
     });
    if (!product) {
      return res.status(404).json({ success: false, message: "Карточка не найдена или у вас нет прав для удаления" });
    }

    // Soft delete
    product.deleted = true;
    await product.save();

     // Отправляем уведомление администратору об удалении товара/услуги
     try {
       await notifyAdmin(
         'Удаление товара/услуги',
         `Пользователь удалил товар или услугу.`,
         {
           'ID карточки': product.id.toString(),
          'Название': product.name,
          'Тип': product.type || 'product',
          'Владелец': product.owner ? product.owner.toString() : 'Неизвестен',
          'Дата удаления': new Date().toLocaleString('ru-RU')
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    res.json({ success: true, message: "Карточка удалена" });
  } catch (err) {
    console.error("❌ Ошибка удаления карточки:", err);
    res.status(500).json({ success: false, message: "Ошибка удаления карточки: " + err.message });
  }
});

// Удаление баннера пользователем
router.delete("/banner/:id", requireUser, conditionalCsrfProtection, async (req, res) => {
  if (!USE_POSTGRES) {
    return res.status(503).json({ success: false, message: "Нет БД" });
  }
  
  try {
    // Валидация ID
     if (!/^[a-f0-9]{32,}$/i.test(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID баннера" });
    }
    
    // Проверка авторизации
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "Требуется авторизация" });
    }
    
    const banner = await Banner.findOne({ 
      _id: req.params.id, 
      owner: req.user._id
    });
    
    if (!banner) {
      return res.status(404).json({ success: false, message: "Баннер не найден или у вас нет прав для удаления" });
    }

    // Удаляем изображения
    try {
      const { deleteImage, deleteImages } = require("../utils/imageUtils");
      if (banner.images && banner.images.length > 0) {
        await deleteImages(banner.images);
      } else if (banner.image_url) {
        await deleteImage(banner.image_url);
      }
    } catch (imgErr) {
      console.warn("⚠️ Ошибка удаления изображений баннера (продолжаем удаление):", imgErr);
      // Продолжаем удаление даже если не удалось удалить изображения
    }

    // Отправляем уведомление администратору об удалении баннера
    try {
      await notifyAdmin(
        'Удаление баннера',
        `Пользователь удалил баннер.`,
        {
          'ID баннера': req.params.id,
          'Заголовок': banner.title,
          'Владелец': banner.owner ? banner.owner.toString() : 'Неизвестен',
          'Дата удаления': new Date().toLocaleString('ru-RU')
        }
      );
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    // Полное удаление из БД
     await Banner.destroy({ where: { id: req.params.id } });

    return res.json({ success: true, message: "Баннер удален" });
  } catch (err) {
    console.error("❌ Ошибка удаления баннера:", err);
    console.error("❌ Стек ошибки:", err.stack);
    
    return res.status(500).json({ 
      success: false, 
      error: "Internal Server Error",
      message: err.message || "Ошибка удаления баннера"
    });
  }
});

module.exports = router;
