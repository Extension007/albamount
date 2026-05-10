// Конфигурация подключения к PostgreSQL через Sequelize
const { Sequelize } = require("sequelize");

// Подключение к базе данных
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  protocol: "postgres",
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false // Настройте в соответствии с вашими требованиями безопасности
    }
  },
  logging: false, // Отключить логирование SQL-запросов (можно включить для отладки)
});

// Проверка подключения
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log("✅ Подключение к PostgreSQL установлено успешно.");
  } catch (error) {
    console.error("❌ Не удалось подключиться к PostgreSQL:", error);
  }
}

module.exports = {
  sequelize,
  testConnection
};