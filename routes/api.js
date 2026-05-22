// API роуты (рейтинг, Instagram oEmbed, удаление изображений)
const express = require("express");
const router = express.Router();
const { Product, Banner, User } = require("../config/database");
const { Sequelize, Op } = require("../config/database");
const { USE_POSTGRES } = require("../config/database");
const { apiLimiter } = require("../middleware/rateLimiter");
const { validateRating, validateProductId, validateServiceId, validateBannerId, validateInstagramUrl } = require("../middleware/validators");
const csrfProtection = require('csurf')({ cookie: true });
const { deleteImage, deleteImages } = require("../utils/imageUtils");
const { isValidCardId } = require("../utils/idValidation");
const { requireUser } = require("../middleware/auth");

// Голосование (унифицированный формат: vote: "up"/"down")
// Поддерживает обратную совместимость с value: "like"/"dislike"
router.post("/rating/:id", apiLimiter, csrfProtection, validateProductId, validateRating, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Рейтинг недоступен: нет БД" });
    
    // Поддержка нового формата (vote: "up"/"down") и старого (value: "like"/"dislike")
    const vote = req.body.vote || (req.body.value === "like" ? "up" : req.body.value === "dislike" ? "down" : null);
    if (!vote || (vote !== "up" && vote !== "down")) {
      return res.status(400).json({ success: false, message: "Неверное значение vote. Используйте 'up' или 'down'" });
    }
    
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Товар не найден" });

    // Проверяем, голосовал ли уже
    if (req.user) {
     const userId = req.user._id.toString();
     const already = (product.voters || []).includes(userId);
      if (already) {
        return res.status(409).json({ success: false, message: "Вы уже голосовали за этот товар" });
      }
    } else {
      const guestVoteCookie = req.cookies[`exto_vote_${req.params.id}`];
      if (guestVoteCookie) {
        return res.status(409).json({ success: false, message: "Вы уже голосовали за этот товар" });
      }
    }

    // Обновляем рейтинг (используем likes/dislikes для обратной совместимости)
    if (vote === "up") product.likes = (product.likes || 0) + 1;
    else if (vote === "down") product.dislikes = (product.dislikes || 0) + 1;

     product.rating_updated_at = Date.now();

      if (req.user) {
        product.voters = product.voters || [];
        product.voters.push(req.user._id);
      }

      await product.save();

    // Для гостей устанавливаем cookie
    if (!req.user) {
      res.cookie(`exto_vote_${req.params.id}`, '1', {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    }

    res.json({
      success: true,
      rating_up: product.likes,
      rating_down: product.dislikes,
      likes: product.likes, // Для обратной совместимости
      dislikes: product.dislikes, // Для обратной совместимости
      total: (product.likes || 0) + (product.dislikes || 0),
      result: (product.likes || 0) - (product.dislikes || 0),
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
    
     if (!/^[a-f0-9]{32,}$/i.test(productId)) {
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
     const isOwner = product.owner && product.owner.toString() === req.user._id.toString();
     
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

    if (!isValidCardId(req.params.id)) {
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
    const isOwner = product.owner && product.owner.toString() === req.user._id.toString();
    
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
    
    const products = await Product.findAll({
      where: {
        [Op.or]: [
          { type: "product" },
          { type: null }
        ],
        status: "approved",
        deleted: false
      },
      order: [['id', 'DESC']],
      include: [{
        model: User,
        as: 'owner',
        attributes: ['id', 'username', 'email']
      }],
      nest: true,
      raw: true
    });
    
    // Добавляем виртуальные поля
    const productsWithVirtuals = products.map(product => ({
      ...product,
      result: (product.likes || 0) - (product.dislikes || 0),
      total: (product.likes || 0) + (product.dislikes || 0),
      imageUrl: product.images && product.images.length > 0 ? product.images[0] : product.image_url,
      title: product.name // Для совместимости с API
    }));
    
    res.json({ success: true, products: productsWithVirtuals });
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
       include: [{ model: User, as: 'owner', attributes: ['id', 'username', 'email'] }],
       nest: true,
       raw: true
     });
    
    if (!product) {
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

// Обновить товар (статус)
router.put("/products/:id", apiLimiter, requireUser, csrfProtection, async (req, res) => {
   try {
     if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });

     const product = await Product.findByPk(req.params.id);
    if (!product || product.deleted) {
      return res.status(404).json({ success: false, message: "Товар не найден" });
    }
    
     // Проверка прав: админ или владелец
     const isAdmin = req.user.role === "admin";
     const isOwner = product.owner && product.owner.toString() === req.user._id.toString();
     
     if (!isAdmin && !isOwner) {
       return res.status(403).json({ success: false, message: "Доступ запрещен" });
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
    res.status(500).json({ success: false, message: "Ошибка обновления товара: " + err.message });
  }
});

// Голосование за товар (уже есть в routes/api.js, но проверим)
// router.post("/products/:id/vote" - используем существующий /api/rating/:id

// =======================
// API для баннеров (CRUD + голосование)
// =======================

// Получить все баннеры
router.get("/banners", apiLimiter, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });
    
     const banners = await Banner.findAll({
       where: { status: "published" },
       order: [['id', 'DESC']],
       include: [{ model: User, as: 'owner', attributes: ['id', 'username', 'email'] }],
       nest: true,
       raw: true
     });
    
    // Добавляем виртуальные поля
    const bannersWithVirtuals = banners.map(banner => ({
      ...banner,
      result: (banner.rating_up || 0) - (banner.rating_down || 0),
      total: (banner.rating_up || 0) + (banner.rating_down || 0),
      imageUrl: banner.images && banner.images.length > 0 ? banner.images[0] : banner.image_url
    }));
    
    res.json({ success: true, banners: bannersWithVirtuals });
  } catch (err) {
    console.error("❌ Ошибка получения баннеров:", err);
    res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

// Получить один баннер
router.get("/banners/:id", apiLimiter, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });
    
    if (!isValidCardId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID баннера" });
    }
    
     const banner = await Banner.findByPk(req.params.id, {
       include: [{ model: User, as: 'owner', attributes: ['id', 'username', 'email'] }],
       nest: true,
       raw: true
     });
    
    if (!banner) {
      return res.status(404).json({ success: false, message: "Баннер не найден" });
    }
    
    // Добавляем виртуальные поля
    const bannerWithVirtuals = {
      ...banner,
      result: (banner.rating_up || 0) - (banner.rating_down || 0),
      total: (banner.rating_up || 0) + (banner.rating_down || 0),
      imageUrl: banner.images && banner.images.length > 0 ? banner.images[0] : banner.image_url
    };
    
    res.json({ success: true, banner: bannerWithVirtuals });
  } catch (err) {
    console.error("❌ Ошибка получения баннера:", err);
    res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

// Создать баннер
router.post("/banners", apiLimiter, requireUser, csrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });
    
    const { title, description, link, video_url, owner, category, price, status, images } = req.body;
    
    // Валидация
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Название баннера обязательно" });
    }
    
    // Ограничиваем количество изображений до 5
    const bannerImages = Array.isArray(images) ? images.slice(0, 5) : (images ? [images] : []);
    
     const bannerData = {
       title: title.trim(),
       description: description ? description.trim() : "",
       link: link ? link.trim() : "",
       video_url: video_url ? video_url.trim() : "",
       owner: owner || req.user._id,
       category: category ? category.trim() : "",
       price: price ? Number(price) : 0,
       status: status || "published",
       images: bannerImages,
      image_url: bannerImages.length > 0 ? bannerImages[0] : null,
      rating_up: 0,
      rating_down: 0
    };
    
    const banner = await Banner.create(bannerData);
    
    
    res.json({ success: true, banner });
  } catch (err) {
    console.error("❌ Ошибка создания баннера:", err);
    res.status(500).json({ success: false, message: "Ошибка создания баннера: " + err.message });
  }
});

