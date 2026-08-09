// API для управления категориями
const express = require("express");
const router = express.Router();
const Category = require("../config/database").Category;
const Product = require("../config/database").Product;
const Banner = require("../config/database").Banner;
const { requireAdmin } = require("../middleware/auth");
const { isValidEntityId } = require("../utils/idValidation");

function withLegacyId(category) {
  if (!category) return category;
  const plain = typeof category.toJSON === 'function' ? category.toJSON() : { ...category };
  plain._id = plain.id;
  if (Array.isArray(plain.children)) {
    plain.children = plain.children.map(withLegacyId);
  }
  return plain;
}

function normalizeTree(nodes) {
  return (nodes || []).map(withLegacyId);
}

router.get('/tree/:type', async (req, res) => {
  try {
    const type = req.params.type || 'all';
    const includeInactive = req.query.includeInactive === 'true';
    const tree = await Category.getTree(type, includeInactive);
    res.json({ success: true, categories: normalizeTree(tree) });
  } catch (err) {
    console.error('Ошибка загрузки дерева категорий:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера', error: err.message });
  }
});

router.get('/children/:id', async (req, res) => {
  try {
    if (!isValidEntityId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Некорректный ID категории' });
    }

    const parentId = /^\d+$/.test(String(req.params.id))
      ? parseInt(req.params.id, 10)
      : req.params.id;

    const children = await Category.findAll({
      where: { parentId, isActive: true },
      order: [['order', 'ASC'], ['name', 'ASC']],
      raw: true
    });

    res.json({
      success: true,
      categories: children.map((c) => ({ ...c, _id: c.id }))
    });
  } catch (err) {
    console.error('Ошибка загрузки подкатегорий:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера', error: err.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, type = 'all', icon = '', description = '', order = 0, parentId = null } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Название категории обязательно' });
    }

    const category = await Category.create({
      name: String(name).trim(),
      type,
      icon: icon || '',
      description: description || '',
      order: Number(order) || 0,
      parentId: parentId || null,
      isActive: true
    });

    const plain = category.get({ plain: true });
    plain._id = plain.id;
    res.json({ success: true, message: 'Категория создана', category: plain });
  } catch (err) {
    console.error('Ошибка создания категории:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера', error: err.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    if (!isValidEntityId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Некорректный ID категории' });
    }

    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Категория не найдена' });
    }

    const { name, type, icon, description, order, parentId, isActive } = req.body;
    if (name != null) category.name = String(name).trim();
    if (type != null) category.type = type;
    if (icon != null) category.icon = icon;
    if (description != null) category.description = description;
    if (order != null) category.order = Number(order) || 0;
    if (parentId !== undefined) category.parentId = parentId || null;
    if (isActive != null) category.isActive = Boolean(isActive);

    await category.save();
    const plain = category.get({ plain: true });
    plain._id = plain.id;
    res.json({ success: true, message: 'Категория обновлена', category: plain });
  } catch (err) {
    console.error('Ошибка обновления категории:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера', error: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidEntityId(id)) {
      return res.status(400).json({ success: false, message: 'Некорректный ID категории' });
    }

    const productsCount = await Product.count({ where: { categoryId: id } });
    const bannersCount = await Banner.count({ where: { categoryId: id } });

    if (productsCount > 0 || bannersCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Категория используется в ${productsCount + bannersCount} записях`
      });
    }

    const childCount = await Category.count({ where: { parentId: id } });
    if (childCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Сначала удалите подкатегории'
      });
    }

    const deletedCount = await Category.destroy({ where: { id } });
    if (deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Категория не найдена"
      });
    }

    res.json({
      success: true,
      message: "Категория удалена"
    });
  } catch (err) {
    console.error("Ошибка удаления категории:", err);
    res.status(500).json({
      success: false,
      message: "Ошибка сервера",
      error: err.message
    });
  }
});

module.exports = router;
