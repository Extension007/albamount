// FIX: Контроллер для обработки товаров - С САНИТИЗАЦИЕЙ
const Product = require("../models/Product");
const Category = require("../models/Category");
const { deleteImages } = require("../utils/imageUtils");
const { sanitizeProductDescription, sanitizeContacts, sanitizeText } = require("../utils/sanitize");
const { notifyAdmin } = require("../services/adminNotificationService");

// FIX: Получение всех товаров для отображения
exports.getAllProducts = async (req, res, next) => {
  try {
    const products = await Product.findAll({
      where: { status: "approved", deleted: false },
      include: [
        { model: require("../models/User"), as: "owner", attributes: ["id", "username"] },
        { model: Category, as: "categoryRel", attributes: ["id", "name", "icon"] }
      ],
      order: [["createdAt", "DESC"]]
    });

    // Получаем дерево категорий для товаров
    const categoryTree = await Category.getTree('product');
    const categoryFlat = await Category.getFlatList('product');

    res.render('index', {
      products,
      isAuth: !!req.user,
      isAdmin: req.user?.role === 'admin',
      categories: categoryFlat, // Новая система категорий
      hierarchicalCategories: categoryTree, // Дерево категорий
      selectedCategory: req.query.category || 'all',
      votedMap: {}
    });
  } catch (err) {
    next(err);
  }
};

// FIX: Получение формы добавления товара
exports.getAddForm = (req, res) => {
  res.render('products/add', {
    isAuth: !!req.user,
    isAdmin: req.user?.role === 'admin'
  });
};

// FIX: Создание нового товара
exports.createProduct = async (req, res, next) => {
  try {
    // FIX: Валидация и санитизация данных
    const { name, title, description, phone, email, telegram, whatsapp, price, link, video_url, category } = req.body;

    // Валидация категории
    if (category) {
      // Проверяем, является ли категория ObjectId (новая система)
       if (/^[a-f0-9]{32,}$/i.test(category)) {
         const categoryExists = await Category.findByPk(category);
        if (!categoryExists) {
          return res.status(400).json({ success: false, message: "Категория не найдена" });
        }
      } else {
        // Для обратной совместимости - проверяем старые строковые категории
        const validCategories = require("../config/categories").CATEGORY_KEYS;
        if (!validCategories.includes(category)) {
          return res.status(400).json({ success: false, message: "Некорректная категория" });
        }
      }
    }

    // FIX: Поддержка старого формата с title для обратной совместимости
    const productName = name || title;

    if (!productName || !productName.trim()) {
      return res.status(400).json({ success: false, message: "Название товара обязательно" });
    }

    const priceNum = Number(price);
    if (!priceNum || priceNum < 0) {
      return res.status(400).json({ success: false, message: "Некорректная цена" });
    }

    // FIX: Обработка загруженных изображений
    let images = [];
    if (req.files && req.files.length > 0) {
      if (req.files.length > 5) {
        return res.status(400).json({ success: false, message: "Максимальное количество изображений: 5" });
      }

      req.files.forEach(file => {
        if (file.path && !file.path.startsWith('http')) {
          images.push('/uploads/' + file.filename);
        } else {
          images.push(file.path);
        }
      });
    }

    // FIX: Проверка лимита изображений
    if (images.length > 5) {
      return res.status(400).json({ success: false, message: "Максимальное количество изображений: 5" });
    }

    // FIX: Проверка дублирования изображений
    const uniqueImages = [...new Set(images)];
    if (uniqueImages.length !== images.length) {
      return res.status(400).json({ success: false, message: "Обнаружены дублирующиеся изображения" });
    }

    // FIX: САНИТИЗАЦИЯ ДАННЫХ
    const sanitizedDescription = sanitizeProductDescription(description);
    const sanitizedContacts = sanitizeContacts({
      phone,
      email,
      telegram,
      whatsapp
    });
    const sanitizedLink = link ? sanitizeText(link, 500) : "";
    const sanitizedVideoUrl = video_url ? sanitizeText(video_url, 500) : "";

    // P1: Enforcement rules
    const { assertVerified, consumeSlotOrThrow } = require('../services/p1Rules');
    const User = require('../models/User');

    // P1: Check if user is verified
    if (req.user) {
      assertVerified(req.user);

      // P1: Consume slot for user creation
      await consumeSlotOrThrow(User, req.user._id);
    }

    // FIX: Создаем товар с санитизированными данными
    const productData = {
      name: productName.trim(),
      description: sanitizedDescription,
      price: priceNum,
      link: sanitizedLink,
      video_url: sanitizedVideoUrl,
      images: uniqueImages,
      contacts: sanitizedContacts,
      category: category || "home",
      ownerId: req.user?._id || null,
      status: req.user?.role === 'admin' ? "approved" : "pending",
      tier: 'free',
      tierRequested: 'free',
      editCount: 0,
      paymentStatus: 'none'
    };

    const product = await Product.create(productData);

     // Отправляем уведомление администратору о новом товаре
     try {
       await notifyAdmin(
         'Новый товар добавлен',
         `Добавлен новый товар и отправлен на модерацию.`,
         {
           'Название': product.name,
           'Категория': product.category,
           'Цена': product.price,
           'Статус': product.status,
           'ID товара': product.id.toString(),
           'Владелец': product.owner ? product.owner.toString() : 'Администратор'
         }
       );
     } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

    res.json({ success: true, product });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};

// FIX: Получение формы редактирования товара
exports.getEditForm = async (req, res, next) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).send("Товар не найден");
    }

    // FIX: Проверка прав доступа
    const isOwner = req.user && product.ownerId && product.ownerId.toString() === req.user._id.toString();
    const isAdmin = req.user && req.user.role === 'admin';
    
    if (!isOwner && !isAdmin) {
      return res.status(403).send("У вас нет прав на редактирование этого товара");
    }

    res.render('products/edit', {
      product,
      isAuth: !!req.user,
      isAdmin: req.user?.role === 'admin'
    });
  } catch (err) {
    next(err);
  }
};

