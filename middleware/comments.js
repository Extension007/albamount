// Middleware для проверки прав доступа к комментариям

const Product = require('../models/Product');

function getUserId(user) {
  if (!user) return null;
  return (user._id || user.id)?.toString() || null;
}

/**
 * Проверяет, может ли пользователь читать комментарии карточки
 * Гости и авторизованные пользователи могут читать комментарии одобренных карточек
 */
function isPublishedStatus(status) {
  return status === 'approved' || status === 'published';
}

function canViewCardDiscussion(card, user) {
  if (!card) return false;
  if (isPublishedStatus(card.status)) return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  const uid = getUserId(user);
  return Boolean(card.ownerId && uid && String(card.ownerId) === uid);
}

async function loadDiscussionCard(cardId) {
  let card = await Product.findByPk(cardId);
  if (card) {
    return { card, cardType: card.type === 'service' ? 'Service' : 'Product' };
  }
  return { card: null, cardType: null };
}

function canReadComments(req, res, next) {
  (async () => {
    const cardId = req.params.cardId;
    const { card, cardType } = await loadDiscussionCard(cardId);
    if (!card) {
      return res.status(404).json({ success: false, message: 'Карточка не найдена' });
    }
    if (!canViewCardDiscussion(card, req.user)) {
      return res.status(403).json({ success: false, message: 'Комментарии доступны только для опубликованных карточек' });
    }
    req.discussionCard = card;
    req.discussionCardType = cardType;
    next();
  })().catch(next);
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
    const { card, cardType } = await loadDiscussionCard(cardId);
    if (!card) {
      return { allowed: false, canWrite: false, canModerate: false, reason: 'Карточка не найдена' };
    }

    if (!canViewCardDiscussion(card, user)) {
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
      canWrite: Boolean(userId) && isPublishedStatus(card.status),
      canModerate: isAdmin,
      isOwner,
      cardType
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
  canViewCardDiscussion,
  loadDiscussionCard,
  getUserId
};
