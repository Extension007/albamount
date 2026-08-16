// API роуты (рейтинг, Instagram oEmbed, удаление изображений)
const express = require("express");
const router = express.Router();
const { Product, User } = require("../config/database");
const { Sequelize, Op } = require("../config/database");
const { USE_POSTGRES } = require("../config/database");
const { apiLimiter } = require("../middleware/rateLimiter");
const { isRecordOwner } = require('../utils/ownership');
const { isValidEntityId, isValidCardId } = require('../utils/idValidation');
const { validateRating, validateProductId, validateServiceId, validateInstagramUrl } = require("../middleware/validators");
const csrfProtection = require('csurf')({ cookie: true });
const { deleteImage, deleteImages } = require("../utils/imageUtils");
const { requireUser } = require("../middleware/auth");
const { castVote } = require("../services/voteService");
const { ensureGuestId } = require("../middleware/p1Guest");
const { parsePagination } = require("../utils/pagination");
const { publicProductWhere, publicServiceWhere, notDeletedClause } = require("../utils/catalogFilters");

function setGuestVoteCookie(res, name) {
  res.cookie(name, '1', {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
}

// Голосование (унифицированный формат: vote: "up"/"down")
// Поддерживает обратную совместимость с value: "like"/"dislike"
router.post("/rating/:id", apiLimiter, ensureGuestId, csrfProtection, validateProductId, validateRating, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Рейтинг недоступен: нет БД" });

    const vote = req.body.vote || (req.body.value === "like" ? "up" : req.body.value === "dislike" ? "down" : null);
    if (!vote || (vote !== "up" && vote !== "down")) {
      return res.status(400).json({ success: false, message: "Неверное значение vote. Используйте 'up' или 'down'" });
    }

    if (!req.user) {
      const guestVoteCookie = req.cookies[`exto_vote_${req.params.id}`];
      if (guestVoteCookie) {
        return res.status(409).json({ success: false, message: "Вы уже голосовали за этот товар" });
      }
    }

    const result = await castVote({
      targetType: 'product',
      targetId: req.params.id,
      vote,
      user: req.user,
      guestKey: req.user ? null : req.guestId
    });

    if (!result.ok) {
      return res.status(result.status || 500).json({ success: false, message: result.message });
    }

    if (!req.user) setGuestVoteCookie(res, `exto_vote_${req.params.id}`);

    res.json({
      success: true,
      rating_up: result.likes,
      rating_down: result.dislikes,
      likes: result.likes,
      dislikes: result.dislikes,
      total: result.total,
      result: result.result,
      voted: true
    });
  } catch (err) {
    console.error("❌ Ошибка обновления рейтинга:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Получение состояния голосов
router.get("/rating/:id", apiLimiter, validateProductId, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Рейтинг недоступен: нет БД" });
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Товар не найден" });

    res.json({
      success: true,
      likes: product.likes,
      dislikes: product.dislikes,
      total: product.likes + product.dislikes,
      result: product.likes - product.dislikes
    });
  } catch (err) {
    console.error("❌ Ошибка получения рейтинга:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Instagram oEmbed API endpoint
router.get("/instagram/oembed", apiLimiter, validateInstagramUrl, async (req, res) => {
  try {
    const { url } = req.query;

    // Validate Instagram URL
    if (!url.includes('instagram.com')) {
      return res.status(400).json({ success: false, message: "Invalid Instagram URL" });
    }

    // Call Instagram oEmbed API
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`;
    const https = require('https');
    
    try {
      const data = await new Promise((resolve, reject) => {
        const timeoutMs = 4000;
        let timeoutId;

        const request = https.get(oembedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }, (response) => {
          let body = '';
          response.on('data', (chunk) => body += chunk);
          response.on('end', () => {
            clearTimeout(timeoutId);
            if (response.statusCode === 200) {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(new Error('Invalid JSON response'));
              }
            } else {
              reject(new Error(`Instagram API returned ${response.statusCode}`));
            }
          });
          response.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
          });
        });

        timeoutId = setTimeout(() => {
          const timeoutError = new Error('Instagram oEmbed timeout');
          timeoutError.code = 'ETIMEDOUT';
          request.destroy(timeoutError);
        }, timeoutMs);

        request.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });

      res.json({ success: true, html: data.html || '', thumbnail_url: data.thumbnail_url || null });
    } catch (fetchErr) {
      if (fetchErr && (fetchErr.code === 'ETIMEDOUT' || (fetchErr.message && fetchErr.message.includes('timeout')))) {
        return res.status(504).json({ success: false, message: "Instagram oEmbed timeout" });
      }
      console.error("❌ Ошибка запроса к Instagram oEmbed API:", fetchErr);
      // Fallback: return embed URL
      const postId = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (postId) {
        const embedUrl = `https://www.instagram.com/p/${postId[2]}/embed/`;
        res.json({ 
          success: true, 
          html: `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" scrolling="no" allowtransparency="true" allow="encrypted-media"></iframe>`,
          fallback: true
        });
      } else {
        res.status(500).json({ success: false, message: "Failed to fetch Instagram embed" });
      }
    }
  } catch (err) {
    console.error("❌ Ошибка Instagram oEmbed:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Удаление изображения по клику на крестик
router.delete("/images/:productId/:index", apiLimiter, csrfProtection, async (req, res) => {
  try {
    const { productId, index } = req.params;
    const imageIndex = parseInt(index);
    
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: 'Недоступно: нет БД' });
    
     if (!isValidEntityId(productId)) {
      console.error('❌ Неверный формат ID товара:', productId);
      return res.status(400).json({ success: false, message: "Неверный формат ID товара" });
    }

    if (!req.user) {
      console.error('❌ Попытка удаления без авторизации');
      return res.status(401).json({ success: false, message: "Необходима авторизация" });
    }

    // Найти продукт в базе
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Продукт не найден" });
    }

     // Проверка прав: админ или владелец
     const isAdmin = req.user.role === "admin";
     const isOwner = isRecordOwner(product, req.user);
     
     if (!isAdmin && !isOwner) {
       return res.status(403).json({ success: false, message: "Доступ запрещен" });
     }

     // Проверить индекс
    const images = product.images || [];
    if (isNaN(imageIndex) || imageIndex < 0 || imageIndex >= images.length) {
      return res.status(400).json({ success: false, message: "Неверный индекс изображения" });
    }

    // Получаем URL изображения для удаления
    const imageUrl = images[imageIndex];

    // Удалить из Cloudinary (или локального хранилища)
    // Функция deleteImage из utils/imageUtils.js автоматически определяет тип хранилища
    // и извлекает public_id из URL для Cloudinary
    const deleted = await deleteImage(imageUrl);
    
    
    if (!deleted) {
      // Log warning for failed deletion but continue
    } else {
      // Successfully deleted from storage
    }
    // Удалить из массива в MongoDB
    images.splice(imageIndex, 1);
    product.images = images;
    
    // Обновляем image_url для обратной совместимости
    product.image_url = images.length > 0 ? images[0] : null;
    
    await product.save();

    
        // Image removed successfully
    // Возвращаем успешный ответ (204 No Content - стандарт для DELETE)
    // Также можно вернуть JSON с success: true для совместимости
    return res.status(204).send();
  } catch (err) {
    if (err.code === 'EBADCSRFTOKEN') {
      console.error('❌ CSRF validation failed for image deletion:', err);
      return res.status(403).json({ success: false, message: "Неверный CSRF-токен. Обновите страницу и попробуйте снова." });
    }
    console.error('Ошибка удаления изображения:', err);
    return res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

// Полное удаление карточки товара
router.delete("/products/:id", apiLimiter, requireUser, csrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) {
      return res.status(503).json({ success: false, message: 'Недоступно: нет БД' });
    }

    if (!isValidEntityId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID товара" });
    }

    if (!req.user) {
      return res.status(401).json({ success: false, message: "Необходима авторизация" });
    }

    const productId = req.params.id;

    // Найти продукт в базе
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Товар не найден" });
    }

    // Проверка прав: админ или владелец
    const isAdmin = req.user.role === "admin";
    const isOwner = isRecordOwner(product, req.user);
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: "Доступ запрещен" });
    }

    // Удаляем изображения из Cloudinary (или локального хранилища)
    if (product.images && product.images.length > 0) {
      const deletedCount = await deleteImages(product.images);
    }

     // Полное удаление из PostgreSQL
     await Product.destroy({ where: { id: productId } });

    return res.json({ success: true, message: "Карточка успешно удалена" });
  } catch (err) {
    if (err.code === 'EBADCSRFTOKEN') {
      console.error('❌ CSRF validation failed for product deletion:', err);
      return res.status(403).json({ success: false, message: "Неверный CSRF-токен. Обновите страницу и попробуйте снова." });
    }
    console.error('❌ Ошибка удаления карточки товара:', err);
    return res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

// =======================
// API для товаров (CRUD + голосование)
// =======================

// Получить все товары
router.get("/products", apiLimiter, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });

    const { page, limit, offset } = parsePagination(req.query);
    const where = publicProductWhere();

    const { rows: products, count } = await Product.findAndCountAll({
      where,
      order: [['id', 'DESC']],
      include: [{
        model: User,
        as: 'owner',
        attributes: ['id', 'username']
      }],
      limit,
      offset,
      distinct: true
    });

    const productsWithVirtuals = products.map((row) => {
      const product = row.get ? row.get({ plain: true }) : row;
      return {
        ...product,
        result: (product.likes || 0) - (product.dislikes || 0),
        total: (product.likes || 0) + (product.dislikes || 0),
        imageUrl: product.images && product.images.length > 0 ? product.images[0] : product.image_url,
        title: product.name
      };
    });

    res.json({
      success: true,
      products: productsWithVirtuals,
      page,
      limit,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / limit))
    });
  } catch (err) {
    console.error("❌ Ошибка получения товаров:", err);
    res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

// Получить один товар
router.get("/products/:id", apiLimiter, async (req, res) => {
   try {
     if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });

     const product = await Product.findOne({
       where: { id: req.params.id, deleted: false },
       include: [{ model: User, as: 'owner', attributes: ['id', 'username'] }],
       nest: true,
       raw: true
     });
    
    if (!product) {
      return res.status(404).json({ success: false, message: "Товар не найден" });
    }

    const isAdmin = req.user?.role === 'admin';
    const ownerMatch = req.user && String(product.ownerId || product['owner.id'] || product.owner?.id || '') === String(req.user._id || req.user.id || '');
    if (product.status !== 'approved' && !isAdmin && !ownerMatch) {
      return res.status(404).json({ success: false, message: "Товар не найден" });
    }
    
    // Добавляем виртуальные поля
    const productWithVirtuals = {
      ...product,
      result: (product.likes || 0) - (product.dislikes || 0),
      total: (product.likes || 0) + (product.dislikes || 0),
      imageUrl: product.images && product.images.length > 0 ? product.images[0] : product.image_url,
      title: product.name
    };
    
    res.json({ success: true, product: productWithVirtuals });
  } catch (err) {
    console.error("❌ Ошибка получения товара:", err);
    res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

// Обновить товар (статус) — только администратор
router.put("/products/:id", apiLimiter, requireUser, csrfProtection, async (req, res) => {
   try {
     if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });

     if (req.user.role !== "admin") {
       return res.status(403).json({
         success: false,
         message: "Только администратор может менять статус карточки"
       });
     }

     const product = await Product.findByPk(req.params.id);
    if (!product || product.deleted) {
      return res.status(404).json({ success: false, message: "Товар не найден" });
    }

     const { status } = req.body;

    if (status && ["pending", "approved", "rejected", "published", "blocked"].includes(status)) {
      product.status = status;
      await product.save();
      res.json({ success: true, product });
    } else {
      res.status(400).json({ success: false, message: "Неверный статус" });
    }
  } catch (err) {
    console.error("❌ Ошибка обновления товара:", err);
    res.status(500).json({ success: false, message: "Ошибка обновления товара" });
  }
});

