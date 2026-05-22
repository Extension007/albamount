const express = require("express");
const router = express.Router();

const Product = require("../config/database").Product;
const Banner = require("../config/database").Banner;
const Category = require("../config/database").Category;
const User = require("../config/database").User;
const { USE_POSTGRES, hasMongo } = require("../config/database");
const { CATEGORY_LABELS, CATEGORY_KEYS, HIERARCHICAL_CATEGORIES } = require("../config/app");

// Авторизация
router.use("/", require("./auth"));

// API
router.use("/api", require("./api"));

// Кабинет пользователя
router.use("/cabinet", require("./cabinet"));

// Админ-панель
router.use("/admin", require("./admin"));

// API для категорий
router.use("/api/categories", require("./categories"));

// Страницы с вкладками
router.use("/products", require("./products"));
router.use("/services", require("./services"));
router.use("/ad", require("./ad"));
router.use("/about", require("./about"));
router.use("/contacts", require("./contacts"));
router.use("/videos", require("./videos"));

// Главная страница — каталог
router.get("/", async (req, res) => {
  try {
    const isAuth = Boolean(req.user);
    const userRole = req.user?.role || null;
    const isAdmin = userRole === "admin";
    const isUser = userRole === "user";
    const selected = req.query.category;

    const categories = CATEGORY_LABELS || {};
    const categoryKeys = CATEGORY_KEYS || [];

    const isVercel = Boolean(process.env.VERCEL);
    const hasDbAccess = isVercel ? req.dbConnected : USE_POSTGRES;

     console.log('🔧 Отладка категории:', {
       selected,
       isVercel,
       hasDbAccess,
        isValidObjectId: selected ? /^\d+$/.test(selected) : false
     });

      // Определяем отображаемое название выбранной категории
      let selectedCategoryDisplay = selected || "all";
      if (selected && selected !== 'all') {
        // Проверяем, является ли selected numeric ID (новые целочисленные ID категорий)
        // Если да, то ищем категорию по ID
        if (/^\d+$/.test(selected)) {
          console.log('📝 Selected является numeric ID категории:', selected);
          if (hasDbAccess) {
            try {
              console.log('🔍 Ищем категорию по ID:', selected);
              const category = await Category.findByPk(parseInt(selected, 10));
              console.log('📋 Найденная категория:', category ? category.toJSON() : null);
              if (category && category.name) {
                selectedCategoryDisplay = category.name;
                console.log('✅ Используем название категории:', selectedCategoryDisplay);
              } else {
                console.warn('⚠️ Категория не найдена или без названия');
                selectedCategoryDisplay = "Неизвестная категория";
              }
            } catch (err) {
              console.warn('❌ Ошибка поиска категории:', selected, err.message);
              selectedCategoryDisplay = "Ошибка загрузки категории";
            }
          }
        } else {
          // Если это название категории (старый формат), используем напрямую
          selectedCategoryDisplay = selected;
        }
      } else {
        console.log('⏭️ Нет доступа к БД, оставляем ID');
        selectedCategoryDisplay = "Категория"; // Fallback когда нет доступа к БД
      }
    console.log('📝 Финальное selectedCategoryDisplay:', selectedCategoryDisplay);

    if (!hasDbAccess) {
      return res.render("index", {
        products: [],
        services: [],
        banners: [],
        visitorCount: 0,
        userCount: 0,
        page: 1,
        totalPages: 1,
        isAuth,
        isAdmin,
        isUser,
        userRole,
        user: req.user,
        votedMap: {},
        categories,
        hierarchicalCategories: HIERARCHICAL_CATEGORIES,
        selectedCategory: selectedCategoryDisplay,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    }

    // Фильтры
    const productsFilter = {
      status: "approved",
      type: "product"
    };
    const servicesFilter = {
      status: "approved",
      type: "service"
    };

    if (selected && selected !== 'all') {
      // Если выбранная категория - это ObjectId, используем categoryId напрямую
       if (/^[a-f0-9]{32,}$/i.test(selected)) {
        productsFilter.categoryId = selected;
        servicesFilter.categoryId = selected;
      } else {
        // Если это название категории, найдем ее ID
        try {
          console.log('🔍 Ищем ID категории по названию:', selected);
          const category = await Category.findOne({ where: { name: selected } });
          if (category) {
            console.log('✅ Найден ID категории:', category.id);
            productsFilter.categoryId = category.id;
            servicesFilter.categoryId = category.id;
          } else {
            console.warn('⚠️ Категория с названием не найдена:', selected);
            // Не применяем фильтр, показываем все товары
          }
        } catch (err) {
          console.warn('❌ Ошибка поиска категории по названию:', selected, err.message);
          // Не применяем фильтр, показываем все товары
        }
      }
    }

    // Запросы
    const [products, services, banners, visitors, users] = await Promise.all([
      Product.findAll({ where: productsFilter, order: [['id', 'DESC']], limit: 5000 }),
      Product.findAll({ where: servicesFilter, order: [['id', 'DESC']], limit: 5000 }),
      Banner.findAll({ where: { status: "approved" }, order: [['id', 'DESC']], limit: 5000 }),
      Statistics.findOne({ where: { key: "visitors" } }),
      User.count()
    ]);

    if (visitors) {
      await visitors.increment('value');
    }

    const visitorCount = visitors ? visitors.value : 0;
    const userCount = users || 0;

    const userId = req.user?.id?.toString();
    const votedMap = {};
    [...products, ...services].forEach(p => {
      const plainP = p.get ? p.get({ plain: true }) : p;
      if (Array.isArray(plainP.voters) && plainP.voters.map(v => String(v)).includes(userId)) {
        votedMap[plainP.id?.toString()] = true;
      }
    });

    res.render("index", {
      products: products.map(p => p.get ? p.get({ plain: true }) : p),
      services: services.map(s => s.get ? s.get({ plain: true }) : s),
      banners: banners.map(b => b.get ? b.get({ plain: true }) : b),
      visitorCount,
      userCount,
      page: 1,
      totalPages: 1,
      isAuth,
      isAdmin,
      isUser,
      userRole,
      user: req.user,
      votedMap,
      categories,
      selectedCategory: selectedCategoryDisplay,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    console.error("❌ Ошибка:", err);
    res.status(500).send("Временная ошибка сервера");
  }
});

// Health-check Cloudinary
router.get("/__health/cloudinary", async (req, res) => {
  try {
    await cloudinary.api.ping();
    res.json({ ok: true, status: "ok" });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Health-check
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    database: hasMongo() ? "configured" : "missing",
    connected: Boolean(req.dbConnected)
  });
});

// Обработчик для Chrome DevTools и других .well-known запросов
router.get("/.well-known/*", (req, res) => {
  res.status(404).send("Not Found");
});

module.exports = router;
