const VideoPost = require('../models/VideoPost');
const User = require('../models/User');
const { Op } = require('sequelize');
const { castVote } = require('./voteService');

function normalizeGenres(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(String).map(s=>s.trim()).filter(Boolean).slice(0,20);
  if (typeof input === 'string') return input.split(',').map(s=>s.trim()).filter(Boolean).slice(0,20);
  return [];
}

async function createVideo({ user, payload }) {
  return VideoPost.create({
    userId: user.id,
    nickname: payload.nickname || user.username || '',
    videoUrl: payload.videoUrl,
    platform: payload.platform || '',
    title: payload.title || '',
    description: payload.description || '',
    genres: normalizeGenres(payload.genres),
    status: 'pending'
  });
}

async function listPublic({ genres=[] }) {
  const where = { status: 'approved' };
  if (genres.length) where.genres = { [Op.contains]: genres };
  return VideoPost.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: 100
  });
}

async function listPending() {
  return VideoPost.findAll({
    where: { status: 'pending' },
    include: [{ model: User, as: 'user', attributes: ['username', 'email'] }],
    order: [['createdAt', 'DESC']]
  });
}

async function listAll() {
  return VideoPost.findAll({
    include: [{ model: User, as: 'user', attributes: ['username', 'email'] }],
    order: [['createdAt', 'DESC']]
  });
}

async function findById(id) {
  return VideoPost.findByPk(id, {
    include: [{ model: User, as: 'user', attributes: ['username', 'email'] }]
  });
}

async function moderate({ id, action, adminComment, rejectionReason }) {
  const update = {};
  if (action === 'approve') { update.status='approved'; update.adminComment=adminComment||''; update.rejectionReason=''; }
  if (action === 'reject') { update.status='rejected'; update.adminComment=adminComment||''; update.rejectionReason=rejectionReason||''; }
  if (action === 'block')  { update.status='blocked'; update.adminComment=adminComment||''; update.rejectionReason=rejectionReason||''; }
  
  await VideoPost.update(update, { where: { id } });
  return VideoPost.findByPk(id);
}

async function vote({ id, voterKey, vote: voteValue, user = null }) {
  let guestKey = null;
  let authUser = user;
  if (!authUser && typeof voterKey === 'string') {
    if (voterKey.startsWith('u:')) {
      authUser = { id: voterKey.slice(2), _id: voterKey.slice(2) };
    } else if (voterKey.startsWith('g:')) {
      guestKey = voterKey.slice(2);
    } else {
      guestKey = voterKey;
    }
  }

  const result = await castVote({
    targetType: 'video',
    targetId: id,
    vote: voteValue,
    user: authUser,
    guestKey
  });

  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  return { ok: true, doc: result.doc };
}

module.exports = { createVideo, listPublic, listPending, listAll, findById, moderate, vote };
