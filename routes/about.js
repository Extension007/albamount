const express = require("express");
const router = express.Router();

const Product = require("../models/Product");
const Banner = require("../models/Banner");
const User = require("../models/User");
const Statistics = require("../models/Statistics");
const { USE_POSTGRES } = require("../config/database");
const { CATEGORY_LABELS, CATEGORY_KEYS } = require("../config/app");

// Страница "О нас"
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
        selectedCategory: selected || "all",
        csrfToken: req.csrfToken ? req.csrfToken() : '',
        activeTab: 'about' // Указываем активную вкладку
      });
    }

    // Запросы - минимальная загрузка для страницы "О нас"
    const [products, services, banners, visitorRecord, users] = await Promise.all([
      Product.findAll({
        where: { status: "approved" },
        order: [['id', 'DESC']],
        limit: 5,
        raw: true,
        nest: true
      }),
      Product.findAll({
        where: { type: "service", status: "approved" },
        order: [['id', 'DESC']],
        limit: 5,
        raw: true,
        nest: true
      }),
      Banner.findAll({
        where: { status: "approved" },
        order: [['id', 'DESC']],
        raw: true,
        nest: true
      }),
      Statistics.increment('value', { by: 1, where: { key: "visitors" } })
        .then(() => Statistics.findByPk("visitors")),
      User.count()
    ]);

    const visitorCount = visitorRecord ? visitorRecord.value : 0;
    const userCount = users || 0;

     const userId = req.user?._id?.toString();
     const votedMap = {};
     [...products, ...services].forEach(p => {
       if (Array.isArray(p.voters) && p.voters.map(v => v.toString()).includes(userId)) {
         votedMap[p.id.toString()] = true;
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
      selectedCategory: selected || "all",
      csrfToken: req.csrfToken ? req.csrfToken() : '',
      activeTab: 'about'
    });
  } catch (err) {
    console.error("❌ Ошибка на странице О нас:", err);
    res.status(500).send("Ошибка сервера");
  }
});

module.exports = router;
