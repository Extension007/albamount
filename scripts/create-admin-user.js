const bcrypt = require("bcryptjs");
require("dotenv").config();

async function runScript() {
  const { sequelize, User } = require("../config/database");

  try {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL не задан");
      process.exit(1);
    }

    await sequelize.authenticate();
    console.log("Подключение к PostgreSQL установлено");

    const username = process.env.ADMIN_USERNAME || "admin";
    const email = process.env.ADMIN_EMAIL || "admin@example.com";
    const password = process.env.ADMIN_PASSWORD;

    if (!password) {
      console.error("Задайте ADMIN_PASSWORD в .env");
      process.exit(1);
    }

    const existing = await User.findOne({ where: { username } });
    if (existing) {
      if (existing.role !== "admin") {
        existing.role = "admin";
        existing.emailVerified = true;
        await existing.save();
        console.log(`Пользователь ${username} повышен до admin`);
      } else {
        console.log(`Администратор ${username} уже существует`);
      }
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const adminUser = await User.create({
      username,
      email,
      password_hash: passwordHash,
      role: "admin",
      emailVerified: true
    });

    console.log("Администратор создан:");
    console.log("- ID:", adminUser.id);
    console.log("- Username:", adminUser.username);
    console.log("- Email:", adminUser.email);
    process.exit(0);
  } catch (error) {
    console.error("Ошибка:", error.message);
    process.exit(1);
  } finally {
    await sequelize.close().catch(() => {});
  }
}

runScript();
