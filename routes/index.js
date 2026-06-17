const express = require("express");
const router = express.Router();
const cloudinary = require("cloudinary").v2;

const Product = require("../config/database").Product;
const Banner = require("../config/database").Banner;
const Category = require("../config/database").Category;
const User = require("../config/database").User;
const Statistics = require("../config/database").Statistics;
const { USE_POSTGRES, hasMongo, isDbConnected } = require("../config/database");
const { CATEGORY_LABELS, CATEGORY_KEYS, HIERARCHICAL_CATEGORIES } = require("../config/app");
const { requireAdmin } = require("../middleware/auth");

const CATALOG_PAGE_SIZE = 100;

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

async function resolveCategoryDisplay(selected, hasDbAccess) {
  if (!selected || selected === "all") return "all";
  if (!hasDbAccess) return selected;

  if (/^\d+$/.test(selected)) {
    try {
      const category = await Category.findByPk(parseInt(selected, 10));
      if (category?.name) return category.name;
      return "Неизвестная категория";
    } catch {
      return "Ошибка загрузки категории";
    }
  }

  return selected;
}

function applyCategoryFilter(selected, productsFilter, servicesFilter) {
  if (!selected || selected === "all") return;

  if (/^\d+$/.test(selected)) {
    const categoryId = parseInt(selected, 10);
    productsFilter.categoryId = categoryId;
    servicesFilter.categoryId = categoryId;
    return;
  }

  return Category.findOne({ where: { name: selected } }).then((category) => {
    if (category) {
      productsFilter.categoryId = category.id;
      servicesFilter.categoryId = category.id;
    }
  });
}

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

    const selectedCategoryDisplay = await resolveCategoryDisplay(selected, hasDbAccess);

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

    const productsFilter = {
      status: "approved",
      type: "product"
    };
    const servicesFilter = {
      status: "approved",
      type: "service"
    };

    await applyCategoryFilter(selected, productsFilter, servicesFilter);

    const [products, services, banners, visitors, users] = await Promise.all([
      Product.findAll({ where: productsFilter, order: [['id', 'DESC']], limit: CATALOG_PAGE_SIZE }),
      Product.findAll({ where: servicesFilter, order: [['id', 'DESC']], limit: CATALOG_PAGE_SIZE }),
      Banner.findAll({ where: { status: "approved" }, order: [['id', 'DESC']], limit: CATALOG_PAGE_SIZE }),
      Statistics.findOrCreate({
        where: { key: "visitors" },
        defaults: { key: "visitors", value: 0 }
      }).then(([row]) => row),
      User.count()
    ]);

    if (visitors) {
      await visitors.increment("value");
      await visitors.reload();
    }

    const visitorCount = visitors ? Number(visitors.value) : 0;
    const userCount = users || 0;

    const userId = (req.user?._id || req.user?.id)?.toString();
    const votedMap = {};
    [...products, ...services].forEach(p => {
      const plainP = p.get ? p.get({ plain: true }) : p;
      const cardId = (plainP._id || plainP.id)?.toString();
      if (Array.isArray(plainP.voters) && plainP.voters.map(v => String(v)).includes(userId)) {
        votedMap[cardId] = true;
      }
    });

    res.render("index", {
      products,
      services,
      banners,
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
      hierarchicalCategories: HIERARCHICAL_CATEGORIES,
      selectedCategory: selectedCategoryDisplay,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    console.error("❌ Ошибка:", err);
    res.status(500).send("Временная ошибка сервера");
  }
});

// Health-check Cloudinary (только для администраторов в production)
router.get("/__health/cloudinary", requireAdmin, async (req, res) => {
  try {
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      });
    }

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
    connected: isDbConnected()
  });
});

// Обработчик для Chrome DevTools и других .well-known запросов
router.get("/.well-known/*", (req, res) => {
  res.status(404).send("Not Found");
});

module.exports = router;