// Обновить баннер
router.put("/banners/:id", apiLimiter, requireUser, csrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });
    
    if (!isValidCardId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID баннера" });
    }
    
    const banner = await Banner.findByPk(req.params.id);;
    if (!banner) {
      return res.status(404).json({ success: false, message: "Баннер не найден" });
    }
    
     // Проверка прав: админ или владелец
     const isAdmin = req.user.role === "admin";
     const isOwner = banner.owner && banner.owner.toString() === req.user._id.toString();
     
     if (!isAdmin && !isOwner) {
       return res.status(403).json({ success: false, message: "Доступ запрещен" });
     }
     
     const { title, description, link, video_url, owner, category, price, status, images } = req.body;
    
    // Ограничиваем количество изображений до 5
    const bannerImages = Array.isArray(images) ? images.slice(0, 5) : (images ? [images] : banner.images);

    const updateData = {
      title: title ? title.trim() : banner.title,
      description: description !== undefined ? description.trim() : banner.description,
      link: link !== undefined ? link.trim() : banner.link,
      video_url: video_url !== undefined ? video_url.trim() : banner.video_url,
      category: category !== undefined ? category.trim() : banner.category,
      price: price !== undefined ? Number(price) : banner.price,
      status: status || banner.status,
      images: bannerImages,
      image_url: bannerImages.length > 0 ? bannerImages[0] : null
    };
    
     const updated = await Banner.update(updateData, { where: { id: req.params.id }, returning: true });
     const updatedBanner = await Banner.findByPk(req.params.id);
     
     res.json({ success: true, banner: updatedBanner });
  } catch (err) {
    console.error("❌ Ошибка обновления баннера:", err);
    res.status(500).json({ success: false, message: "Ошибка обновления баннера: " + err.message });
  }
});

