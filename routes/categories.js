// API для управления категориями
const express = require("express");
const router = express.Router();
const Category = require("../config/database").Category;
const Product = require("../config/database").Product;
const Banner = require("../config/database").Banner;

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const productsCount = await Product.count({ where: { categoryId: id } });
    const bannersCount = await Banner.count({ where: { categoryId: id } });

    if (productsCount > 0 || bannersCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Категория используется в ${productsCount + bannersCount} записях`
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