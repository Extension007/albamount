require("dotenv").config();
const { Op } = require("sequelize");
const { sequelize, Product, User } = require("../config/database");

async function checkPendingProducts() {
  try {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL не задан");
      process.exit(1);
    }

    await sequelize.authenticate();
    console.log("✅ PostgreSQL подключена\n");

    const allProducts = await Product.findAll({ order: [["id", "DESC"]] });
    console.log(`📦 Всего карточек в базе: ${allProducts.length}\n`);

    const pending = await Product.findAll({ where: { status: "pending" } });
    const approved = await Product.findAll({ where: { status: "approved" } });
    const rejected = await Product.findAll({ where: { status: "rejected" } });
    const withoutStatus = await Product.findAll({
      where: {
        [Op.or]: [{ status: null }, { status: "" }]
      }
    });

    console.log(`⏳ На модерации (pending): ${pending.length}`);
    console.log(`✅ Одобренные (approved): ${approved.length}`);
    console.log(`❌ Отклоненные (rejected): ${rejected.length}`);
    console.log(`⚠️  Без статуса: ${withoutStatus.length}\n`);

    if (pending.length > 0) {
      console.log("📋 Карточки на модерации:");
      for (const product of pending) {
        const ownerInfo = product.ownerId
          ? await User.findByPk(product.ownerId, { attributes: ["id", "username"] })
          : null;
        console.log(`  - ${product.name}`);
        console.log(`    ID: ${product.id}`);
        console.log(`    Статус: ${product.status}`);
        console.log(`    Владелец: ${ownerInfo ? ownerInfo.username : product.ownerId || "не указан"}`);
        console.log(`    Создано: ${product.createdAt}`);
        console.log("");
      }
    } else {
      console.log("ℹ️  Карточек на модерации не найдено\n");
    }

    await sequelize.close();
    console.log("\n🔌 Соединение закрыто");
  } catch (err) {
    console.error("❌ Ошибка:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  checkPendingProducts();
}

module.exports = checkPendingProducts;
