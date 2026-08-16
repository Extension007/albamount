require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Product, Banner, User } = require('../config/database');

(async () => {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password || String(password).length < 8) {
    throw new Error('Set SEED_USER_PASSWORD (min 8 chars) before running seed-admin');
  }
  const password_hash = await bcrypt.hash(String(password), 12);

  const user = await User.findOrCreate({
    where: { email: 'seller@example.com' },
    defaults: { username: 'seller', password_hash, role: 'user', emailVerified: true }
  });
  const [u] = user;
  console.log('User:', u.id, u.username);

  const p = await Product.findOrCreate({
    where: { name: 'Тестовый товар' },
    defaults: {
      name: 'Тестовый товар',
      description: 'Описание тестового товара',
      price: 1000,
      ownerId: u.id,
      type: 'product',
      status: 'pending'
    }
  });
  console.log('Product:', p[0].id);

  const s = await Product.findOrCreate({
    where: { name: 'Тестовая услуга' },
    defaults: {
      name: 'Тестовая услуга',
      description: 'Описание тестовой услуги',
      price: 2000,
      ownerId: u.id,
      type: 'service',
      status: 'pending'
    }
  });
  console.log('Service:', s[0].id);

  const b = await Banner.findOrCreate({
    where: { title: 'Тестовый баннер' },
    defaults: {
      title: 'Тестовый баннер',
      description: 'Описание баннера',
      ownerId: u.id,
      status: 'pending'
    }
  });
  console.log('Banner:', b[0].id);
  console.log('DONE');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