// Удалить баннер
router.delete("/banners/:id", apiLimiter, requireUser, csrfProtection, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });
    
    if (!isValidCardId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID баннера" });
    }
    
    const banner = await Banner.findByPk(req.params.id);;
    if (!banner) {
      return res.status(404).json({ success: false, message: "Баннер не найден" });
    }
    
     // Проверка прав: админ или владелец
     const isAdmin = req.user.role === "admin";
     const isOwner = banner.owner && banner.owner.toString() === req.user._id.toString();
     
     if (!isAdmin && !isOwner) {
       return res.status(403).json({ success: false, message: "Доступ запрещен" });
     }
     
     // Удаляем изображения из Cloudinary
    if (banner.images && banner.images.length > 0) {
      const deletedCount = await deleteImages(banner.images);
    } else if (banner.image_url) {
      await deleteImage(banner.image_url);
    }
    
    await Banner.destroy({ where: { id: req.params.id } });
    
    
    res.json({ success: true, message: "Баннер удален" });
  } catch (err) {
    console.error("❌ Ошибка удаления баннера:", err);
    res.status(500).json({ success: false, message: "Ошибка удаления баннера: " + err.message });
  }
});

// Голосование за баннер
router.post("/banners/:id/vote", apiLimiter, csrfProtection, validateBannerId, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Рейтинг недоступен: нет БД" });
    
    if (!isValidCardId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID баннера" });
    }
    
    const { vote } = req.body; // "up" или "down"
    const banner = await Banner.findByPk(req.params.id);;
    
    if (!banner) {
      return res.status(404).json({ success: false, message: "Баннер не найден" });
    }
    
     // Добавляем виртуальные поля
     const voters = product.voters || [];
     const already = req.user ? voters.includes(req.user._id) : false;
    if (already) {
      return res.status(409).json({ success: false, message: "Вы уже голосовали за этот товар" });
    } else if (!req.user) {
      const guestVoteCookie = req.cookies[`exto_banner_vote_${req.params.id}`];
      if (guestVoteCookie) {
        return res.status(409).json({ success: false, message: "Вы уже голосовали за этот баннер" });
      }
    }
    
    // Обновляем рейтинг
    if (vote === "up") {
      banner.rating_up = (banner.rating_up || 0) + 1;
    } else if (vote === "down") {
      banner.rating_down = (banner.rating_down || 0) + 1;
    } else {
      return res.status(400).json({ success: false, message: "Неверное значение vote. Используйте 'up' или 'down'" });
    }
    
     banner.rating_updated_at = Date.now();
     
     if (req.user) {
       banner.voters = banner.voters || [];
       banner.voters.push(req.user._id);
     }

     await banner.save();
    
    // Для гостей устанавливаем cookie
    if (!req.user) {
      res.cookie(`exto_banner_vote_${req.params.id}`, '1', {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    }
    
    res.json({
      success: true,
      rating_up: banner.rating_up,
      rating_down: banner.rating_down,
      total: banner.rating_up + banner.rating_down,
      result: banner.rating_up - banner.rating_down,
      voted: true
    });
  } catch (err) {
    console.error("❌ Ошибка голосования за баннер:", err);
    res.status(500).json({ success: false, message: "Ошибка голосования: " + err.message });
  }
});

