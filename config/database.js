const { Sequelize, DataTypes, Op } = require("sequelize");

// Флаг доступности PostgreSQL
const USE_POSTGRES = process.env.DATABASE_URL !== undefined;

const dbUrl = process.env.DATABASE_URL || "";
const useSsl =
  process.env.DATABASE_SSL === "true" ||
  dbUrl.includes("sslmode=require") ||
  dbUrl.includes("neon.tech");

// Подключение к базе данных
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  ...(useSsl
    ? {
        dialectOptions: {
          ssl: {
            require: true,
            // Set DATABASE_SSL_REJECT_UNAUTHORIZED=true when CA is configured
            rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
          }
        }
      }
    : {}),
  logging: false,
  pool: {
    max: process.env.VERCEL ? 5 : 10,
    min: 0,
    acquire: 20000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }
});

// Export sequelize early for models that need it (like Category in separate file)
module.exports.sequelize = sequelize;

// === USER MODEL ===
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 100]
    }
  },
  email: {
    type: DataTypes.STRING(200),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  role: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'user',
    validate: {
      isIn: [['user', 'admin']]
    }
  },
  accountType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'showcase',
    validate: {
      isIn: [['showcase', 'services']]
    }
  },
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  verificationToken: DataTypes.STRING,
  verificationTokenExpires: DataTypes.DATE,
  verifiedAt: DataTypes.DATE,
  lastVerificationSent: DataTypes.DATE,
  slots_total: {
    type: DataTypes.INTEGER,
    defaultValue: 2
  },
  slots_used: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  albaBalance: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  },
  refCode: {
    type: DataTypes.STRING(50),
    unique: true,
    index: true
  },
  referredBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  refBonusGranted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  indexes: [
    { fields: ['username'] },
    { fields: ['email'] },
    { fields: ['ref_code'] }
  ]
});

// === PRODUCT MODEL ===
const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  description: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  price: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  link: DataTypes.STRING(1000),
  images: {
    type: DataTypes.JSONB,
    defaultValue: [],
    validate: {
      maxFive(value) {
        if (value == null) return;
        if (!Array.isArray(value)) {
          throw new Error('images must be an array');
        }
        if (value.length > 5) {
          throw new Error('Maximum 5 images allowed');
        }
      }
    }
  },
  image_url: DataTypes.STRING(1000),
  video_url: DataTypes.STRING(1000),
  contacts: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  ownerId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  voters: {
    type: DataTypes.ARRAY(DataTypes.STRING(50)),
    defaultValue: []
  },
  categoryId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'categories',
      key: 'id'
    }
  },
  category: {
    type: DataTypes.STRING(200),
    defaultValue: ''
  },
  type: {
    type: DataTypes.STRING(20),
    defaultValue: 'product',
    validate: {
      isIn: [['product', 'service']]
    }
  },
  likes: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  dislikes: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  rating_updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'approved', 'rejected']]
    }
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  tier: {
    type: DataTypes.STRING(20),
    defaultValue: 'free',
    validate: {
      isIn: [['free', 'paid']]
    }
  },
  tierRequested: {
    type: DataTypes.STRING(20),
    defaultValue: 'free',
    validate: {
      isIn: [['free', 'paid']]
    }
  },
  editCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  adminComment: DataTypes.STRING,
  rejectionReason: DataTypes.STRING,
  paymentStatus: {
    type: DataTypes.STRING(20),
    defaultValue: 'none',
    validate: {
      isIn: [['none', 'requested', 'paid']]
    }
  },
  activationCodeId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'codes',
      key: 'id'
    }
  },
  deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  indexes: [
    { fields: ['status'] },
    { fields: ['owner_id'] },
    { fields: ['category'] },
    { fields: ['created_at'] },
    { fields: ['deleted'] },
    { fields: ['type'] },
    { fields: ['status', 'type'] },
    { fields: ['status', 'category'] },
    { fields: ['status', 'deleted'] },
    { fields: ['category', 'status', 'created_at'] },
    { fields: ['rating_updated_at'] }
  ]
});

// Add virtual getters for result and total
Product.prototype.result = function() {
  return (this.likes || 0) - (this.dislikes || 0);
};

Product.prototype.total = function() {
  return (this.likes || 0) + (this.dislikes || 0);
};

