/**
 * Reset password for an existing admin (or create one).
 * Usage:
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD='YourNewPass123!' node scripts/reset-admin-password.js
 */
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function main() {
  const { sequelize, User } = require('../config/database');
  const username = process.env.ADMIN_USERNAME || 'admin';
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD;

  if (!password || String(password).length < 8) {
    console.error('Set ADMIN_PASSWORD (min 8 chars) in env for this command');
    process.exit(1);
  }

  await sequelize.authenticate();
  const hash = await bcrypt.hash(String(password), 12);

  let user = await User.findOne({ where: { username } });
  if (!user) {
    user = await User.create({
      username,
      email,
      password_hash: hash,
      role: 'admin',
      emailVerified: true
    });
    console.log('Created admin:', user.username, user.email);
  } else {
    user.password_hash = hash;
    user.role = 'admin';
    user.emailVerified = true;
    if (email) user.email = email;
    await user.save();
    console.log('Password reset for admin:', user.username, user.email);
  }

  await sequelize.close();
}

main().catch(async (err) => {
  console.error(err.message);
  process.exit(1);
});
