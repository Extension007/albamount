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

// Страница товаров
router.get("/", async (req, res) => {
  try {
    const isAuth = Boolean(req.user);
    const userRole = req.user?.role || null;
    const isAdmin = userRole === "admin";
    const isUser = userRole === "user";
    const selected = req.query.category;

    const categories = CATEGORY_LABELS || {};
    const categoryKeys = CATEGORY_KEYS || [];

    const hasDbAccess = USE_POSTGRES;

    if (!hasDbAccess) {
      const selectedCategoryDisplay = resolveSelectedCategoryDisplay(selected, hasDbAccess);
      return res.render("index", {
        products: [],
        services: [],
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
        selectedCategory: selectedCategoryDisplay,
        csrfToken: req.csrfToken ? req.csrfToken() : '',
        activeTab: 'products' // Указываем активную вкладку
      });
    }

    // Фильтры только для товаров
    const productsFilter = publicProductWhere(
      selected && selected !== "all"
        ? (/^\d+$/.test(selected) ? { categoryId: parseInt(selected, 10) } : { category: selected })
        : undefined
    );

    // Получаем дерево категорий для товаров
    const categoryTree = await Category.getTree('product');
    const categoryFlat = await Category.getFlatList('product');
    const selectedCategoryDisplay = resolveSelectedCategoryDisplay(selected, hasDbAccess, categoryFlat);

    const PAGE_LIMIT = 48;
    // Запросы
    const [products, services, visitors, users] = await Promise.all([
      Product.findAll({
        where: productsFilter,
        order: [['id', 'DESC']],
        limit: PAGE_LIMIT,
        raw: true,
        nest: true
      }),
      Product.findAll({
        where: publicServiceWhere(),
        order: [['id', 'DESC']],
        limit: PAGE_LIMIT,
        raw: true,
        nest: true
      }),
      Statistics.increment('value', { by: 1, where: { key: "visitors" } }).then(() => Statistics.findOne({ where: { key: "visitors" } })),
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

    res.render("index", {
      products,
      services,
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
      categories: categoryFlat, // Новая система категорий
      hierarchicalCategories: categoryTree, // Дерево категорий
      selectedCategory: selectedCategoryDisplay,
      csrfToken: req.csrfToken ? req.csrfToken() : '',
      activeTab: 'products' // Указываем активную вкладку
    });
  } catch (err) {
    console.error("❌ Ошибка:", err);
    res.status(500).send("Временная ошибка сервера");
  }
});

module.exports = router;