// === BANNER MODEL ===
const Banner = sequelize.define('Banner', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  link: {
    type: DataTypes.STRING(1000),
    defaultValue: ''
  },
  video_url: DataTypes.STRING(1000),
  ownerId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  categoryId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'categories',
      key: 'id'
    }
  },
  category: {
    type: DataTypes.STRING(200),
    defaultValue: ''
  },
  price: DataTypes.STRING,
  images: {
    type: DataTypes.JSONB,
    defaultValue: [],
    validate: {
      maxFive(value) {
        if (value == null) return;
        if (!Array.isArray(value)) {
          throw new Error('images must be an array');
        }
        if (value.length > 5) {
          throw new Error('Maximum 5 images allowed');
        }
      }
    }
  },
  image_url: DataTypes.STRING(1000),
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'published',
    validate: {
      isIn: [['published', 'blocked', 'draft', 'pending', 'approved', 'rejected']]
    }
  },
  rejection_reason: DataTypes.STRING,
  tier: {
    type: DataTypes.STRING(20),
    defaultValue: 'free'
  },
  tierRequested: DataTypes.STRING(20),
  editCount: DataTypes.INTEGER,
  adminComment: DataTypes.STRING,
  rejectionReason: DataTypes.STRING,
  paymentStatus: DataTypes.STRING(20),
  activationCodeId: DataTypes.INTEGER,
  rating_up: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  rating_down: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  voters: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  rating_updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    { fields: ['status'] },
    { fields: ['owner_id'] },
    { fields: ['category'] },
    { fields: ['created_at'] },
    { fields: ['status', 'category'] }
  ]
});

Banner.prototype.imageUrl = function() {
  if (this.images && this.images.length > 0) {
    return this.images[0];
  }
  return this.image_url;
};

Banner.prototype.result = function() {
  return (this.rating_up || 0) - (this.rating_down || 0);
};

Banner.prototype.total = function() {
  return (this.rating_up || 0) + (this.rating_down || 0);
};

// === CONTACTINFO MODEL ===
const ContactInfo = sequelize.define('ContactInfo', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['admin', 'founder', 'service']]
    }
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  phone: DataTypes.STRING(50),
  description: DataTypes.TEXT
}, {
  indexes: [
    { fields: ['type'] }
  ]
});

// === CONTACTMESSAGE MODEL ===
const ContactMessage = sequelize.define('ContactMessage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  subject: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'contact_messages',
  indexes: [
    { fields: ['is_read'] },
    { fields: ['created_at'] }
  ]
});
const Statistics = sequelize.define('Statistics', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  value: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0
  }
});

// === ALBATRANSACTION MODEL ===
const AlbaTransaction = sequelize.define('AlbaTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    index: true
  },
  amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false
  },
  type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['earn', 'spend', 'grant']]
    }
  },
  reason: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isIn: [['referral_bonus', 'referred_user_bonus', 'card_payment', 'admin_grant', 'manual_adjustment', 'upgrade_to_paid', 'card_entitlement_purchase', 'moderation_refund']]
    }
  },
  relatedUserId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  relatedCodeId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'codes',
      key: 'id'
    }
  },
  relatedCardType: {
    type: DataTypes.STRING(20),
    validate: {
      isIn: [['product', 'service', 'banner', null]]
    }
  },
  relatedCardId: DataTypes.INTEGER,
  comment: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  meta: DataTypes.JSON
}, {
  indexes: [
    { fields: ['user_id'] },
    { fields: ['type'] },
    { fields: ['reason'] },
    { fields: ['created_at'] }
  ]
});

// === ENTITLEMENT MODEL ===
const Entitlement = sequelize.define('Entitlement', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ownerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    index: true
  },
  type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['product', 'service']]
    }
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'available',
    validate: {
      isIn: [['available', 'consumed']]
    }
  },
  source: {
    type: DataTypes.STRING(30),
    defaultValue: 'purchase',
    validate: {
      isIn: [['purchase', 'referral_migration', 'admin_migration', 'legacy_migration']]
    }
  },
  idempotencyKey: {
    type: DataTypes.STRING(100),
    unique: true,
    sparse: true
  },
  eventId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  relatedTransactionId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'albatransactions',
      key: 'id'
    }
  }
}, {
  indexes: [
    { fields: ['owner_id'] },
    { fields: ['type'] },
    { fields: ['status'] },
    { fields: ['owner_id', 'type', 'status'] },
    { fields: ['owner_id', 'type', 'idempotency_key'], unique: true }
  ]
});

