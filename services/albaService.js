const { Op } = require("../config/database");
const { fn, col, literal } = require('sequelize');
const AlbaTransaction = require("../models/AlbaTransaction");
const Entitlement = require("../models/Entitlement");
const { randomUUID } = require('crypto');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Calculate user's ALBA balance as sum of all transactions
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Calculated balance
 */
async function getUserAlbaBalance(userId) {
  const result = await AlbaTransaction.findOne({
    attributes: [
      [fn('SUM', col('amount')), 'balance']
    ],
    where: { userId }
  });
  return result ? parseFloat(result.get('balance')) || 0 : 0;
}

async function incBalance(UserModel, userId, delta) {
   return UserModel.update(
     { albaBalance: { [Op.inc]: delta } },
     { where: { id: userId } }
   );
}

async function addTx(UserModel, { userId, amount, type, reason, relatedUserId=null, relatedCodeId=null, relatedCardType=null, relatedCardId=null, meta={} }) {
  // Check if the operation would result in negative balance
  if (amount < 0) {
    const currentBalance = await getUserAlbaBalance(userId);
    if (currentBalance + amount < 0) {
      throw new Error('Transaction would result in negative balance');
    }
  }
  
  // Update both the calculated balance field and create transaction
  const [userRows] = await incBalance(UserModel, userId, amount);
  const transaction = await AlbaTransaction.create({ userId, amount, type, reason, relatedUserId, relatedCodeId, relatedCardType, relatedCardId, meta });
  return { user: userRows, transaction };
}

async function grantAlba({ UserModel, userId, amount, reason, actorAdminId=null, meta={} }) {
  if (amount <= 0) throw new Error('Amount must be positive');
  const result = await addTx(UserModel, { userId, amount, type: 'grant', reason, relatedUserId: actorAdminId, meta });
  return result.user;
}

async function grantAlbaByUsername(login, amount, reason, adminId = null, comment = '') {
  const user = await User.findOne({ where: { username: login } });
  if (!user) throw new Error("User not found");
  if (!user.emailVerified) throw new Error("Email not verified");

  try {
    const result = await addTx(User, {
      userId: user.id,
      amount,
      type: 'grant',
      reason,
      relatedUserId: adminId,
      comment,
      meta: { source: 'admin_grant_by_username' }
    });

    const originalBalance = await getUserAlbaBalance(user.id);
    const newBalance = originalBalance + amount;
    
    await AuditLog.create({
      action: 'alba_grant',
      userId: user.id,
      targetUserId: user.id,
      adminId,
      amount: amount,
      reason: reason,
      details: {
        originalBalance: originalBalance,
        newBalance: newBalance,
        login: login
      }
    });

    return { user, tx: result.transaction };
  } catch (error) {
    if (error.message === 'Transaction would result in negative balance') {
      throw new Error('Grant operation would result in negative balance');
    }
    throw error;
  }
}

async function earnReferralBonus({ UserModel, referrerUserId, referredUserId, amount=30 }) {
  const result = await addTx(UserModel, { userId: referrerUserId, amount, type:'earn', reason:'referral_bonus', relatedUserId: referredUserId });
  return result.user;
}

async function spendAlba({ UserModel, userId, amount, reason, relatedCardType=null, relatedCardId=null, meta={} }) {
  if (amount <= 0) throw new Error('Amount must be positive');

  const allowedUserReasons = ['card_entitlement_purchase'];
  const allowedAdminReasons = ['admin_grant', 'manual_adjustment'];

  if (!allowedUserReasons.includes(reason) && !allowedAdminReasons.includes(reason)) {
    return { ok: false, status: 403, message: `Reason '${reason}' is not allowed for ALBA spend operations` };
  }

  const currentBalance = await getUserAlbaBalance(userId);
  if (currentBalance < amount) return { ok:false, status:400, message:`Insufficient ALBA balance. Required: ${amount}, available: ${currentBalance}` };
   
  try {
    const result = await addTx(UserModel, { userId, amount: -amount, type:'spend', reason, relatedCardType, relatedCardId, meta });
    return { ok: true, user: result.user, transaction: result.transaction };
  } catch (error) {
    if (error.message === 'Transaction would result in negative balance') {
      return { ok: false, status: 400, message: `Insufficient ALBA balance. Required: ${amount}, available: ${currentBalance}` };
    }
    throw error;
  }
}

async function listTransactions({ userId, limit=100 }) {
  return AlbaTransaction.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: limit
  });
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

  const user = await UserModel.findByPk(userId);
  if (!user) {
    return { ok: false, status: 404, message: 'User not found' };
  }

  const requiredAmount = 30;
  const currentBalance = await getUserAlbaBalance(userId);
  if (currentBalance < requiredAmount) {
    return { ok: false, status: 400, message: `Insufficient ALBA balance. Required: ${requiredAmount}, available: ${currentBalance}` };
  }

  const eventId = randomUUID();

  // Use transaction
  const t = await require('../config/database').sequelize.transaction();
  try {
    const spendResult = await spendAlba({
      UserModel,
      userId,
      amount: requiredAmount,
      reason: 'card_entitlement_purchase',
      relatedCardType: type,
      meta: { eventId, idempotencyKey }
    });

    if (!spendResult.ok) {
      await t.rollback();
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

    await t.commit();
    
    return { ok: true, entitlement, transaction: spendResult.transaction };
  } catch (error) {
    await t.rollback();
    console.error('Error purchasing entitlement:', error);
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

async function consumeEntitlement(entitlementId) {
   const entitlement = await Entitlement.findByPk(entitlementId);
  if (!entitlement) {
    return { ok: false, status: 404, message: 'Entitlement not found' };
  }

  if (entitlement.status !== 'available') {
    return { ok: false, status: 400, message: 'Entitlement already consumed' };
  }

  entitlement.status = 'consumed';
  await entitlement.save();
  return { ok: true, entitlement };
}

module.exports = {
  grantAlba,
  earnReferralBonus,
  spendAlba,
  listTransactions,
  purchaseEntitlement,
  getAvailableEntitlementsCount,
  getAvailableEntitlements,
  consumeEntitlement,
  grantAlbaByUsername,
  getUserAlbaBalance
};
