const { fn, col } = require('sequelize');
const AlbaTransaction = require("../models/AlbaTransaction");
const Entitlement = require("../models/Entitlement");
const { randomUUID } = require('crypto');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');
const { sequelize } = require('../config/database');

async function getUserAlbaBalance(userId, options = {}) {
  const result = await AlbaTransaction.findOne({
    attributes: [
      [fn('SUM', col('amount')), 'balance']
    ],
    where: { userId },
    transaction: options.transaction
  });
  return result ? parseFloat(result.get('balance')) || 0 : 0;
}

async function addTx(UserModel, {
  userId,
  amount,
  type,
  reason,
  relatedUserId = null,
  relatedCodeId = null,
  relatedCardType = null,
  relatedCardId = null,
  meta = {},
  transaction = null
}) {
  const run = async (t) => {
    await UserModel.findByPk(userId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    const currentBalance = await getUserAlbaBalance(userId, { transaction: t });
    if (amount < 0 && currentBalance + amount < 0) {
      throw new Error('Transaction would result in negative balance');
    }

    const txRow = await AlbaTransaction.create({
      userId,
      amount,
      type,
      reason,
      relatedUserId,
      relatedCodeId,
      relatedCardType,
      relatedCardId,
      meta
    }, { transaction: t });

    const ledgerBalance = await getUserAlbaBalance(userId, { transaction: t });
    await UserModel.update(
      { albaBalance: ledgerBalance },
      { where: { id: userId }, transaction: t }
    );

    const user = await UserModel.findByPk(userId, { transaction: t });
    if (user) user.albaBalance = ledgerBalance;
    return { user, transaction: txRow };
  };

  if (transaction) {
    return run(transaction);
  }

  return sequelize.transaction(async (t) => run(t));
}

async function grantAlba({ UserModel, userId, amount, reason, actorAdminId = null, meta = {} }) {
  if (amount <= 0) throw new Error('Amount must be positive');
  const result = await addTx(UserModel, { userId, amount, type: 'grant', reason, relatedUserId: actorAdminId, meta });
  return result.user;
}

async function grantAlbaByUsername(login, amount, reason, adminId = null, comment = '') {
  const { Op } = require('sequelize');
  const normalizedLogin = String(login || '').trim();
  if (!normalizedLogin) throw new Error('User not found');

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  const user = await User.findOne({
    where: { username: { [Op.iLike]: normalizedLogin } }
  });
  if (!user) throw new Error('User not found');

  const relatedAdminId = adminId != null && String(adminId).trim() !== ''
    ? parseInt(String(adminId), 10)
    : null;
  const safeAdminId = Number.isFinite(relatedAdminId) ? relatedAdminId : null;

  try {
    const result = await addTx(User, {
      userId: user.id,
      amount: parsedAmount,
      type: 'grant',
      reason,
      relatedUserId: safeAdminId,
      meta: { source: 'admin_grant_by_username', comment: comment || '' }
    });

    const newBalance = await getUserAlbaBalance(user.id);
    if (result.user) {
      result.user.albaBalance = newBalance;
    }

    await AuditLog.create({
      action: 'alba_grant',
      userId: user.id,
      targetUserId: user.id,
      adminId: safeAdminId,
      amount: parsedAmount,
      reason: reason,
      details: {
        newBalance,
        login: normalizedLogin,
        comment: comment || ''
      }
    });

    return { user: result.user || user, tx: result.transaction, balance: newBalance };
  } catch (error) {
    if (error.message === 'Transaction would result in negative balance') {
      throw new Error('Grant operation would result in negative balance');
    }
    throw error;
  }
}

const ENTITLEMENT_COST_ALBA = 30;

async function earnReferralBonus({ UserModel, referrerUserId, referredUserId, amount = 10 }) {
  const result = await addTx(UserModel, {
    userId: referrerUserId,
    amount,
    type: 'earn',
    reason: 'referral_bonus',
    relatedUserId: referredUserId
  });
  return result.user;
}

async function spendAlba({
  UserModel,
  userId,
  amount,
  reason,
  relatedCardType = null,
  relatedCardId = null,
  meta = {},
  transaction = null
}) {
  if (amount <= 0) throw new Error('Amount must be positive');

  const allowedUserReasons = ['card_entitlement_purchase', 'upgrade_to_paid'];
  const allowedAdminReasons = ['admin_grant', 'manual_adjustment'];

  if (!allowedUserReasons.includes(reason) && !allowedAdminReasons.includes(reason)) {
    return { ok: false, status: 403, message: `Reason '${reason}' is not allowed for ALBA spend operations` };
  }

  try {
    const result = await addTx(UserModel, {
      userId,
      amount: -amount,
      type: 'spend',
      reason,
      relatedCardType,
      relatedCardId,
      meta,
      transaction
    });
    return { ok: true, user: result.user, transaction: result.transaction };
  } catch (error) {
    if (error.message === 'Transaction would result in negative balance') {
      const currentBalance = await getUserAlbaBalance(userId, { transaction });
      return {
        ok: false,
        status: 400,
        message: `Insufficient ALBA balance. Required: ${amount}, available: ${currentBalance}`
      };
    }
    throw error;
  }
}

async function listTransactions({ userId, limit = 100 }) {
  const { formatAlbaTransactions } = require('../utils/albaLabels');
  const numericId = parseInt(String(userId), 10);
  const rows = await AlbaTransaction.findAll({
    where: { userId: Number.isFinite(numericId) ? numericId : userId },
    order: [['createdAt', 'DESC']],
    limit: Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200)
  });
  return formatAlbaTransactions(rows);
}

