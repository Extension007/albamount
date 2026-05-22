const { earnReferralBonus, addTx } = require('./albaService');
const AlbaTransaction = require('../models/AlbaTransaction');
const { randomUUID } = require('crypto');

// Get referral bonus amount from environment or use default
const REFERRAL_BONUS_ALBA = parseInt(process.env.REFERRAL_BONUS_ALBA) || 10;

async function grantReferralBonusIfEligible({ UserModel, user }) {
  // Log referral bonus check
  console.log(`Checking referral bonus eligibility for user ${user.id}`);

  if (user.emailVerified !== true) {
    console.log(`User ${user.id} is not email verified, skipping referral bonus`);
    return;
  }
  
   if (!user.referredBy) {
     console.log(`User ${user.id} has no referrer, skipping referral bonus`);
     return;
   }
   
   if (user.refBonusGranted === true) {
     console.log(`User ${user.id} already received referral bonus, skipping`);
     return;
   }

   // Check if referral bonus was already granted (idempotent check)
   const existingTransaction = await AlbaTransaction.findOne({
     where: {
       type: 'earn',
       reason: 'referral_bonus',
       relatedUserId: user.id
     }
   });

   if (existingTransaction) {
     console.log(`Referral bonus already granted for user ${user.id}, skipping`);
     user.refBonusGranted = true;
     await user.save();
     return;
   }

   // Check for self-referral
   if (user.referredBy.toString() === user.id.toString()) {
     console.log(`Self-referral detected for user ${user.id}, skipping bonus`);
     return;
   }

  // Generate unique eventId for this referral
  const eventId = randomUUID();

   // Grant referral bonus
   try {
     await earnReferralBonus({
       UserModel,
       referrerUserId: user.referredBy,
       referredUserId: user.id,
       amount: REFERRAL_BONUS_ALBA
     });

     // Create transaction record for referrer
     await AlbaTransaction.create({
       userId: user.referredBy,
       amount: REFERRAL_BONUS_ALBA,
       type: 'earn',
       reason: 'referral_bonus',
       relatedUserId: user.id,
       meta: {
         eventId,
         referralType: 'one-time',
         referredUserId: user.id
       }
    });

     // Grant bonus to the referred user (new user) as well
     const REFERRED_USER_BONUS = 5; // Fixed amount for referred user
     await addTx(UserModel, {
       userId: user.id,
       amount: REFERRED_USER_BONUS,
       type: 'earn',
       reason: 'referred_user_bonus',
       relatedUserId: user.referredBy
     });

     // Create transaction record for referred user
     await AlbaTransaction.create({
       userId: user.id,
      amount: REFERRED_USER_BONUS,
      type: 'earn',
      reason: 'referred_user_bonus',
      relatedUserId: user.referredBy,
      meta: {
        eventId,
        referralType: 'one-time',
        referrerId: user.referredBy
      }
    });

     console.log(`Referral bonus granted: referrer=${user.referredBy}, newUser=${user.id}, referrer_amount=${REFERRAL_BONUS_ALBA}, referred_amount=${REFERRED_USER_BONUS}, txId=${eventId}`);

     user.refBonusGranted = true;
    await user.save();
   } catch (error) {
     console.error(`Error granting referral bonus for user ${user.id}:`, error);
     throw error;
   }
}

/**
 * Set referral binding (immutable)
 * @param {Object} params
 * @param {Object} params.UserModel - User model
 * @param {string} params.userId - User ID to set referral for
 * @param {string} params.referrerId - Referrer user ID
 * @returns {Promise<Object>} - Result with success status
 */
async function setReferralBinding({ UserModel, userId, referrerId }) {
  console.log(`Setting referral binding: userId=${userId}, referrerId=${referrerId}`);

   const user = await UserModel.findByPk(userId);
  if (!user) {
    console.log(`User not found: ${userId}`);
    return { ok: false, status: 404, message: 'User not found' };
  }

  // Check if referral is already set (immutable)
  if (user.referredBy) {
    console.log(`Referral binding already set for user ${userId}, cannot change`);
    return { ok: false, status: 400, message: 'Referral binding already set and cannot be changed' };
  }

  // Check for self-referral
  if (referrerId.toString() === userId.toString()) {
    console.log(`Self-referral attempt detected: userId=${userId}, referrerId=${referrerId}`);
    return { ok: false, status: 400, message: 'Self-referral is not allowed' };
  }

  // Check if referrer exists
   const referrer = await UserModel.findByPk(referrerId);
  if (!referrer) {
    console.log(`Referrer not found: ${referrerId}`);
    return { ok: false, status: 404, message: 'Referrer not found' };
  }

  // Set referral binding
  user.referredBy = referrerId;
  await user.save();

  console.log(`Referral binding set successfully: user=${userId}, referrer=${referrerId}`);

  return { ok: true, user };
}

/**
 * Get referral statistics for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Referral statistics
 */
async function getReferralStats(userId) {
  // Count successful referrals
  const successfulReferrals = await AlbaTransaction.count({
    where: {
      userId,
      type: 'earn',
      reason: 'referral_bonus'
    }
  });

  const referralTransactions = await AlbaTransaction.findAll({
    where: {
      userId,
      type: 'earn',
      reason: 'referral_bonus'
    }
  });

  const totalAlbaFromReferrals = referralTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  return {
    successfulReferrals,
    totalAlbaFromReferrals,
    referralBonusAmount: REFERRAL_BONUS_ALBA
  };
}

module.exports = {
  grantReferralBonusIfEligible,
  setReferralBinding,
  getReferralStats,
  REFERRAL_BONUS_ALBA
};
