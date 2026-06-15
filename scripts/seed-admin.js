require('dotenv').config();
const { Product, Banner, User } = require('../config/database');

(async () => {
  const user = await User.findOrCreate({
    where: { email: 'seller@example.com' },
    defaults: { username: 'seller', password: '123456', role: 'user' }
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