// Голосование за товар (уже есть в routes/api.js, но проверим)
// router.post("/products/:id/vote" - используем существующий /api/rating/:id

// =======================
// API для услуг (CRUD + голосование)
// Используем модель Product с type: "service"
// =======================

// Получить все услуги
router.get("/services", apiLimiter, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });

    const { page, limit, offset } = parsePagination(req.query);
    const where = publicServiceWhere();

    const { rows: services, count } = await Product.findAndCountAll({
      where,
      include: [{ model: User, as: "owner", attributes: ["id", "username"] }],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true
    });

    const servicesWithVirtuals = services.map((service) => {
      const plain = service.get({ plain: true });
      return {
        ...plain,
        result: (plain.likes || 0) - (plain.dislikes || 0),
        total: (plain.likes || 0) + (plain.dislikes || 0),
        imageUrl: plain.images?.length > 0 ? plain.images[0] : plain.image_url,
        title: plain.name
      };
    });

    res.json({
      success: true,
      services: servicesWithVirtuals,
      page,
      limit,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / limit))
    });
  } catch (err) {
    console.error("❌ Ошибка получения услуг:", err);
    res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

// Получить одну услугу
router.get("/services/:id", apiLimiter, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });

    if (!isValidEntityId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID услуги" });
    }

    const service = await Product.findOne({
      where: { id: req.params.id, type: "service", status: "approved", ...notDeletedClause() },
      include: [{ model: User, as: "owner", attributes: ["id", "username"] }]
    });

    if (!service) {
      return res.status(404).json({ success: false, message: "Услуга не найдена" });
    }

    const plain = service.get({ plain: true });
    res.json({
      success: true,
      service: {
        ...plain,
        result: (plain.likes || 0) - (plain.dislikes || 0),
        total: (plain.likes || 0) + (plain.dislikes || 0),
        title: plain.name
      }
    });
  } catch (err) {
    console.error("❌ Ошибка получения услуги:", err);
    res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

// Обновить услугу
router.put("/services/:id", apiLimiter, requireUser, csrfProtection, validateServiceId, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });

    const service = await Product.findOne({
      where: { id: req.params.id, type: "service", deleted: false }
    });

    if (!service) {
      return res.status(404).json({ success: false, message: "Услуга не найдена" });
    }

    const isAdmin = req.user?.role === "admin";
    if (!isAdmin && !isRecordOwner(service, req.user)) {
      return res.status(403).json({ success: false, message: "Доступ запрещен" });
    }

    const { title, description, link, video_url, category, price, images } = req.body;
    const serviceImages = Array.isArray(images)
      ? images.slice(0, 5)
      : images
        ? [images]
        : service.images || [];

    await Product.update(
      {
        name: title ? title.trim() : service.name,
        description: description !== undefined ? description.trim() : service.description,
        link: link !== undefined ? link.trim() : service.link,
        video_url: video_url !== undefined ? video_url.trim() : service.video_url,
        category: category !== undefined ? category.trim() : service.category,
        price: price !== undefined ? String(price) : service.price,
        images: serviceImages,
        image_url: serviceImages.length > 0 ? serviceImages[0] : null,
        type: "service"
      },
      { where: { id: req.params.id } }
    );

    const updated = await Product.findByPk(req.params.id);
    res.json({ success: true, service: updated });
  } catch (err) {
    console.error("❌ Ошибка обновления услуги:", err);
    res.status(500).json({ success: false, message: "Ошибка обновления услуги" });
  }
});

