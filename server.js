// Главный файл приложения
require("dotenv").config();
const { assertProductionEnv, isProdLike } = require("./config/production");

const prodGuards = assertProductionEnv();
if (!prodGuards.ok) {
  for (const e of prodGuards.errors) console.error("❌ production:", e);
  if (isProdLike()) {
    throw new Error(`Production env invalid: ${prodGuards.errors.join("; ")}`);
  }
}
for (const w of prodGuards.warnings) console.warn("⚠️ production:", w);

const express = require("express"); // важно для Vercel
const { sequelize, testConnection } = require("./config/database");
const { app } = require("./config/app"); // берём готовый app из config/app.js
const routes = require("./routes/index");
const commentsRoutes = require("./routes/comments");
const { checkConfiguration } = require("./services/emailService");
const http = require("http");
const { Server } = require("socket.io");

// Создаём HTTP сервер
const server = http.createServer(app);

// Инициализируем Socket.IO сервер только если не на Vercel
let io;
if (!process.env.VERCEL) {
  const socketOrigin = (origin, callback) => {
    if (!origin || process.env.NODE_ENV !== "production") {
      return callback(null, true);
    }
    const allowed = [process.env.FRONTEND_URL, process.env.BASE_URL].filter(Boolean);
    if (!allowed.length) return callback(null, true);
    for (const raw of allowed) {
      try {
        if (new URL(raw).origin === origin) return callback(null, true);
      } catch (_) { /* ignore invalid env URL */ }
    }
    return callback(new Error("Not allowed by CORS"));
  };

  io = new Server(server, {
    cors: {
      origin: socketOrigin,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  commentsRoutes.setSocketIO(io);
  app.set("io", io);
  app.use("/", routes);

  app.use((req, res) => {
    res.status(404).send("Not Found");
  });

  require("./socket/commentChat")(io);
} else {
  app.set("io", null);
  app.use("/", routes);

  app.use((req, res) => {
    res.status(404).send("Not Found");
  });
}

// Экспорт приложения для Vercel
module.exports = app;

// Локальный запуск
if (require.main === module) {
  (async () => {
    try {
      // Подключение к PostgreSQL при старте
      await testConnection();
      console.log("✅ PostgreSQL подключена");

      try {
        const { ensureVerificationTokensTable } = require("./services/emailVerificationService");
        await ensureVerificationTokensTable();
        console.log("✅ verification_tokens готова");
      } catch (tableErr) {
        console.warn("⚠️ verification_tokens:", tableErr.message);
      }

      // Проверка конфигурации email
      checkConfiguration();

      const PORT = process.env.PORT || 3000;
      server.listen(PORT, () => {
        console.log(`Сервер запущен на http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error("❌ Ошибка подключения к PostgreSQL:", err);

      if (isProdLike()) {
        console.error("❌ Refusing to start without PostgreSQL in production");
        process.exit(1);
      }

      // Dev only: allow boot without DB for UI work
      const PORT = process.env.PORT || 3000;
      server.listen(PORT, () => {
        console.log(`Сервер запущен на http://localhost:${PORT} (без PostgreSQL)`);
      });
    }
  })();
}

// CSRF errors
app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    console.error("❌ CSRF токен невалиден:", err.message);
    const wantsJson =
      req.xhr || req.get("accept")?.includes("application/json") || req.path.startsWith("/api");
    if (wantsJson) {
      return res.status(403).json({
        success: false,
        message: "CSRF токен невалиден. Обновите страницу и попробуйте снова."
      });
    }
    return res.status(403).send("CSRF токен невалиден. Обновите страницу.");
  }
  return next(err);
});

const errorHandler = require("./middleware/errorHandler");
app.use(errorHandler);
