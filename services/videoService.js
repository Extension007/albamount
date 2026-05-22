const VideoPost = require('../models/VideoPost');
const User = require('../models/User');

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

async function vote({ id, voterKey, vote }) {
  const doc = await VideoPost.findByPk(id);
  if (!doc) return { ok:false, status:404, message:'Not found' };
  if (doc.status !== 'approved') return { ok:false, status:403, message:'Voting allowed only for approved videos' };
  if (doc.voters.find(v=>v.key===voterKey)) return { ok:false, status:409, message:'Already voted' };

  doc.voters.push({ key:voterKey, vote });
  if (vote==='up') doc.rating_up += 1;
  if (vote==='down') doc.rating_down += 1;
  await doc.save();
  return { ok:true, doc };
}

module.exports = { createVideo, listPublic, listPending, listAll, findById, moderate, vote };