// Удалить услугу
router.delete("/services/:id", apiLimiter, requireUser, csrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });

    if (!isValidEntityId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID услуги" });
    }
    
    const service = await Product.findOne({
      where: { id: req.params.id, type: "service", deleted: false }
    });

    if (!service) {
      return res.status(404).json({ success: false, message: "Услуга не найдена" });
    }

     // Проверка прав: админ или владелец
     const isAdmin = req.user.role === "admin";
     
     if (!isAdmin && !isRecordOwner(service, req.user)) {
       return res.status(403).json({ success: false, message: "Доступ запрещен" });
     }
     
     // Удаляем изображения из Cloudinary
    if (service.images && service.images.length > 0) {
      const deletedCount = await deleteImages(service.images);
    } else if (service.image_url) {
      await deleteImage(service.image_url);
    }
    
    // Soft delete
     await Product.update({ deleted: true }, { where: { id: req.params.id } });
    
    
    res.json({ success: true, message: "Услуга удалена" });
  } catch (err) {
    console.error("❌ Ошибка удаления услуги:", err);
    res.status(500).json({ success: false, message: "Ошибка удаления услуги: " + err.message });
  }
});

// Голосование за услугу
router.post("/services/:id/vote", apiLimiter, ensureGuestId, csrfProtection, validateServiceId, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Рейтинг недоступен: нет БД" });

    if (!isValidEntityId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID услуги" });
    }

    const { vote } = req.body;
    if (!req.user) {
      const guestVoteCookie = req.cookies[`exto_service_vote_${req.params.id}`];
      if (guestVoteCookie) {
        return res.status(409).json({ success: false, message: "Вы уже голосовали за эту услугу" });
      }
    }

    const result = await castVote({
      targetType: 'service',
      targetId: req.params.id,
      vote,
      user: req.user,
      guestKey: req.user ? null : req.guestId
    });

    if (!result.ok) {
      return res.status(result.status || 500).json({ success: false, message: result.message });
    }

    if (!req.user) setGuestVoteCookie(res, `exto_service_vote_${req.params.id}`);

    res.json({
      success: true,
      rating_up: result.likes,
      rating_down: result.dislikes,
      total: result.total,
      result: result.result,
      voted: true
    });
  } catch (err) {
    console.error("❌ Ошибка голосования за услугу:", err);
    res.status(500).json({ success: false, message: "Ошибка голосования: " + err.message });
  }
});

