const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Comment = sequelize.define('Comment', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  cardId: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  cardType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['Product', 'Service', 'Banner']]
    }
  },
  userId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [1, 1000]
    }
  },
  deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  indexes: [
    { fields: ['card_id', 'card_type'] },
    { fields: ['user_id'] },
    { fields: ['created_at'] },
    { fields: ['deleted'] }
  ],
  tableName: 'comments'
});

// Static method to get comments by card with pagination
Comment.getCommentsByCard = async function(cardId, cardType, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  return this.findAll({
    where: {
      cardId,
      cardType,
      deleted: false
    },
    include: [{
      model: require('../models/User'),
      as: 'user',
      attributes: ['id', 'username']
    }],
    order: [['createdAt', 'DESC']],
    offset: skip,
    limit: limit,
    raw: true
  });
};

Comment.getCommentCount = async function(cardId, cardType) {
  return this.count({
    where: {
      cardId,
      cardType,
      deleted: false
    }
  });
};

module.exports = Comment;
