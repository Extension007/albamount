/**
 * Seed categories table from config/categories.js hierarchical tree.
 * Safe to re-run: skips insert when categories already exist (unless --force).
 *
 * Usage: node scripts/seed-categories.js
 *        node scripts/seed-categories.js --force
 */
require('dotenv').config();
const { Category, sequelize } = require('../config/database');
const { HIERARCHICAL_CATEGORIES } = require('../config/categories');

const force = process.argv.includes('--force');

async function createNode(node, parentId, order, type) {
  const created = await Category.create({
    name: node.label,
    parentId,
    type,
    icon: '',
    description: '',
    order,
    isActive: true
  });
  return created.id;
}

async function walk(tree, parentId, type) {
  let order = 0;
  for (const key of Object.keys(tree)) {
    const node = tree[key];
    const id = await createNode(node, parentId, order++, type);
    if (node.children) {
      await walk(node.children, id, type);
    }
  }
}

async function main() {
  const count = await Category.count();
  if (count > 0 && !force) {
    console.log(`categories already has ${count} rows — skip (use --force to wipe & reseed)`);
    return;
  }

  if (force && count > 0) {
    await sequelize.query('UPDATE products SET category_id = NULL WHERE category_id IS NOT NULL');
    await sequelize.query('UPDATE banners SET category_id = NULL WHERE category_id IS NOT NULL');
    await Category.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    console.log('cleared existing categories');
  }

  // Shared tree for product/service/banner (getTree includes type=all)
  await walk(HIERARCHICAL_CATEGORIES, null, 'all');
  const after = await Category.count();
  console.log(`✅ seeded ${after} categories (type=all)`);
}

main()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('❌ seed failed:', err);
    try { await sequelize.close(); } catch (_) {}
    process.exit(1);
  });
