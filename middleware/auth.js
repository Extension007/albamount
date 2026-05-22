// Middleware для авторизации
const { verifyToken } = require("../config/jwt");
const logger = require("../utils/logger");

// Функция для получения пользователя из различных источников
// NOTE: This function remains synchronous for Express middleware compatibility
// Real-time database sync is handled via the /api/me endpoint and frontend sync
function getUserFromRequest(req) {
  const token = req.cookies.exto_token || req.headers.authorization?.split(' ')[1]; // Bearer token
  const sessionUser = req.session?.user;

  let tokenData = null;
  if (token) {
    tokenData = verifyToken(token);
  }

  // For backward compatibility and Express middleware compatibility,
  // we return token or session data directly
  // Real-time sync is now handled by the frontend via /api/me endpoint
  return tokenData || sessionUser || null;
}

// Async version for routes that need real-time sync from database
async function getUserFromRequestAsync(req) {
  const token = req.cookies.exto_token || req.headers.authorization?.split(' ')[1]; // Bearer token
  const sessionUser = req.session?.user;

  let tokenData = null;
  if (token) {
    tokenData = verifyToken(token);
  }

  // Получаем ID пользователя из токена или сессии
  const userId = (tokenData && tokenData._id) || (sessionUser && sessionUser._id);
  
  if (userId) {
    try {
      // Всегда получаем свежие данные из базы данных
      const User = require('../models/User');
      const freshUser = await User.findByPk(userId, {
        attributes: ['id', 'username', 'role', 'emailVerified']
      });
      
      if (freshUser) {
        // Проверяем, отличаются ли данные в токене от базы
        const tokenOutOfSync = tokenData && (
          tokenData.role !== freshUser.role ||
          tokenData.emailVerified !== freshUser.emailVerified
        );
        
        // Проверяем, отличаются ли данные в сессии от базы
        const sessionOutOfSync = sessionUser && (
          sessionUser.role !== freshUser.role ||
          sessionUser.emailVerified !== freshUser.emailVerified
        );
        
        // Если есть рассинхронизация, обновляем JWT
        if (tokenOutOfSync || sessionOutOfSync) {
          logger.info({
            msg: 'auth_desync_detected',
            userId: userId.toString(),
            tokenOutOfSync,
            sessionOutOfSync
          });
          
         // Генерируем новый JWT с актуальными данными из базы
           const { generateToken } = require('../config/jwt');
           const updatedTokenData = {
             _id: freshUser.id.toString(),
             username: freshUser.username,
             role: freshUser.role,
             emailVerified: freshUser.emailVerified
           };
          
          const newToken = generateToken(updatedTokenData);
          if (req.res) {
            req.res.cookie('exto_token', newToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'strict',
              maxAge: 1000 * 60 * 60 * 24 // 24 часа
            });
          }
        }
        
         // Возвращаем свежие данные из базы данных
         return {
           _id: freshUser.id.toString(),
           username: freshUser.username,
           role: freshUser.role,
           emailVerified: freshUser.emailVerified
         };
      }
    } catch (error) {
      logger.error({
        msg: 'auth_fetch_user_error',
        error: error.message
      });
      // В случае ошибки возвращаем данные из токена или сессии как fallback
      return tokenData || sessionUser;
    }
  }

  // Если не удалось получить ID пользователя, возвращаем данные из токена или сессии
  return tokenData || sessionUser;
}


// Функция для определения типа ответа (JSON или HTML)
function wantsJsonResponse(req) {
  return req.xhr || req.get("accept")?.includes("application/json");
}

// Middleware functions remain synchronous to maintain Express compatibility
// However, we can enhance them to use async verification when needed
function requireAdmin(req, res, next) {
  (async () => {
    try {
      // Use the async version to get fresh data from database
      const user = await getUserFromRequestAsync(req);

      if (!user) {
        if (wantsJsonResponse(req)) {
          return res.status(401).json({ success: false, error: "Unauthorized", message: "Требуется авторизация" });
        }
        return res.redirect("/admin/login");
      }
      
      // Проверяем роль админа
      if (user.role !== "admin") {
        if (wantsJsonResponse(req)) {
          return res.status(403).json({ success: false, error: "Forbidden", message: "Доступ запрещен: требуется роль администратора" });
        }
        return res.status(403).send("Доступ запрещен: требуется роль администратора");
      }
      req.currentUser = user; // Сохраняем пользователя в запросе для дальнейшего использования
      next();
    } catch (error) {
      console.error('❌ Error in requireAdmin middleware:', error);
      if (wantsJsonResponse(req)) {
        return res.status(500).json({ success: false, error: "Server Error", message: "Ошибка проверки прав администратора" });
      }
      return res.redirect("/admin/login");
    }
  })();
}

