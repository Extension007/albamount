const express = require('express');
const router = express.Router();
const { ensureGuestId, guestRateLimit, captchaHook } = require('../middleware/p1Guest');
const { requireAuth, requireAdmin, requireUser } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { apiCsrfProtection } = require('../middleware/apiCsrf');
const { httpError } = require('../utils/httpError');
const { notifyUser } = require('../services/notify');
const { redeemSlotCode, createCodes, issuePaymentActivationCode, consumePaymentActivationCode } = require('../services/codeService');
const { grantAlba, listTransactions, spendAlba } = require('../services/albaService');
const { createVideo, listPublic, moderate, vote } = require('../services/videoService');
const { assertVerified } = require('../services/p1Rules');

// CODES
router.post('/codes/redeem', requireUser, csrfProtection, async (req, res, next) => {
  try {
    assertVerified(req.user);
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Code required' });

    const result = await redeemSlotCode({
      user: req.user,
      codeValue: code,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });

    await notifyUser(req.user._id, { type: 'slot_redeemed', code: result.code.code });
    res.json({ success: true, code: result.code });
  } catch (err) {
    next(err);
  }
});

router.post('/codes', requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const { count, kind, type, expiresAt } = req.body;
    if (!count || !kind || !type) return res.status(400).json({ success: false, message: 'count, kind, type required' });

    const codes = await createCodes({ count, kind, type, expiresAt, createdBy: req.user._id });
    res.json({ success: true, codes });
  } catch (err) {
    next(err);
  }
});

router.get('/codes', requireAdmin, async (req, res, next) => {
  try {
    const codes = await require('../models/Code').findAll({
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json({ success: true, codes });
  } catch (err) {
    next(err);
  }
});

// ALBA
router.post('/alba/grant', requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const { userId, amount, reason } = req.body;
    if (!userId || amount == null || !reason) return res.status(400).json({ success: false, message: 'userId, amount, reason required' });

    const user = await grantAlba({
      UserModel: require('../models/User'),
      userId,
      amount,
      reason,
      actorAdminId: req.user._id
    });
    await notifyUser(userId, { type: 'alba_granted', amount, reason });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

// Grant ALBA by login (username)
router.post('/alba/grant-by-login', requireAdmin, csrfProtection, async (req, res) => {
  try {
    const { login, amount, reason, comment } = req.body;
    if (!login || !amount || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Login, amount, and reason are required'
      });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }

    // Validate that reason is one of the allowed enum values
    const validReasons = ['referral_bonus', 'card_payment', 'admin_grant', 'manual_adjustment', 'upgrade_to_paid', 'card_entitlement_purchase'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: `Invalid reason. Must be one of: ${validReasons.join(', ')}`
      });
    }

    const { grantAlbaByUsername } = require('../services/albaService');

    const result = await grantAlbaByUsername(login, amount, reason, req.user._id, comment);

    // Notify the user about the ALBA grant
    await notifyUser(result.user._id, {
      type: 'alba_granted',
      amount,
      reason,
      comment,
      admin: req.user.username
    });

    res.json({
      success: true,
      user: {
        login: result.user.username,
        albaBalance: result.user.albaBalance
      },
      transactionId: result.tx._id.toString()
    });
  } catch (err) {
    console.error('Error granting ALBA by login:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Error granting ALBA: ' + err.message
    });
  }
});

// ENTITLEMENTS API
router.post('/entitlements/purchase', requireAuth, apiCsrfProtection(), async (req, res) => {
  try {
    const { type, idempotencyKey } = req.body;
    if (!type || !idempotencyKey) {
      return res.status(400).json({
        success: false,
        message: 'Type and idempotencyKey are required'
      });
    }

    const User = require('../models/User');
    const { purchaseEntitlement } = require('../services/albaService');

    const result = await purchaseEntitlement({
      UserModel: User,
      userId: req.user._id,
      type,
      idempotencyKey
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.message
      });
    }

    const { getUserAlbaBalance } = require('../services/albaService');
    const updatedBalance = await getUserAlbaBalance(req.user._id);
    
    res.json({
      success: true,
      entitlement: result.entitlement,
      transaction: result.transaction,
      balance: updatedBalance,
      message: 'Entitlement purchased successfully'
    });
  } catch (err) {
    console.error('Error purchasing entitlement:', err);
    res.status(500).json({
      success: false,
      message: 'Error purchasing entitlement: ' + err.message
    });
  }
});

