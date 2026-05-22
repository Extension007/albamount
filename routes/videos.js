const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requireEmailVerification: requireVerified } = require('../middleware/emailVerification');
const { ensureGuestId, guestRateLimit, captchaHook } = require('../middleware/p1Guest');
const { createVideo, listPublic, moderate, vote: voteVideo } = require('../services/videoService');
const { notifyUser } = require('../services/notify');
const { csrfProtection } = require('../middleware/csrf');

// Public video listing
router.get('/', async (req, res, next) => {
  try {
    const genres = req.query.genres?.split(',').filter(Boolean) || [];
    const videos = await listPublic({ genres });

    // Получаем актуальные данные пользователя из базы данных
    let isAuth = !!req.user;
    let isAdmin = req.user?.role === 'admin';
    let isEmailVerified = false;
    let userRole = req.user?.role || null;

    if (req.user) {
      // Получаем актуальные данные пользователя из базы данных
      const userFromDb = await User.findByPk(req.user._id);
      if (userFromDb) {
        isEmailVerified = userFromDb.emailVerified || false;
        userRole = userFromDb.role || userRole;
      }
    }

    res.render('videos', {
      videos,
      isAuth,
      isAdmin,
      isEmailVerified,
      userRole,
      genres: genres.join(',')
    });
  } catch (err) {
    next(err);
  }
});

// New video form
router.get('/new', requireAuth, requireVerified, (req, res) => {
  res.render('videos-new', {
    isAuth: true,
    isAdmin: req.user?.role === 'admin'
  });
});

// Create video (API endpoint)
router.post('/', requireAuth, requireVerified, async (req, res, next) => {
  try {
    const video = await createVideo({ user: req.user, payload: req.body });
    await notifyUser(req.user._id, { type: 'video_created', videoId: video._id });
    res.redirect('/videos');
  } catch (err) {
    next(err);
  }
});

// Video voting
router.post('/:id/vote', ensureGuestId, guestRateLimit(), captchaHook, async (req, res, next) => {
  try {
    const { vote } = req.body;
    if (!vote || !['up', 'down'].includes(vote)) {
      return res.status(400).json({ success: false, message: 'vote must be up or down' });
    }

    const voterKey = req.user ? `u:${req.user._id}` : `g:${req.guestId}`;
    const result = await voteVideo({ id: req.params.id, voterKey, vote });

    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });

    res.json({ success: true, video: result.doc });
  } catch (err) {
    next(err);
  }
});

// Admin moderation endpoints
router.post('/:id/approve', requireAdmin, csrfProtection, async (req, res, next) => {
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

router.post('/:id/reject', requireAdmin, csrfProtection, async (req, res, next) => {
  try {
    const { adminComment, rejectionReason } = req.body;
    if (!adminComment || !rejectionReason) return res.status(400).json({ success: false, message: 'adminComment and rejectionReason required' });

    const video = await moderate({ id: req.params.id, action: 'reject', adminComment, rejectionReason });
    await notifyUser(video.userId, { type: 'video_rejected', videoId: video._id, adminComment, rejectionReason });
    res.json({ success: true, video });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/block', requireAdmin, csrfProtection, async (req, res, next) => {
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
