// Главный файл приложения
require("dotenv").config();
const express = require("express"); // важно для Vercel
const { sequelize, testConnection } = require("./config/database");
const { app } = require("./config/app"); // берём готовый app из config/app.js
const routes = require("./routes/index");
const { checkConfiguration } = require("./services/emailService");

const http = require("http");
const { Server } = require("socket.io");

// Создаём HTTP сервер
const server = http.createServer(app);

// Инициализируем Socket.IO сервер только если не на Vercel
let io;
if (!process.env.VERCEL) {
  io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL || '' : '*', // В продакшене нужно указать конкретные домены
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Подключаем маршруты с Socket.IO
  require("./routes/comments").setSocketIO(io);
  app.use("/", routes);

  // Обработчик 404 для правильных CSP заголовков (для Chrome DevTools)
  app.use((req, res, next) => {
    // Применяем CSP заголовки для 404 ответов
    const { createSecurityMiddleware } = require("./config/security");
    createSecurityMiddleware()(req, res, () => {});
    res.status(404).send('Not Found');
  });

  // Подключаем обработчики WebSocket событий
  require("./socket/commentChat")(io);
  
  // Make io available globally for access in views
  app.set('io', io);
  
  // Also set socket_io_available to true for non-Vercel deployments
  app.use((req, res, next) => {
    res.locals.socket_io_available = true;
    next();
  });
} else {
  // На Vercel подключаем маршруты без Socket.IO
  app.use("/", routes);

  // Обработчик 404 для правильных CSP заголовков (для Chrome DevTools)
  app.use((req, res, next) => {
    // Применяем CSP заголовки для 404 ответов
    const { createSecurityMiddleware } = require("./config/security");
    createSecurityMiddleware()(req, res, () => {});
    res.status(404).send('Not Found');
  });

  // Set io to null for Vercel deployments to indicate it's not available
  app.set('io', null);

  // Set socket_io_available to false for Vercel deployments
  app.use((req, res, next) => {
    res.locals.socket_io_available = false;
    next();
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

      // Проверка конфигурации email
      checkConfiguration();

      const PORT = process.env.PORT || 3000;
      server.listen(PORT, () => {
        console.log(`Сервер запущен на http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error("❌ Ошибка подключения к PostgreSQL:", err);

      // Запускаем сервер даже при ошибке подключения
      const PORT = process.env.PORT || 3000;
      server.listen(PORT, () => {
        console.log(`Сервер запущен на http://localhost:${PORT} (без PostgreSQL)`);
      });
    }
  })();
}

// Обработчик ошибок CSRF
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    console.error('❌ CSRF токен невалиден:', err.message);
    return res.status(403).json({ success: false, message: 'CSRF токен невалиден. Пожалуйста, обновите страницу и попробуйте снова.' });
  } else {
    next(err);
  }
});
