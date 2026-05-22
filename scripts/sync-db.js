require("dotenv").config();
const { sequelize } = require("../config/database");

(async () => {
  try {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL не задан");
      process.exit(1);
    }
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    console.log("✅ Схема БД синхронизирована");
    process.exit(0);
  } catch (err) {
    console.error("❌ Ошибка синхронизации:", err.message);
    process.exit(1);
  }
})();
