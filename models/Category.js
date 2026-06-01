const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Category = sequelize.define('Category', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  parentId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'categories',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.STRING(20),
    defaultValue: 'all',
    validate: {
      isIn: [['product', 'service', 'banner', 'all']]
    }
  },
  icon: {
    type: DataTypes.STRING(50),
    defaultValue: ''
  },
  description: {
    type: DataTypes.STRING(500),
    defaultValue: ''
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  indexes: [
    { fields: ['parent_id'] },
    { fields: ['type'] },
    { fields: ['active'] },
    { fields: ['parent_id', 'type'] },
    { fields: ['order'] }
  ],
  tableName: 'categories'
});

// Build tree from flat list
function buildTree(categories) {
  const map = new Map();
  const roots = [];

  // First pass: create map
  categories.forEach(cat => {
    map.set(cat.id, { ...cat, children: [] });
  });

  // Second pass: assign children
  categories.forEach(cat => {
    const node = map.get(cat.id);
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

Category.getTree = async function(type = 'all', includeInactive = false) {
  const where = includeInactive ? {} : { isActive: true };
  if (type !== 'all') {
    where.type = type;
  }
  const categories = await this.findAll({
    where,
    order: [['order', 'ASC'], ['name', 'ASC']],
    raw: true
  });
  return buildTree(categories);
};

Category.getFlatList = async function(type = 'all', includeInactive = false) {
  const where = includeInactive ? {} : { isActive: true };
  if (type !== 'all') {
    where.type = type;
  }
  if (type !== 'all') {
    where.type = type;
  }
  const categories = await this.findAll({
    where,
    attributes: ['id', 'name', 'icon', 'type', 'parentId'],
    order: [['order', 'ASC'], ['name', 'ASC']],
    raw: true
  });

  const result = {};

  function flatten(cats, prefix = '') {
    cats.forEach(cat => {
      const path = cat.id.toString();
      result[path] = {
        _id: cat.id,
        id: cat.id, // Add both for compatibility
        name: cat.name,
        icon: cat.icon || '',
        type: cat.type,
        path: path
      };
      if (cat.children && cat.children.length > 0) {
        flatten(cat.children, path);
      }
    });
  };

  const tree = buildTree(categories);
  flatten(tree);
  return result;
};

Category.findByPath = async function(path, type = 'all') {
  if (!path) return null;
  const parts = path.split('.');
  let current = null;
  for (const part of parts) {
    const id = parseInt(part, 10);
    const where = { id };
    if (type !== 'all') {
      where.type = type;
    }
    current = await this.findOne({ where, raw: true });
    if (!current) break;
  }
  return current;
};

module.exports = Category;