async function purchaseEntitlement({ UserModel, userId, type, idempotencyKey }) {
  if (!['product', 'service'].includes(type)) {
    return { ok: false, status: 400, message: 'Invalid entitlement type. Must be "product" or "service"' };
  }

  const existingEntitlement = await Entitlement.findOne({
    where: {
      idempotencyKey,
      ownerId: userId,
      type
    }
  });

  if (existingEntitlement) {
    return { ok: true, entitlement: existingEntitlement, message: 'Entitlement already purchased (idempotent)' };
  }

  const requiredAmount = ENTITLEMENT_COST_ALBA;
  const eventId = randomUUID();

  try {
    const result = await sequelize.transaction(async (t) => {
      const user = await UserModel.findByPk(userId, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!user) {
        return { ok: false, status: 404, message: 'User not found' };
      }

      const spendResult = await spendAlba({
        UserModel,
        userId,
        amount: requiredAmount,
        reason: 'card_entitlement_purchase',
        relatedCardType: type,
        meta: { eventId, idempotencyKey },
        transaction: t
      });

      if (!spendResult.ok) {
        return spendResult;
      }

      const entitlement = await Entitlement.create({
        ownerId: userId,
        type,
        status: 'available',
        source: 'purchase',
        idempotencyKey,
        eventId,
        relatedTransactionId: spendResult.transaction.id
      }, { transaction: t });

      return { ok: true, entitlement, transaction: spendResult.transaction };
    });

    return result;
  } catch (error) {
    // Unique idempotency race: return existing
    if (error.name === 'SequelizeUniqueConstraintError') {
      const existing = await Entitlement.findOne({
        where: { idempotencyKey, ownerId: userId, type }
      });
      if (existing) {
        return { ok: true, entitlement: existing, message: 'Entitlement already purchased (idempotent)' };
      }
    }
    logger.error({ msg: 'purchase_entitlement_error', error: error.message });
    return { ok: false, status: 500, message: 'Error purchasing entitlement: ' + error.message };
  }
}

async function getAvailableEntitlementsCount(userId, type) {
  return Entitlement.count({
    where: {
      ownerId: userId,
      type,
      status: 'available'
    }
  });
}

async function getAvailableEntitlements(userId) {
  return Entitlement.findAll({
    where: {
      ownerId: userId,
      status: 'available'
    }
  });
}

async function consumeEntitlement(entitlementId, options = {}) {
  const [updated] = await Entitlement.update(
    { status: 'consumed' },
    {
      where: {
        id: entitlementId,
        status: 'available'
      },
      transaction: options.transaction
    }
  );

  if (!updated) {
    const entitlement = await Entitlement.findByPk(entitlementId, {
      transaction: options.transaction
    });
    if (!entitlement) {
      return { ok: false, status: 404, message: 'Entitlement not found' };
    }
    return { ok: false, status: 400, message: 'Entitlement already consumed' };
  }

  const entitlement = await Entitlement.findByPk(entitlementId, {
    transaction: options.transaction
  });
  return { ok: true, entitlement };
}

/**
 * Refund ALBA spent on a paid card when moderation rejects it.
 * Idempotent per card. Free cards are skipped. Only pending→reject path should call this.
 */
async function refundAlbaOnModerationReject({ card, actorAdminId = null }) {
  if (!card) {
    return { ok: false, status: 404, message: 'Card not found' };
  }

  const tier = card.tier || 'free';
  if (tier !== 'paid') {
    return { ok: true, refunded: false, reason: 'free_card' };
  }

  const ownerId = card.ownerId || card.owner;
  if (!ownerId) {
    return { ok: false, status: 400, message: 'Card has no owner' };
  }

  const cardType = card.type === 'service' ? 'service' : 'product';

  const existingRefund = await AlbaTransaction.findOne({
    where: {
      reason: 'moderation_refund',
      relatedCardId: card.id,
      relatedCardType: cardType
    }
  });

  if (existingRefund) {
    return { ok: true, refunded: false, reason: 'already_refunded', transaction: existingRefund };
  }

  const result = await addTx(User, {
    userId: ownerId,
    amount: ENTITLEMENT_COST_ALBA,
    type: 'grant',
    reason: 'moderation_refund',
    relatedUserId: actorAdminId,
    relatedCardType: cardType,
    relatedCardId: card.id,
    meta: {
      source: 'moderation_reject',
      cardName: card.name || null
    }
  });

  await AuditLog.create({
    action: 'alba_moderation_refund',
    userId: ownerId,
    targetUserId: ownerId,
    adminId: actorAdminId,
    amount: ENTITLEMENT_COST_ALBA,
    reason: 'moderation_refund',
    details: {
      cardId: card.id,
      cardType,
      transactionId: result.transaction?.id
    }
  });

  return { ok: true, refunded: true, transaction: result.transaction, user: result.user };
}

module.exports = {
  ENTITLEMENT_COST_ALBA,
  grantAlba,
  earnReferralBonus,
  spendAlba,
  listTransactions,
  getUserAlbaBalance,
  purchaseEntitlement,
  getAvailableEntitlementsCount,
  getAvailableEntitlements,
  consumeEntitlement,
  grantAlbaByUsername,
  refundAlbaOnModerationReject,
  addTx
};
