require("dotenv").config();
const { Op } = require("sequelize");
const { sequelize, Product } = require("../config/database");

async function fixProductsStatus() {
  try {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL не задан");
      process.exit(1);
    }

    await sequelize.authenticate();
    console.log("✅ PostgreSQL подключена\n");

    const productsWithoutStatus = await Product.findAll({
      where: {
        [Op.or]: [
          { status: null },
          { status: "" }
        ]
      }
    });

    console.log(`📋 Найдено карточек без статуса: ${productsWithoutStatus.length}\n`);

    for (const product of productsWithoutStatus) {
      const newStatus = product.ownerId ? "pending" : "approved";
      await product.update({ status: newStatus, rejection_reason: "" });
      console.log(`✅ Обновлена карточка "${product.name}" (ID: ${product.id}): статус = ${newStatus}`);
    }

    const pendingProducts = await Product.findAll({
      where: {
        ownerId: { [Op.not]: null },
        status: "pending"
      }
    });

    console.log(`\n⏳ Карточек на модерации: ${pendingProducts.length}`);
    pendingProducts.forEach((p) => {
      console.log(`  - ${p.name} (ID: ${p.id}, владелец: ${p.ownerId})`);
    });

    const allProducts = await Product.findAll();
    console.log(`\n📦 Всего карточек: ${allProducts.length}`);
    const byStatus = {};
    allProducts.forEach((p) => {
      const status = p.status || "не указан";
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    console.log("📊 Распределение по статусам:");
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`  - ${status}: ${count}`);
    });

    await sequelize.close();
    console.log("\n🔌 Соединение закрыто");
  } catch (err) {
    console.error("❌ Ошибка:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  fixProductsStatus();
}