// =======================
// API для комментариев
// =======================

// Подключаем роуты комментариев
const commentRoutes = require('./comments');
router.use('/comments', commentRoutes.router);

// =======================
// API для контактов
// =======================

// Получить все контакты
const ContactInfo = require("../config/database").ContactInfo;

router.get("/contacts", async (req, res) => {
  try {
     const contacts = await ContactInfo.findAll({
       order: [['type', 'ASC'], ['updatedAt', 'DESC']],
       nest: true,
       raw: true
     });

    res.json({ success: true, contacts });
  } catch (err) {
    console.error("❌ Ошибка получения контактов:", err);
    res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

// Получить контакт по ID
router.get("/contacts/:id", async (req, res) => {
  try {
    if (!isValidEntityId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID контакта" });
    }

     const contact = await ContactInfo.findByPk(req.params.id);

    if (!contact) {
      return res.status(404).json({ success: false, message: "Контакт не найден" });
    }

    res.json({ success: true, contact });
  } catch (err) {
    console.error("❌ Ошибка получения контакта:", err);
    res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

router.post("/uploads/cloudinary-sign", requireUser, apiLimiter, async (req, res) => {
  try {
    const { createUploadSignature } = require("../services/cloudinaryDirect");
    const sign = createUploadSignature();
    res.json({ success: true, ...sign });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? "Прямая загрузка изображений недоступна"
        : "Не удалось получить подпись загрузки"
    });
  }
});

// =======================
// User API Routes
// =======================
const userController = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');

// Protected route to get current user's data from database
router.get('/me', requireAuth, userController.getMe);

// =======================
// P1 API Routes
// =======================
router.use('/p1', require('./api_p1'));

module.exports = router;