// FIX: Обновление товара
exports.updateProduct = async (req, res, next) => {
  try {
    const { name, title, description, phone, email, telegram, whatsapp, price, link, video_url, category, current_images } = req.body;
    
    // Валидация категории, если она передана
    if (category) {
      // Проверяем, является ли категория ObjectId (новая система)
       if (/^[a-f0-9]{32,}$/i.test(category)) {
         const categoryExists = await Category.findByPk(category);
        if (!categoryExists) {
          return res.status(400).json({ success: false, message: "Категория не найдена" });
        }
      } else {
        // Для обратной совместимости - проверяем старые строковые категории
        const validCategories = require("../config/categories").CATEGORY_KEYS;
        if (!validCategories.includes(category)) {
          return res.status(400).json({ success: false, message: "Некорректная категория" });
        }
      }
    }
    
    // FIX: Поддержка старого формата с title для обратной совместимости
    const productName = name || title;
    
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Товар не найден" });
    }

    // FIX: Проверка прав доступа
    const isOwner = req.user && product.ownerId && product.ownerId.toString() === req.user._id.toString();
    const isAdmin = req.user && req.user.role === 'admin';
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "У вас нет прав на редактирование этого товара" });
    }

    // FIX: Валидация
    if (!productName || !productName.trim()) {
      return res.status(400).json({ success: false, message: "Название товара обязательно" });
    }

    const priceNum = Number(price);
    if (!priceNum || priceNum < 0) {
      return res.status(400).json({ success: false, message: "Некорректная цена" });
    }

    // FIX: Обработка изображений
    const oldImages = product.images || [];
    let newImages = [];
    
    // FIX: Безопасная обработка current_images
    if (current_images) {
      try {
        let parsedImages = [];
        if (typeof current_images === 'string') {
          parsedImages = JSON.parse(current_images);
        } else if (Array.isArray(current_images)) {
          parsedImages = current_images;
        }
        
        newImages = parsedImages
          .filter(img => img && typeof img === 'string' && img.trim().length > 0)
          .map(img => img.trim())
          .slice(0, 5);
        
      } catch (e) {
        console.warn("⚠️  Ошибка парсинга current_images:", e.message);
        newImages = [...oldImages];
      }
    } else {
      newImages = [...oldImages];
    }

    // FIX: Добавляем новые загруженные изображения
    if (req.files && req.files.length > 0) {
      const uploadedImages = req.files
        .filter(file => file && file.filename)
        .map(file => {
          if (file.path && !file.path.startsWith('http')) {
            return '/uploads/' + file.filename;
          } else {
            return file.path;
          }
        });

      const allImages = [...newImages, ...uploadedImages];
      const uniqueImages = [...new Set(allImages)];
      
      if (uniqueImages.length > 5) {
        return res.status(400).json({ success: false, message: "Максимальное количество изображений: 5" });
      }

      newImages = uniqueImages;
    }

    // FIX: Проверка лимита
    if (newImages.length > 5) {
      return res.status(400).json({ success: false, message: "Максимальное количество изображений: 5" });
    }

    // FIX: Находим изображения для удаления
    const imagesToDelete = oldImages.filter(oldImg => {
      const existsInNew = newImages.some(newImg =>
        String(oldImg).trim() === String(newImg).trim()
      );
      return !existsInNew;
    });
    
     // Удаляем изображения из хранилища
     if (imagesToDelete.length > 0) {
       try {
         const deletedCount = await deleteImages(imagesToDelete);
         if (deletedCount < imagesToDelete.length) {
           console.warn(`⚠️  Для карточки ${product.id}: не все изображения удалены (${deletedCount}/${imagesToDelete.length})`);
         }
       } catch (err) {
         console.error(`❌ Ошибка удаления изображений при редактировании карточки ${product.id}:`, err);
       }
     }

    // FIX: САНИТИЗАЦИЯ ДАННЫХ
    const sanitizedDescription = sanitizeProductDescription(description);
    const sanitizedContacts = sanitizeContacts({
      phone,
      email,
      telegram,
      whatsapp
    });
    const sanitizedLink = link ? sanitizeText(link, 500) : "";
    const sanitizedVideoUrl = video_url ? sanitizeText(video_url, 500) : "";

    // P1: Enforcement rules for editing
    const { assertVerified, assertEditAllowed } = require('../services/p1Rules');

    // P1: Check if user is verified
    if (req.user) {
      assertVerified(req.user);

      // P1: Check edit limit
      assertEditAllowed(product);

      // P1: Increment edit count
      product.editCount = Number(product.editCount || 0) + 1;
    }

    // FIX: Обновляем товар с санитизированными данными
    const updateData = {
      name: productName.trim(),
      description: sanitizedDescription,
      price: priceNum,
      link: sanitizedLink,
      video_url: sanitizedVideoUrl,
      images: newImages,
      contacts: sanitizedContacts,
      status: "pending",
      editCount: product.editCount
    };

    if (category) {
      updateData.category = category;
    }

     Object.assign(product, updateData);

     console.log(`✅ Обновление карточки ${product.id}: статус установлен в "pending", изображений: ${newImages.length}`);

     await product.save();

    res.json({ success: true, product });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};