// === CODE MODEL ===
const Code = sequelize.define('Code', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    index: true
  },
  kind: {
    type: DataTypes.STRING(30),
    allowNull: false,
    validate: {
      isIn: [['slot', 'payment_activation']]
    },
    index: true
  },
  type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['product', 'service', 'banner']]
    },
    index: true
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'active',
    validate: {
      isIn: [['active', 'used', 'expired']]
    },
    index: true
  },
  expiresAt: DataTypes.DATE,
  createdById: {
    type: DataTypes.INTEGER,
    field: 'created_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  usedById: {
    type: DataTypes.INTEGER,
    field: 'used_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  usedAt: DataTypes.DATE,
  reservedForUserId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    },
    index: true
  },
  cardId: {
    type: DataTypes.INTEGER,
    index: true
  },
  meta: DataTypes.JSON
});

// === CODEUSAGE MODEL ===
const CodeUsage = sequelize.define('CodeUsage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    index: true
  },
  codeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'codes',
      key: 'id'
    },
    index: true
  },
  kind: {
    type: DataTypes.STRING(30),
    allowNull: false,
    validate: {
      isIn: [['slot', 'payment_activation']]
    }
  },
  type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['product', 'service', 'banner']]
    }
  },
  ip: DataTypes.STRING,
  userAgent: DataTypes.TEXT,
  cardId: DataTypes.INTEGER,
  usedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'code_usage',
  indexes: [
    { fields: ['user_id', 'code_id'], unique: true }
  ]
});

// === AUDITLOG MODEL ===
const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false,
    index: true
  },
  userId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    },
    index: true
  },
  targetUserId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    },
    index: true
  },
  adminId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    },
    index: true
  },
  amount: DataTypes.DECIMAL(20, 2),
  reason: DataTypes.TEXT,
  details: DataTypes.JSON,
  ipAddress: DataTypes.STRING,
  userAgent: DataTypes.TEXT
}, {
  indexes: [
    { fields: ['action', 'created_at'] },
    { fields: ['user_id', 'action', 'created_at'] },
    { fields: ['admin_id', 'action', 'created_at'] }
  ]
});

// === VIDEOPOST MODEL ===
const VideoPost = sequelize.define('VideoPost', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    index: true
  },
  nickname: {
    type: DataTypes.STRING(100),
    defaultValue: ''
  },
  videoUrl: {
    type: DataTypes.STRING(1000),
    allowNull: false
  },
  platform: DataTypes.STRING(50),
  title: DataTypes.STRING(255),
  description: DataTypes.TEXT,
  genres: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    index: true
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'approved', 'rejected', 'blocked']]
    }
  },
  adminComment: DataTypes.STRING,
  rejectionReason: DataTypes.STRING,
  rating_up: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  rating_down: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  voters: {
    type: DataTypes.JSON,
    defaultValue: []
  }
}, {
  indexes: [
    { fields: ['user_id'] },
    { fields: ['status'] },
    { fields: ['created_at'] }
  ]
});

// === VOTE MODEL (atomic unique votes) ===
const Vote = sequelize.define('Vote', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  targetType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['product', 'service', 'banner', 'video']]
    }
  },
  targetId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  guestKey: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  vote: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: {
      isIn: [['up', 'down']]
    }
  }
}, {
  tableName: 'votes',
  indexes: [
    { fields: ['target_type', 'target_id'] },
    { fields: ['user_id'] }
  ]
});

// === ASSOCIATIONS ===

const Category = require('../models/Category');
const Comment = require('../models/Comment');
const VerificationToken = require('../models/VerificationToken');