function requireUser(req, res, next) {
  (async () => {
    try {
      // Use the async version to get fresh data from database
      const user = await getUserFromRequestAsync(req);

      if (!user) {
        if (wantsJsonResponse(req)) {
          return res.status(401).json({ success: false, error: "Unauthorized", message: "Требуется авторизация" });
        }
        return res.redirect("/user/login");
      }
      req.currentUser = user; // Сохраняем пользователя в запросе для дальнейшего использования
      next();
    } catch (error) {
      console.error('❌ Error in requireUser middleware:', error);
      if (wantsJsonResponse(req)) {
        return res.status(500).json({ success: false, error: "Server Error", message: "Ошибка проверки прав пользователя" });
      }
      return res.redirect("/user/login");
    }
  })();
}

/**
 * Middleware для проверки владельца карточки
 * Админ имеет полный доступ, пользователь - только к своим карточкам
 * @param {string} modelName - имя модели ('Product' или 'Banner')
 * @param {string} paramName - имя параметра с ID (по умолчанию 'id')
 */
function requireOwnerOrAdmin(modelName = 'Product', paramName = 'id') {
  return (req, res, next) => {
    (async () => {
   try {
     const Product = require('../models/Product');
     const Banner = require('../models/Banner');
     
     const Model = modelName === 'Banner' ? Banner : Product;
     const itemId = req.params[paramName];
        
         if (!/^[a-f0-9]{32,}$/i.test(itemId)) {
          if (wantsJsonResponse(req)) {
            return res.status(400).json({ success: false, error: "Bad Request", message: "Неверный формат ID" });
          }
          return res.status(400).send("Неверный формат ID");
        }

         const item = await Model.findByPk(itemId);
        if (!item) {
          if (wantsJsonResponse(req)) {
            return res.status(404).json({ success: false, error: "Not Found", message: "Карточка не найдена" });
          }
          return res.status(404).send("Карточка не найдена");
        }

        const user = await getUserFromRequestAsync(req);

        // Админ имеет полный доступ
        if (user && user.role === "admin") {
          req.currentUser = user; // Сохраняем пользователя в запросе
          return next();
        }

        // Проверяем владельца
        const userId = user?._id?.toString();
        const ownerId = (item.ownerId || item.owner)?.toString();

        if (!userId || userId !== ownerId) {
          if (wantsJsonResponse(req)) {
            return res.status(403).json({ success: false, error: "Forbidden", message: "Доступ запрещен: вы не являетесь владельцем этой карточки" });
          }
          return res.status(403).send("Доступ запрещен: вы не являетесь владельцем этой карточки");
        }

        // Сохраняем карточку в req для использования в роутах
        req.item = item;
        req.currentUser = user; // Сохраняем пользователя в запросе
        next();
      } catch (err) {
        console.error("❌ Ошибка проверки владельца:", err);
        if (wantsJsonResponse(req)) {
          return res.status(500).json({ success: false, error: "Server Error", message: "Ошибка проверки прав доступа" });
        }
        return res.status(500).send("Ошибка проверки прав доступа");
      }
    })();
  };
}

function requireAuth(req, res, next) {
  (async () => {
    try {
      // Use the async version to get fresh data from database
      const user = await getUserFromRequestAsync(req);

      if (!user) {
        if (wantsJsonResponse(req)) {
          return res.status(401).json({ success: false, error: "Unauthorized", message: "Требуется авторизация" });
        }
        return res.redirect('/user/login');
      }
      req.user = user;
      req.currentUser = user;
      return next();
    } catch (error) {
      console.error('❌ Error in requireAuth middleware:', error);
      if (wantsJsonResponse(req)) {
        return res.status(500).json({ success: false, error: "Server Error", message: "Ошибка проверки авторизации" });
      }
      return res.redirect('/user/login');
    }
  })();
}

module.exports = {
  requireAdmin,
  requireUser,
  requireAuth,
  requireOwnerOrAdmin,
  getUserFromRequest, // Экспортируем вспомогательную функцию для использования в других местах
  getUserFromRequestAsync, // Экспортируем асинхронную версию для специальных случаев
  wantsJsonResponse
};
