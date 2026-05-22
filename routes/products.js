const express = require("express");
const router = express.Router();

const Product = require("../config/database").Product;
const Banner = require("../config/database").Banner;
const Category = require("../config/database").Category;
const User = require("../config/database").User;
const Statistics = require("../config/database").Statistics;
const { USE_POSTGRES, sequelize } = require("../config/database");
const { CATEGORY_LABELS, CATEGORY_KEYS } = require("../config/app");
const { Op } = require("sequelize");

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

    const isVercel = Boolean(process.env.VERCEL);
    const hasDbAccess = isVercel ? req.dbConnected : USE_POSTGRES;

    if (!hasDbAccess) {
      const selectedCategoryDisplay = resolveSelectedCategoryDisplay(selected, hasDbAccess);
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
        selectedCategory: selectedCategoryDisplay,
        csrfToken: req.csrfToken ? req.csrfToken() : '',
        activeTab: 'products' // Указываем активную вкладку
      });
    }

    // Фильтры только для товаров
    const productsFilter = {
      [Op.and]: [
        { [Op.or]: [ { status: "approved" }, { status: null } ] },
        { [Op.or]: [ { type: "product" }, { type: null } ] },
        { deleted: false }
      ]
    };

    if (selected && selected !== 'all') {
      // Если выбранная категория - это numeric ID (новая система), используем categoryId
      if (/^\d+$/.test(selected)) {
        productsFilter[Op.and].push({ categoryId: parseInt(selected, 10) });
      } else {
        // Для обратной совместимости - старые строковые категории
        productsFilter[Op.and].push({ category: selected });
      }
    }

    // Получаем дерево категорий для товаров
    const categoryTree = await Category.getTree('product');
    const categoryFlat = await Category.getFlatList('product');
    const selectedCategoryDisplay = resolveSelectedCategoryDisplay(selected, hasDbAccess, categoryFlat);

    // Запросы
    const [products, services, banners, visitors, users] = await Promise.all([
      Product.findAll({
        where: productsFilter,
        order: [['id', 'DESC']],
        raw: true,
        nest: true
      }),
      Product.findAll({
        where: { type: "service", status: "approved", deleted: false },
        order: [['id', 'DESC']],
        raw: true,
        nest: true
      }),
      Banner.findAll({
        where: { status: "approved" },
        order: [['id', 'DESC']],
        raw: true,
        nest: true
      }),
      Statistics.increment('value', { by: 1, where: { key: "visitors" } }).then(() => Statistics.findByPk("visitors")),
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
