require("dotenv").config();
const { sequelize } = require("../config/database");

(async () => {
  try {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL не задан");
      process.exit(1);
    }
    await sequelize.authenticate();
    console.log("✅ PostgreSQL подключение работает");
    
    // Проверяем существование таблиц без модификации схемы
    const [results] = await sequelize.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("✅ Существующие таблицы:", results.map(r => r.table_name).join(", ") || "таблицы не найдены");
    
    console.log("✅ Для полной миграции используйте: node migrations/001_create_all_tables.js");
    process.exit(0);
  } catch (err) {
    console.error("❌ Ошибка подключения к PostgreSQL:", err.message);
    process.exit(1);
  }
})();
