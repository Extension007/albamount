// Middleware для проверки прав доступа к комментариям

const Comment = require('../models/Comment');
const Product = require('../models/Product');

function getUserId(user) {
  if (!user) return null;
  return (user._id || user.id)?.toString() || null;
}

/**
 * Проверяет, может ли пользователь читать комментарии карточки
 * Гости и авторизованные пользователи могут читать комментарии одобренных карточек
 */
function canReadComments(req, res, next) {
  next();
}

/**
 * Проверяет, может ли пользователь писать комментарии
 * Только авторизованные пользователи могут писать комментарии
 */
function canWriteComments(req, res, next) {
  if (!req.user) {
    const wantsJson = req.xhr || req.get('accept')?.includes('application/json');
    if (wantsJson) {
      return res.status(401).json({ success: false, message: 'Требуется авторизация для добавления комментариев' });
    }
    return res.redirect('/user/login');
  }
  next();
}

/**
 * Проверяет, может ли пользователь редактировать комментарий
 * Только администраторы могут редактировать комментарии
 */
function canEditComments(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    const wantsJson = req.xhr || req.get('accept')?.includes('application/json');
    if (wantsJson) {
      return res.status(403).json({ success: false, message: 'Только администраторы могут редактировать комментарии' });
    }
    return res.status(403).send('Только администраторы могут редактировать комментарии');
  }
  next();
}

/**
 * Проверяет, может ли пользователь удалять комментарий
 * Только администраторы могут удалять комментарии
 */
function canDeleteComments(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    const wantsJson = req.xhr || req.get('accept')?.includes('application/json');
    if (wantsJson) {
      return res.status(403).json({ success: false, message: 'Только администраторы могут удалять комментарии' });
    }
    return res.status(403).send('Только администраторы могут удалять комментарии');
  }
  next();
}

/**
 * Проверяет доступ к чату карточки для WebSocket
 * @param {string} cardId - ID карточки
 * @param {object} user - пользователь (может быть null для гостей)
 * @returns {object} - { allowed: boolean, canWrite: boolean, canModerate: boolean }
 */
async function checkChatAccess(cardId, user) {
  try {
    const card = await Product.findByPk(cardId);
    if (!card) {
      return { allowed: false, canWrite: false, canModerate: false, reason: 'Карточка не найдена' };
    }

    if (card.status !== 'approved') {
      return { allowed: false, canWrite: false, canModerate: false, reason: 'Чат доступен только для опубликованных карточек' };
    }

    if (!user) {
      return { allowed: true, canWrite: false, canModerate: false, reason: 'Гость - только чтение' };
    }

    const isAdmin = user.role === 'admin';
    const userId = getUserId(user);
    const isOwner = card.ownerId && userId && card.ownerId.toString() === userId;

    return {
      allowed: true,
      canWrite: Boolean(userId),
      canModerate: isAdmin,
      isOwner,
      cardType: card.type === 'service' ? 'Service' : 'Product'
    };
  } catch (error) {
    console.error('❌ Ошибка проверки доступа к чату:', error);
    return { allowed: false, canWrite: false, canModerate: false, reason: 'Ошибка проверки доступа' };
  }
}

module.exports = {
  canReadComments,
  canWriteComments,
  canEditComments,
  canDeleteComments,
  checkChatAccess,
  getUserId
};
