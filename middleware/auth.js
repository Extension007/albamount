// Middleware для авторизации
const { verifyToken } = require("../config/jwt");
const logger = require("../utils/logger");

// Функция для получения пользователя из различных источников
function getUserFromRequest(req) {
  const token = req.cookies.exto_token || req.headers.authorization?.split(' ')[1];
  const sessionUser = req.session?.user;

  let tokenData = null;
  if (token) {
    tokenData = verifyToken(token);
  }

  return tokenData || sessionUser || null;
}

// Async version for routes that need real-time sync from database
async function getUserFromRequestAsync(req) {
  const token = req.cookies.exto_token || req.headers.authorization?.split(' ')[1];
  const sessionUser = req.session?.user;

  let tokenData = null;
  if (token) {
    tokenData = verifyToken(token);
  }

  const userId = (tokenData && tokenData._id) || (sessionUser && sessionUser._id);
  
  if (userId) {
    try {
      const User = require('../models/User');
      const freshUser = await User.findByPk(userId, {
        attributes: ['id', 'username', 'role', 'emailVerified']
      });
      
      if (freshUser) {
        const tokenOutOfSync = tokenData && (
          tokenData.role !== freshUser.role ||
          tokenData.emailVerified !== freshUser.emailVerified
        );
        
        const sessionOutOfSync = sessionUser && (
          sessionUser.role !== freshUser.role ||
          sessionUser.emailVerified !== freshUser.emailVerified
        );
        
        if (tokenOutOfSync || sessionOutOfSync) {
          logger.info({
            msg: 'auth_desync_detected',
            userId: userId.toString(),
            tokenOutOfSync,
            sessionOutOfSync
          });
          
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
              maxAge: 1000 * 60 * 60 * 24
            });
          }
        }
        
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
      return tokenData || sessionUser;
    }
  }

  return tokenData || sessionUser;
}

function wantsJsonResponse(req) {
  return req.xhr || req.get("accept")?.includes("application/json");
}

function requireAdmin(req, res, next) {
  (async () => {
    try {
      const user = await getUserFromRequestAsync(req);

      if (!user) {
        if (wantsJsonResponse(req)) {
          return res.status(401).json({ success: false, error: "Unauthorized", message: "Требуется авторизация" });
        }
        return res.redirect("/admin/login");
      }
      
      if (user.role !== "admin") {
        if (wantsJsonResponse(req)) {
          return res.status(403).json({ success: false, error: "Forbidden", message: "Доступ запрещен: требуется роль администратора" });
        }
        return res.status(403).send("Доступ запрещен: требуется роль администратора");
      }
      req.currentUser = user;
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
      const user = await getUserFromRequestAsync(req);

      if (!user) {
        if (wantsJsonResponse(req)) {
          return res.status(401).json({ success: false, error: "Unauthorized", message: "Требуется авторизация" });
        }
        return res.redirect("/user/login");
      }
      req.currentUser = user;
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

        if (user && user.role === "admin") {
          req.currentUser = user;
          return next();
        }

        const userId = user?._id?.toString();
        const ownerId = (item.ownerId || item.owner)?.toString();

        if (!userId || userId !== ownerId) {
          if (wantsJsonResponse(req)) {
            return res.status(403).json({ success: false, error: "Forbidden", message: "Доступ запрещен: вы не являетесь владельцем этой карточки" });
          }
          return res.status(403).send("Доступ запрещен: вы не являетесь владельцем этой карточки");
        }

        req.item = item;
        req.currentUser = user;
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
  getUserFromRequest,
  getUserFromRequestAsync,
  wantsJsonResponse
};
