const { Op } = require("sequelize");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { generateToken } = require("../config/jwt");
const { sendVerificationEmail } = require("../services/emailVerificationService");
const { notifyAdmin } = require("../services/adminNotificationService");
const logger = require("../utils/logger");
const { isUniqueConstraintError, getDuplicateFieldMessage } = require("../utils/sequelizeErrors");

exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email и пароль обязательны" });
    }

    const orConditions = [{ email }];
    if (username) {
      orConditions.push({ username });
    }

    const existingUser = await User.findOne({
      where: { [Op.or]: orConditions }
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ success: false, message: "Пользователь с таким email уже существует" });
      }
      return res.status(400).json({ success: false, message: "Пользователь с таким именем уже существует" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: username || email.split("@")[0],
      email,
      password_hash: hashedPassword,
      role: "user",
      emailVerified: false
    });

    const refCode = req.query.ref || req.body.ref || req.body.refCode;
    if (refCode) {
      const referrer = await User.findOne({ where: { refCode } });
      if (referrer && referrer.id !== user.id) {
        user.referredBy = referrer.id;
        await user.save();
      }
    }

    try {
      await notifyAdmin(
        "Новый пользователь зарегистрирован",
        "Зарегистрирован новый пользователь.",
        {
          "Имя пользователя": user.username,
          Email: user.email,
          "Дата регистрации": new Date().toLocaleString("ru-RU"),
          "ID пользователя": user.id
        }
      );
    } catch (notificationError) {
      console.error("Ошибка уведомления администратора:", notificationError);
    }

    const emailConfig = require("../config/email");
    if (emailConfig.enabled) {
      try {
        await sendVerificationEmail(user);
      } catch (emailError) {
        if (user.role === "user") {
          await User.destroy({ where: { id: user.id } });
        }
        console.error("Ошибка отправки письма подтверждения:", emailError);
        return res.status(500).json({
          success: false,
          message: "Не удалось отправить письмо подтверждения. Проверьте email или попробуйте позже."
        });
      }
    } else {
      user.emailVerified = true;
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: "Регистрация успешна. Проверьте email для подтверждения.",
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified
      }
    });
  } catch (err) {
    console.error("Ошибка регистрации:", err);
    if (isUniqueConstraintError(err)) {
      return res.status(400).json({
        success: false,
        message: getDuplicateFieldMessage(err)
      });
    }
    return res.status(500).json({ success: false, message: "Ошибка регистрации" });
  }
};

exports.userLogin = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.render("user-login", { error: "Неверный логин или пароль", csrfToken: res.locals.csrfToken });
    }
    if (user.role === "admin") {
      return res.render("user-login", {
        error: "Для входа администратора используйте /admin/login",
        csrfToken: res.locals.csrfToken
      });
    }
    if (!user.emailVerified) {
      return res.render("user-login", {
        error: "Подтвердите email перед входом. Проверьте Входящие или Спам.",
        csrfToken: res.locals.csrfToken,
        showResendVerification: true,
        email: user.email
      });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.render("user-login", { error: "Неверный логин или пароль", csrfToken: res.locals.csrfToken });
    }

    const userData = {
      _id: user.id,
      username: user.username,
      role: user.role,
      emailVerified: user.emailVerified
    };

    const token = generateToken(userData);
    if (!process.env.VERCEL) {
      req.session.user = userData;
    }
    res.cookie("exto_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 24
    });

    logger.info({
      msg: "user_login_success",
      userId: user.id,
      username: user.username,
      role: user.role
    });

    return res.redirect("/cabinet");
  } catch (err) {
    logger.error({ msg: "user_login_error", error: err.message });
    return res.status(500).send("Ошибка базы данных");
  }
};

exports.adminLogin = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.render("login", { error: "Неверный логин или пароль", debug: null, csrfToken: res.locals.csrfToken });
    }
    if (user.role !== "admin") {
      return res.render("login", {
        error: "Доступ разрешен только администраторам",
        debug: null,
        csrfToken: res.locals.csrfToken
      });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.render("login", { error: "Неверный логин или пароль", debug: null, csrfToken: res.locals.csrfToken });
    }

    const userData = {
      _id: user.id,
      username: user.username,
      role: user.role,
      emailVerified: user.emailVerified
    };

    const token = generateToken(userData);
    if (!process.env.VERCEL) {
      req.session.user = userData;
    }
    res.cookie("exto_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 24
    });

    logger.info({ msg: "admin_login_success", userId: user.id, username: user.username });
    return res.redirect("/admin");
  } catch (err) {
    logger.error({ msg: "admin_login_error", error: err.message });
    return res.status(500).send("Ошибка базы данных");
  }
};

exports.logout = async (req, res) => {
  res.clearCookie("exto_user");
  res.clearCookie("exto_token");

  if (!process.env.VERCEL && req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error("Ошибка выхода:", err);
      }
    });
  }

  return res.json({ success: true, message: "Вы успешно вышли" });
};
