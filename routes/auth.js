const express = require('express');
const router = express.Router();
const emailVerificationController = require('../controllers/emailVerificationController');
const authController = require('../controllers/authController');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');
const { validateRegister } = require('../middleware/validators');

function renderUserLogin(req, res, error = null) {
  if (typeof error === "function") error = null;
  res.render("user-login", {
    error,
    csrfToken: res.locals.csrfToken || ""
  });
}

function renderAdminLogin(req, res, error = null, debug = null) {
  if (typeof error === "function") error = null;
  res.render("login", {
    error,
    debug,
    csrfToken: res.locals.csrfToken || ""
  });
}

router.post("/logout", (req, res) => {
  const isVercel = Boolean(process.env.VERCEL);

  if (isVercel) {
    // В Vercel serverless удаляем cookie
    res.clearCookie('exto_user');
  } else {
    // В обычной среде уничтожаем сессию
    req.session.destroy((err) => {
      if (err) {
        console.error("❌ Ошибка выхода:", err);
        return res.redirect("/");
      }
    });
  }
  res.clearCookie('exto_token');

  res.redirect("/");
});

// User auth routes

// Страница регистрации (GET)
router.get("/register", (req, res) => {
  const refCode = req.query.ref || '';
  res.render("register", {
    refCode,
    csrfToken: res.locals.csrfToken || ""
  });
});

// Регистрация пользователя (POST)
router.post("/register", registerLimiter, validateRegister, authController.register);

router.get("/user/login", renderUserLogin);
router.post("/user/login", loginLimiter, authController.userLogin);
router.get("/login", (req, res) => res.redirect("/user/login"));

// Admin auth routes
router.get("/admin/login", renderAdminLogin);
router.post("/admin/login", loginLimiter, authController.adminLogin);

// Email verification routes
router.get('/verify-email/:token', emailVerificationController.verifyEmail);
router.post('/resend-verification', emailVerificationController.resendVerification);
router.get('/verification-status', emailVerificationController.verificationStatus);

module.exports = router;