router.get('/entitlements/available', requireAuth, async (req, res) => {
  try {
    const { getAvailableEntitlements } = require('../services/albaService');

    const entitlements = await getAvailableEntitlements(req.user._id);

    // Group by type
    const productEntitlements = entitlements.filter(e => e.type === 'product');
    const serviceEntitlements = entitlements.filter(e => e.type === 'service');

    res.json({
      success: true,
      entitlements: {
        product: productEntitlements,
        service: serviceEntitlements,
        total: entitlements.length
      }
    });
  } catch (err) {
    console.error('Error getting available entitlements:', err);
    res.status(500).json({
      success: false,
      message: 'Error getting available entitlements: ' + err.message
    });
  }
});

// REFERRAL API
router.post('/referrals/set-binding', requireAuth, apiCsrfProtection(), async (req, res) => {
  try {
    const { referrerId } = req.body;
    if (!referrerId) {
      return res.status(400).json({
        success: false,
        message: 'Referrer ID is required'
      });
    }

    const User = require('../models/User');
    const { setReferralBinding } = require('../services/referralService');

    const result = await setReferralBinding({
      UserModel: User,
      userId: req.user._id,
      referrerId
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.message
      });
    }

    res.json({
      success: true,
      message: 'Referral binding set successfully',
      user: result.user
    });
  } catch (err) {
    console.error('Error setting referral binding:', err);
    res.status(500).json({
      success: false,
      message: 'Error setting referral binding: ' + err.message
    });
  }
});

router.get('/referrals/stats', requireAuth, async (req, res) => {
  try {
    const { getReferralStats } = require('../services/referralService');

    const stats = await getReferralStats(req.user._id);

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error('Error getting referral stats:', err);
    res.status(500).json({
      success: false,
      message: 'Error getting referral stats: ' + err.message
    });
  }
});

// Get ALBA transactions history
router.get('/alba/transactions-history', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = parseInt(req.query.skip, 10) || 0;
    const AlbaTransaction = require('../models/AlbaTransaction');
    const User = require('../models/User');

    const { rows: transactions, count: total } = await AlbaTransaction.findAndCountAll({
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit,
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
        { model: User, as: 'relatedUser', attributes: ['id', 'username', 'email'] }
      ]
    });

    res.json({
      success: true,
      transactions,
      total
    });
  } catch (err) {
    console.error('Error fetching ALBA transactions:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching ALBA transactions: ' + err.message
    });
  }
});


router.get('/alba/transactions', requireAuth, async (req, res, next) => {
  try {
    const txs = await listTransactions({ userId: req.user._id });
    const { getUserAlbaBalance } = require('../services/albaService');
    const balance = await getUserAlbaBalance(req.user._id);
    res.json({ success: true, transactions: txs, balance });
  } catch (err) {
    next(err);
  }
});

// LEGACY PAID FLOW - ADMIN ONLY
router.post('/payments/alba', requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const { paymentType, cardType, cardId, userId } = req.body;
    if (paymentType !== 'upgrade_to_paid' || !cardType || !cardId || !userId) {
      return res.status(400).json({ success: false, message: 'paymentType=upgrade_to_paid, cardType, cardId, userId required' });
    }

    const result = await spendAlba({
      UserModel: require('../models/User'),
      userId: userId,
      amount: 30,
      reason: 'upgrade_to_paid',
      relatedCardType: cardType,
      relatedCardId: cardId
    });

    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });

    const activationCode = await issuePaymentActivationCode({
      userId: userId,
      cardType,
      cardId,
      createdBy: req.user._id
    });

    await notifyUser(userId, { type: 'paid_upgrade_requested', cardType, cardId, activationCode: activationCode.code });
    res.json({ success: true, activationCode: activationCode.code });
  } catch (err) {
    next(err);
  }
});

async function upgradeCardToPaid(cardType, cardId, activationCodeId = null) {
  const Product = require('../models/Product');
  const Banner = require('../models/Banner');
  const Model = cardType === 'banner' ? Banner : Product;
  const card = await Model.findByPk(cardId);
  if (!card) return null;

  await Model.update(
    {
      tier: 'paid',
      tierRequested: 'paid',
      paymentStatus: 'paid',
      activationCodeId: activationCodeId || card.activationCodeId,
      status: 'approved',
      editCount: 0
    },
    { where: { id: cardId } }
  );

  return Model.findByPk(cardId);
}

