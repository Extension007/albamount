const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const Product = require('../models/Product');
const Banner = require('../models/Banner');
const { notifyAdmin } = require('../services/adminNotificationService');
const { body, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { csrfProtection } = require('../middleware/csrf');
const { canReadComments, canWriteComments, canEditComments, canDeleteComments } = require('../middleware/comments');
const { Op } = require('sequelize');

// Получаем доступ к сокету для рассылки комментариев
let io = null;
const setSocketIO = (socketIo) => {
  io = socketIo;
};

// Rate limiter для комментариев (5 в минуту)
const commentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 5,
  message: { success: false, message: 'Слишком много комментариев. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware для проверки аутентификации
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Требуется авторизация' });
  }
  next();
};

// GET /api/comments/:cardId - получить комментарии для карточки
router.get('/:cardId', [
  param('cardId').isString().isLength({ min: 1 }).withMessage('Некорректный ID карточки'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { cardId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    // Определяем тип карточки (проверяем в Product и Banner)
    let cardType = null;

    // Сначала проверяем Product
    let card = await Product.findByPk(cardId);
    if (card) {
      cardType = card.type === 'service' ? 'Service' : 'Product';
    } else {
      // Если не найден, проверяем Banner
      card = await Banner.findByPk(cardId);
      if (card) {
        cardType = 'Banner';
      } else {
        return res.status(404).json({ success: false, message: 'Карточка не найдена' });
      }
    }

    const comments = await Comment.getCommentsByCard(cardId, cardType, page, limit);
    const total = await Comment.getCommentCount(cardId, cardType);

    res.json({
      success: true,
      comments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Ошибка получения комментариев:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// POST /api/comments/:cardId - создать комментарий
router.post('/:cardId', canWriteComments, commentLimiter, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { text } = req.body;

    // Проверяем cardId
    if (!cardId || !/^[a-f0-9]{32,}$/i.test(cardId)) {
      return res.status(400).json({ success: false, message: 'Некорректный ID карточки' });
    }

    // Проверяем text
    if (!text || typeof text !== 'string' || text.trim().length < 1 || text.trim().length > 1000) {
      return res.status(400).json({ success: false, message: 'Текст комментария должен быть от 1 до 1000 символов' });
    }

    // Определяем тип карточки
    let cardType = null;
    let card = await Product.findByPk(cardId);
    if (card) {
      cardType = card.type === 'service' ? 'Service' : 'Product';
    } else {
      card = await Banner.findByPk(cardId);
      if (card) {
        cardType = 'Banner';
      } else {
        return res.status(404).json({ success: false, message: 'Карточка не найдена' });
      }
    }

    // Проверяем статус карточки (только approved карточки могут иметь комментарии)
    if (card.status !== 'approved') {
      return res.status(403).json({ success: false, message: 'Комментарии доступны только для опубликованных карточек' });
    }

    const comment = await Comment.create({
      cardId,
      cardType,
      userId: req.user.id,
      text: text.trim()
    });

    // Get user data for response
    const User = require('../models/User');
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'username'] });

    // Отправляем комментарий через сокет остальным участникам чата
    if (io) {
      try {
        const roomName = `card_${cardId}`;
        io.to(roomName).emit('comment:new', {
          id: comment.id,
          userId: user.id,
          username: user.username || 'Пользователь',
          text: comment.text,
          createdAt: comment.createdAt
        });
      } catch (socketErr) {
        console.error('Ошибка отправки комментария через сокет:', socketErr);
      }
    }

    res.status(201).json({
      success: true,
      comment: {
        ...comment.get({ plain: true }),
        user
      },
      message: 'Комментарий добавлен'
    });
  } catch (err) {
    console.error('Ошибка создания комментария:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// PUT /api/comments/:id - редактировать комментарий (только админ)
router.put('/:id', canEditComments, csrfProtection, [
  param('id').isString().withMessage('Некорректный ID комментария'),
  body('text').isLength({ min: 1, max: 1000 }).withMessage('Текст комментария должен быть от 1 до 1000 символов')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { id } = req.params;
    const { text } = req.body;

    const comment = await Comment.findByPk(id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Комментарий не найден' });
    }

    comment.text = text.trim();
    await comment.save();

    // Отправляем обновленный комментарий через сокет остальным участникам чата
    if (io) {
      try {
        const roomName = `card_${comment.cardId}`;
        io.to(roomName).emit('comment:updated', {
          id: comment.id,
          text: comment.text,
          updatedAt: comment.updatedAt
        });
      } catch (socketErr) {
        console.error('Ошибка отправки обновления комментария:', socketErr);
      }
    }

    res.json({
      success: true,
      comment: comment.get({ plain: true }),
      message: 'Комментарий обновлен'
    });
  } catch (err) {
    console.error('Ошибка редактирования комментария:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// DELETE /api/comments/:id - удалить комментарий (только админ)
router.delete('/:id', canDeleteComments, csrfProtection, async (req, res) => {
  try {
    const { id } = req.params;

    const comment = await Comment.findByPk(id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Комментарий не найден' });
    }

    // Soft delete
    comment.deleted = true;
    await comment.save();

    // Отправляем уведомление об удалении всем участникам комнаты
    if (io) {
      try {
        const roomName = `card_${comment.cardId}`;
        io.to(roomName).emit('comment:deleted', {
          id: comment.id
        });
      } catch (socketErr) {
        console.error('Ошибка отправки удаления комментария:', socketErr);
      }
    }

    res.json({
      success: true,
      message: 'Комментарий удален'
    });
  } catch (err) {
    console.error('Ошибка удаления комментария:', err);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// Экспортируем оба объекта: роутер и функцию установки сокета
module.exports = {
  router: router,
  setSocketIO: setSocketIO
};