const express = require("express");
const router = express.Router();
const cloudinary = require("cloudinary").v2;

const Product = require("../config/database").Product;
const Banner = require("../config/database").Banner;
const Category = require("../config/database").Category;
const User = require("../config/database").User;
const Statistics = require("../config/database").Statistics;
const { USE_POSTGRES, isDatabaseConfigured, isDbConnected, Op } = require("../config/database");
const { CATEGORY_LABELS, CATEGORY_KEYS, HIERARCHICAL_CATEGORIES } = require("../config/app");
const { requireAdmin } = require("../middleware/auth");
const { buildVotedMap } = require("../services/voteService");

const CATALOG_PAGE_SIZE = 24;

// Buffer visitor increments to reduce write amplification
let visitorBuffer = 0;
let visitorFlushTimer = null;
async function bumpVisitorCounter() {
  visitorBuffer += 1;
  if (visitorBuffer >= 10) {
    await flushVisitorBuffer();
    return;
  }
  if (!visitorFlushTimer) {
    visitorFlushTimer = setTimeout(() => {
      flushVisitorBuffer().catch(() => {});
    }, 15000);
    if (visitorFlushTimer.unref) visitorFlushTimer.unref();
  }
}
async function flushVisitorBuffer() {
  const n = visitorBuffer;
  visitorBuffer = 0;
  if (visitorFlushTimer) {
    clearTimeout(visitorFlushTimer);
    visitorFlushTimer = null;
  }
  if (n <= 0) return;
  try {
    const [row] = await Statistics.findOrCreate({
      where: { key: "visitors" },
      defaults: { key: "visitors", value: 0 }
    });
    await row.increment("value", { by: n });
  } catch (err) {
    console.warn("visitor flush failed:", err.message);
  }
}

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
      type: "product",
      deleted: false
    };
    const servicesFilter = {
      status: "approved",
      type: "service",
      deleted: false
    };

    await applyCategoryFilter(selected, productsFilter, servicesFilter);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * CATALOG_PAGE_SIZE;

    const [products, services, banners, productCount, serviceCount, visitorsRow, users] = await Promise.all([
      Product.findAll({ where: productsFilter, order: [['id', 'DESC']], limit: CATALOG_PAGE_SIZE, offset }),
      Product.findAll({ where: servicesFilter, order: [['id', 'DESC']], limit: CATALOG_PAGE_SIZE, offset }),
      Banner.findAll({
        where: { status: { [Op.in]: ["approved", "published"] } },
        order: [['id', 'DESC']],
        limit: CATALOG_PAGE_SIZE
      }),
      Product.count({ where: productsFilter }),
      Product.count({ where: servicesFilter }),
      Statistics.findOrCreate({
        where: { key: "visitors" },
        defaults: { key: "visitors", value: 0 }
      }).then(([row]) => row),
      User.count()
    ]);

    await bumpVisitorCounter();
    const visitorCount = visitorsRow ? Number(visitorsRow.value) + visitorBuffer : visitorBuffer;
    const userCount = users || 0;
    const totalPages = Math.max(1, Math.ceil(Math.max(productCount, serviceCount) / CATALOG_PAGE_SIZE));

    const productVoted = await buildVotedMap({
      user: req.user,
      targetType: 'product',
      targetIds: products.map((p) => p.id)
    });
    const serviceVoted = await buildVotedMap({
      user: req.user,
      targetType: 'service',
      targetIds: services.map((p) => p.id)
    });
    const votedMap = { ...productVoted, ...serviceVoted };

    // Fallback to legacy voters arrays for pre-migration votes
    [...products, ...services].forEach((p) => {
      const plainP = p.get ? p.get({ plain: true }) : p;
      const cardId = (plainP._id || plainP.id)?.toString();
      const userId = (req.user?._id || req.user?.id)?.toString();
      if (userId && Array.isArray(plainP.voters) && plainP.voters.map(v => String(v)).includes(userId)) {
        votedMap[cardId] = true;
      }
    });

    res.render("index", {
      products,
      services,
      banners,
      visitorCount,
      userCount,
      page,
      totalPages,
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
  const configured = isDatabaseConfigured();
  const connected = isDbConnected();
  const ok = !configured || connected;
  res.status(ok ? 200 : 503).json({
    ok,
    database: configured ? "configured" : "missing",
    connected,
    redis: Boolean(process.env.REDIS_URL),
    uptimeSec: Math.round(process.uptime()),
    nodeEnv: process.env.NODE_ENV || "development"
  });
});

// Обработчик для Chrome DevTools и других .well-known запросов
router.get("/.well-known/*", (req, res) => {
  res.status(404).send("Not Found");
});

module.exports = router;