router.post('/users/confirm-paid', requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const { userId, cardType, cardId, issueActivationCode = true } = req.body;
    if (!userId || !cardType || !cardId) return res.status(400).json({ success: false, message: 'userId, cardType, cardId required' });

    const User = require('../models/User');
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let activationCode = null;
    if (issueActivationCode) {
      activationCode = await issuePaymentActivationCode({ userId, cardType, cardId, createdBy: req.user._id });
    }

    const card = await upgradeCardToPaid(cardType, cardId, activationCode?.id || null);
    if (!card) return res.status(404).json({ success: false, message: 'Card not found' });

    await notifyUser(userId, { type: 'paid_confirmed', cardType, cardId, activationCode: activationCode?.code });
    res.json({ success: true, user, card, activationCode: activationCode?.code });
  } catch (err) {
    next(err);
  }
});

router.post('/users/activate-paid', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    assertVerified(req.user);
    const { activationCode } = req.body;
    if (!activationCode) return res.status(400).json({ success: false, message: 'activationCode required' });

    const result = await consumePaymentActivationCode({ userId: req.user._id, activationCode });
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });

    const card = await upgradeCardToPaid(result.code.type, result.code.cardId, result.code.id);
    if (!card) return res.status(404).json({ success: false, message: 'Card not found' });

    await notifyUser(req.user._id, { type: 'paid_activated', activationCode });
    res.json({ success: true, card });
  } catch (err) {
    next(err);
  }
});

// VIDEO API
router.post('/videos', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    assertVerified(req.user);
    const video = await createVideo({ user: req.user, payload: req.body });
    await notifyUser(req.user._id, { type: 'video_created', videoId: video._id });
    res.json({ success: true, video });
  } catch (err) {
    next(err);
  }
});

router.get('/videos', async (req, res, next) => {
  try {
    const genres = req.query.genres?.split(',').filter(Boolean) || [];
    const videos = await listPublic({ genres });
    res.json({ success: true, videos });
  } catch (err) {
    next(err);
  }
});

router.post('/videos/:id/vote', ensureGuestId, guestRateLimit(), captchaHook, async (req, res, next) => {
  try {
    const { vote } = req.body;
    if (!vote || !['up', 'down'].includes(vote)) return res.status(400).json({ success: false, message: 'vote must be up or down' });

    const voterKey = req.user ? `u:${req.user._id}` : `g:${req.guestId}`;
    const result = await vote({ id: req.params.id, voterKey, vote });

    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });

    res.json({ success: true, video: result.doc });
  } catch (err) {
    next(err);
  }
});

// Admin moderation
router.post('/videos/:id/approve', requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const { adminComment } = req.body;
    // adminComment is optional for approve

    const video = await moderate({ id: req.params.id, action: 'approve', adminComment });
    await notifyUser(video.userId, { type: 'video_approved', videoId: video._id, adminComment });
    res.json({ success: true, video });
  } catch (err) {
    next(err);
  }
});

router.post('/videos/:id/reject', requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const { adminComment, rejectionReason } = req.body;
    if (!adminComment || !rejectionReason) return res.status(400).json({ success: false, message: 'adminComment and rejectionReason required' });

    const video = await moderate({ id: req.params.id, action: 'reject', adminComment, rejectionReason });
    if (!video) return res.status(404).json({ success: false, error: 'NotFound', message: 'Video not found' });
    if (!video.userId) return res.status(400).json({ success: false, message: 'Video has no associated user' });

    await notifyUser(video.userId, { type: 'video_rejected', videoId: video._id, adminComment, rejectionReason });
    res.json({ success: true, video });
  } catch (err) {
    next(err);
  }
});

router.post('/videos/:id/block', requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const { adminComment } = req.body;
    if (!adminComment) return res.status(400).json({ success: false, message: 'adminComment required' });

    const video = await moderate({ id: req.params.id, action: 'block', adminComment });
    await notifyUser(video.userId, { type: 'video_blocked', videoId: video._id, adminComment });
    res.json({ success: true, video });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
