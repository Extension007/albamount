const express = require("express");
const router = express.Router();

const Product = require("../config/database").Product;
const Category = require("../config/database").Category;
const User = require("../config/database").User;
const Statistics = require("../config/database").Statistics;
const { USE_POSTGRES, sequelize } = require("../config/database");
const { CATEGORY_LABELS, CATEGORY_KEYS } = require("../config/app");
const { Op } = require("sequelize");
const { publicProductWhere, publicServiceWhere } = require("../utils/catalogFilters");

function resolveSelectedCategoryDisplay(selected, hasDbAccess, categoryFlat) {
  if (!selected || selected === "all") return "all";
    // Check if selected is numeric ID (new integer IDs)
    if (typeof selected !== 'string' || !/^\d+$/.test(selected)) return selected;
    if (!hasDbAccess) return "Категория";
    const match = Object.values(categoryFlat || {}).find(
      (item) => item && item.id && item.id.toString() === selected
    );
    return match && match.name ? match.name : "Неизвестная категория";
  }

// Страница услуг
router.get("/", async (req, res) => {
  try {
    if (!USE_POSTGRES) return res.status(503).send("Страница услуг недоступна: нет БД");

    const isAuth = Boolean(req.user);
    const userRole = req.user?.role || null;
    const isAdmin = userRole === "admin";
    const isUser = userRole === "user";

    const selected = req.query.category;
    const hasDbAccess = USE_POSTGRES;
    const extra =
      selected && selected !== "all"
        ? (/^\d+$/.test(selected) ? { categoryId: parseInt(selected, 10) } : { category: selected })
        : undefined;
    const finalServicesFilter = publicServiceWhere(extra);

    // Получаем дерево категорий для услуг
    const categoryTree = await Category.getTree('service');
    const categoryFlat = await Category.getFlatList('service');
    const selectedCategoryDisplay = resolveSelectedCategoryDisplay(selected, hasDbAccess, categoryFlat);

    // Запросы
    const [products, services, visitors, users] = await Promise.all([
      Product.findAll({
        where: publicProductWhere(),
        order: [['id', 'DESC']],
        limit: 5,
        raw: true,
        nest: true
      }),
      Product.findAll({
        where: finalServicesFilter,
        order: [['id', 'DESC']],
        limit: 48,
        raw: true,
        nest: true
      }),
      Statistics.increment('value', { by: 1, where: { key: "visitors" } }).then(() => Statistics.findOne({ where: { key: "visitors" } })),
      User.count()
    ]);

    res.render("services", {
      products,
      services,
      visitors: visitors ? visitors.value : 0,
      totalUsers: users,
      selectedCategory: selectedCategoryDisplay,
      csrfToken: req.csrfToken ? req.csrfToken() : '',
      CATEGORY_LABELS,
      activeTab: 'services',
      isAuth,
      isAdmin,
      isUser,
      userRole,
      user: req.user
    });
  } catch (err) {
    console.error("❌ Ошибка на странице услуг:", err);
    res.status(500).send("Ошибка сервера");
  }
});

module.exports = router;
