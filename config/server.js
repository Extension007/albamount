// Конфигурация запуска сервера
const { app } = require("./app");
const { sequelize, USE_POSTGRES } = require("./database");

// Глобальный обработчик ошибок
const errorHandler = require("../middleware/errorHandler");
app.use(errorHandler);

// Middleware для подключения к БД в serverless среде
if (process.env.VERCEL) {
  app.use(async (req, res, next) => {
    try {
      // В Vercel проверяем подключение к PostgreSQL для каждого запроса
      if (USE_POSTGRES) {
        await sequelize.authenticate();
        req.dbConnected = true;
      } else {
        req.dbConnected = false;
      }
      next();
    } catch (err) {
      console.error("❌ Ошибка подключения к БД в middleware:", err);
      req.dbConnected = false;
      next();
    }
  });
}

function startServer(port = process.env.PORT || 3000, attemptsLeft = 5) {
  // В Vercel serverless не нужно предварительное подключение
  if (process.env.VERCEL) {
    console.log("✅ Vercel serverless режим - подключение к БД будет создаваться для каждого запроса");
    return app;
  }

  // В обычной среде подключаемся к PostgreSQL перед запуском сервера
  if (USE_POSTGRES) {
    sequelize.authenticate()
      .then(() => {
        console.log("✅ Подключение к PostgreSQL установлено");
        const server = app
          .listen(port, "0.0.0.0", () => {
            console.log(`✅ Сервер запущен на http://localhost:${port}`);
          })
          .on("error", (err) => {
            if (err && err.code === "EADDRINUSE" && attemptsLeft > 0) {
              const nextPort = port + 1;
              console.warn(`⚠️  Порт ${port} занят, пробую ${nextPort}... (${attemptsLeft - 1} попыток осталось)`);
              startServer(nextPort, attemptsLeft - 1);
            } else {
              console.error("❌ Ошибка запуска сервера:", err);
              process.exit(1);
            }
          });
        return server;
      })
      .catch((err) => {
        console.error("❌ Ошибка подключения к PostgreSQL:", err);
        console.warn("⚠️  Сервер запущен без БД");
        const server = app
          .listen(port, "0.0.0.0", () => {
            console.log(`✅ Сервер запущен на http://localhost:${port} (без БД)`);
          })
          .on("error", (err) => {
            if (err && err.code === "EADDRINUSE" && attemptsLeft > 0) {
              const nextPort = port + 1;
              console.warn(`⚠️  Порт ${port} занят, пробую ${nextPort}... (${attemptsLeft - 1} попыток осталось)`);
              startServer(nextPort, attemptsLeft - 1);
            } else {
              console.error("❌ Ошибка запуска сервера:", err);
              process.exit(1);
            }
          });
        return server;
      });
  } else {
    console.warn("⚠️  DATABASE_URL не установлен, сервер запускается без БД");
    const server = app
      .listen(port, "0.0.0.0", () => {
        console.log(`✅ Сервер запущен на http://localhost:${port} (без БД)`);
      })
      .on("error", (err) => {
        if (err && err.code === "EADDRINUSE" && attemptsLeft > 0) {
          const nextPort = port + 1;
          console.warn(`⚠️  Порт ${port} занят, пробую ${nextPort}... (${attemptsLeft - 1} попыток осталось)`);
          startServer(nextPort, attemptsLeft - 1);
        } else {
          console.error("❌ Ошибка запуска сервера:", err);
          process.exit(1);
        }
      });
    return server;
  }
}

module.exports = {
  startServer
};