// User associations
User.hasMany(Product, { as: 'products', foreignKey: 'ownerId' });
User.hasMany(Banner, { as: 'banners', foreignKey: 'ownerId' });
User.hasMany(Comment, { as: 'comments', foreignKey: 'userId' });
User.hasMany(Code, { as: 'createdCodes', foreignKey: 'createdById' });
User.hasMany(Code, { as: 'usedCodes', foreignKey: 'usedById' });
User.hasMany(AlbaTransaction, { as: 'transactions', foreignKey: 'userId' });
User.hasMany(Entitlement, { as: 'entitlements', foreignKey: 'ownerId' });
User.hasMany(VideoPost, { as: 'videoPosts', foreignKey: 'userId' });
User.hasMany(VerificationToken, { as: 'verificationTokens', foreignKey: 'userId' });
VerificationToken.belongsTo(User, { as: 'user', foreignKey: 'userId' });

// Category associations
Category.hasMany(Product, { as: 'products', foreignKey: 'categoryId' });
Category.hasMany(Banner, { as: 'banners', foreignKey: 'categoryId' });
Category.belongsTo(Category, { as: 'parent', foreignKey: 'parentId' });

// Product associations
Product.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });
Product.belongsTo(Category, { as: 'categoryRel', foreignKey: 'categoryId' });
Product.hasMany(Comment, { as: 'comments', foreignKey: 'cardId' });

// Banner associations
Banner.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });
Banner.belongsTo(Category, { as: 'categoryRel', foreignKey: 'categoryId' });
Banner.hasMany(Comment, { as: 'comments', foreignKey: 'cardId' });

// Comment associations
Comment.belongsTo(User, { as: 'user', foreignKey: 'userId' });

// Code associations
Code.belongsTo(User, { as: 'creator', foreignKey: 'createdById' });
Code.belongsTo(User, { as: 'usedBy', foreignKey: 'usedById' });

// Entitlement associations
Entitlement.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });
Entitlement.belongsTo(AlbaTransaction, { as: 'transaction', foreignKey: 'relatedTransactionId' });

// VideoPost associations
VideoPost.belongsTo(User, { as: 'user', foreignKey: 'userId' });

// AlbaTransaction associations
AlbaTransaction.belongsTo(User, { as: 'user', foreignKey: 'userId' });
AlbaTransaction.belongsTo(User, { as: 'relatedUser', foreignKey: 'relatedUserId' });

// CodeUsage associations
CodeUsage.belongsTo(User, { as: 'user', foreignKey: 'userId' });
CodeUsage.belongsTo(Code, { as: 'code', foreignKey: 'codeId' });

// AuditLog associations
AuditLog.belongsTo(User, { as: 'user', foreignKey: 'userId' });

// IDs are INTEGER SERIAL in Postgres — no client-side hex generation

let dbConnected = USE_POSTGRES ? null : false;

async function refreshDbConnection() {
  if (!USE_POSTGRES) {
    dbConnected = false;
    return false;
  }
  try {
    await sequelize.authenticate();
    try {
      await sequelize.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'showcase'`
      );
    } catch (schemaErr) {
      console.warn("account_type column ensure skipped:", schemaErr.message);
    }
    dbConnected = true;
    return true;
  } catch (error) {
    dbConnected = false;
    return false;
  }
}

sequelize.addHook('afterFind', (instances) => {
  if (!instances) return;
  const rows = Array.isArray(instances) ? instances : [instances];
  for (const row of rows) {
    if (row?.dataValues?.id != null && row.dataValues._id == null) {
      row.dataValues._id = row.dataValues.id;
    }
  }
});

// Проверка подключения
async function testConnection() {
  const ok = await refreshDbConnection();
  if (ok) {
    console.log("✅ Подключение к PostgreSQL установлено успешно.");
  } else if (USE_POSTGRES) {
    console.error("❌ Не удалось подключиться к PostgreSQL");
  }
  return ok;
}

function isDbConnected() {
  return Boolean(dbConnected);
}

function isDatabaseConfigured() {
  return USE_POSTGRES;
}

/** @deprecated use isDatabaseConfigured */
function hasMongo() {
  return USE_POSTGRES;
}

module.exports = {
  sequelize,
  testConnection,
  refreshDbConnection,
  isDbConnected,
  USE_POSTGRES,
  isDatabaseConfigured,
  hasMongo,
  Op,
  Sequelize,
  DataTypes,
  // Models
  User,
  Product,
  Banner,
  Category,
  Comment,
  ContactInfo,
  ContactMessage,
  Statistics,
  AlbaTransaction,
  Entitlement,
  Code,
  CodeUsage,
  AuditLog,
  VideoPost,
  VerificationToken,
  Vote
};