// =======================
// API для услуг (CRUD + голосование)
// Используем модель Product с type: "service"
// =======================

// Получить все услуги
router.get("/services", apiLimiter, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });
    
    const services = await Product.findAll({
      where: {
        type: "service",
        status: "approved",
        deleted: false
      },
      include: [{ model: User, as: "owner", attributes: ["id", "username", "email"] }],
      order: [["createdAt", "DESC"]]
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
    
    res.json({ success: true, services: servicesWithVirtuals });
  } catch (err) {
    console.error("❌ Ошибка получения услуг:", err);
    res.status(500).json({ success: false, message: "Ошибка сервера" });
  }
});

// Получить одну услугу
router.get("/services/:id", apiLimiter, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Недоступно: нет БД" });

    if (!/^[a-f0-9]{32,}$/i.test(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID услуги" });
    }

    const service = await Product.findOne({
      where: { id: req.params.id, type: "service", deleted: false, status: "approved" },
      include: [{ model: User, as: "owner", attributes: ["id", "username", "email"] }]
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
    const isOwner = service.ownerId === req.user._id;
    if (!isAdmin && !isOwner) {
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

    if (!/^[a-f0-9]{32,}$/i.test(req.params.id)) {
      return res.status(400).json({ success: false, message: "Неверный формат ID услуги" });
    }
    
    const service = await Product.findOne({
      where: { id: req.params.id, type: "service", deleted: false },
      nest: true,
      raw: true
    });

    if (!service) {
      return res.status(404).json({ success: false, message: "Услуга не найдена" });
    }

     // Проверка прав: админ или владелец
     const isAdmin = req.user.role === "admin";
     const isOwner = service.ownerId === req.user._id;
     
     if (!isAdmin && !isOwner) {
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
router.post("/services/:id/vote", apiLimiter, csrfProtection, validateServiceId, async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).json({ success: false, message: "Рейтинг недоступен: нет БД" });
    
     if (!/^[a-f0-9]{32,}$/i.test(req.params.id)) {
       return res.status(400).json({ success: false, message: "Неверный формат ID услуги" });
     }
     
     const { vote } = req.body; // "up" или "down"
     const service = await Product.findOne({
       where: { id: req.params.id, type: "service", deleted: false },
       nest: true,
       raw: true
     });

     if (!service) {
       return res.status(404).json({ success: false, message: "Услуга не найдена" });
     }

         // Проверяем, голосовал ли уже
         if (req.user) {
           const userId = req.user._id.toString();
           const already = (service.voters || []).map(v => v.toString()).includes(userId);
           if (already) {
             return res.status(409).json({ success: false, message: "Вы уже голосовали за эту услугу" });
           }
         } else {
           const guestVoteCookie = req.cookies[`exto_service_vote_${req.params.id}`];
           if (guestVoteCookie) {
             return res.status(409).json({ success: false, message: "Вы уже голосовали за эту услугу" });
           }
         }
    
    // Обновляем рейтинг
    if (vote === "up") {
      service.likes = (service.likes || 0) + 1;
    } else if (vote === "down") {
      service.dislikes = (service.dislikes || 0) + 1;
    } else {
      return res.status(400).json({ success: false, message: "Неверное значение vote. Используйте 'up' или 'down'" });
    }
    
     service.rating_updated_at = Date.now();
     
     if (req.user) {
       service.voters = service.voters || [];
       service.voters.push(req.user._id);
     }

     await service.save();
    
    // Для гостей устанавливаем cookie
    if (!req.user) {
      res.cookie(`exto_service_vote_${req.params.id}`, '1', {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    }
    
    res.json({
      success: true,
      rating_up: service.likes,
      rating_down: service.dislikes,
      total: service.likes + service.dislikes,
      result: service.likes - service.dislikes,
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
    if (!isValidCardId(req.params.id)) {
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
