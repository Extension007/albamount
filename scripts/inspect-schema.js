require('dotenv').config();
const { sequelize } = require('../config/database');

(async () => {
  await sequelize.authenticate();
  const [idCols] = await sequelize.query(`
    SELECT c.table_name, c.column_name, c.data_type, c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name IN ('id', 'owner_id', 'user_id', 'ownerId', 'related_user_id', 'related_card_id')
    ORDER BY c.table_name, c.column_name
  `);
  console.log('=== ID-related columns ===');
  for (const row of idCols) {
    console.log(`${row.table_name}.${row.column_name}: ${row.data_type}/${row.udt_name}`);
  }

  const [sample] = await sequelize.query(`
    SELECT 'products' AS t, id::text AS id FROM products LIMIT 3
    UNION ALL
    SELECT 'users', id::text FROM users LIMIT 3
    UNION ALL
    SELECT 'banners', id::text FROM banners LIMIT 3
  `);
  console.log('=== Sample IDs ===');
  console.log(sample);

  const [tables] = await sequelize.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' ORDER BY 1
  `);
  console.log('=== Tables ===');
  console.log(tables.map((t) => t.table_name).join(', '));

  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
