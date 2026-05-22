const express = require("express");
const router = express.Router();

const Product = require("../models/Product");
const Banner = require("../models/Banner");
const User = require("../models/User");
const Statistics = require("../models/Statistics");
const { USE_POSTGRES } = require("../config/database");
const { Op } = require("sequelize");

// Страница рекламы
router.get("/", async (req, res) => {
  try {
    const isAuth = Boolean(req.user);
    const userRole = req.user?.role || null;
    const isAdmin = userRole === "admin";
    const isUser = userRole === "user";

    const isVercel = Boolean(process.env.VERCEL);
    const hasDbAccess = isVercel ? req.dbConnected : USE_POSTGRES;

    if (!hasDbAccess) {
      return res.render("ad", {
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
        csrfToken: req.csrfToken ? req.csrfToken() : '',
        activeTab: 'ad' // Указываем активную вкладку
      });
    }

    // Запросы - фокус на рекламе
    const [products, services, banners, visitors, users] = await Promise.all([
      Product.findAll({ where: { status: "approved" }, order: [['id', 'DESC']], limit: 10 }), // Ограничиваем для фокуса на рекламе
      Product.findAll({ where: { type: "service", status: "approved" }, order: [['id', 'DESC']], limit: 10 }), // Ограничиваем для фокуса на рекламе
      Banner.findAll({ where: { status: "approved" }, order: [['id', 'DESC']] }),
      Statistics.increment('value', { by: 1, where: { key: "visitors" } })
        .then(() => Statistics.findByPk("visitors")),
      User.count()
    ]);

    const visitorCount = visitors ? visitors.value : 0;
    const userCount = users || 0;

     const userId = req.user?._id?.toString();
     const votedMap = {};
     [...products, ...services].forEach(p => {
       if (Array.isArray(p.voters) && p.voters.map(v => v.toString()).includes(userId)) {
         votedMap[p.id.toString()] = true;
       }
     });

    res.render("ad", {
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
      csrfToken: req.csrfToken ? req.csrfToken() : '',
      activeTab: 'ad' // Указываем активную вкладку
    });
  } catch (err) {
    console.error("❌ Ошибка:", err);
    res.status(500).send("Временная ошибка сервера");
  }
});

module.exports = router;
