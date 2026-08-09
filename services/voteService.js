const { sequelize, Product, Banner, VideoPost, Vote } = require('../config/database');
const { getAuthUserId } = require('../middleware/auth');

const TARGET_CONFIG = {
  product: {
    Model: Product,
    upField: 'likes',
    downField: 'dislikes',
    find: (id, t) => Product.findOne({
      where: { id, deleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE
    })
  },
  service: {
    Model: Product,
    upField: 'likes',
    downField: 'dislikes',
    find: (id, t) => Product.findOne({
      where: { id, type: 'service', deleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE
    })
  },
  banner: {
    Model: Banner,
    upField: 'rating_up',
    downField: 'rating_down',
    find: (id, t) => Banner.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    })
  },
  video: {
    Model: VideoPost,
    upField: 'rating_up',
    downField: 'rating_down',
    find: (id, t) => VideoPost.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    })
  }
};

function resolveVoter({ user, guestKey }) {
  const userIdRaw = getAuthUserId(user);
  const userId = userIdRaw != null ? Number(userIdRaw) : null;
  if (userId && Number.isFinite(userId)) {
    return { userId, guestKey: null };
  }
  if (guestKey) {
    return { userId: null, guestKey: String(guestKey).slice(0, 64) };
  }
  return null;
}

async function castVote({ targetType, targetId, vote, user = null, guestKey = null }) {
  if (!TARGET_CONFIG[targetType]) {
    return { ok: false, status: 400, message: 'Invalid target type' };
  }
  if (vote !== 'up' && vote !== 'down') {
    return { ok: false, status: 400, message: "Неверное значение vote. Используйте 'up' или 'down'" };
  }

  const id = Number(targetId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, status: 400, message: 'Неверный ID' };
  }

  const voter = resolveVoter({ user, guestKey });
  if (!voter) {
    return { ok: false, status: 400, message: 'Нужен пользователь или guest key' };
  }

  const cfg = TARGET_CONFIG[targetType];

  try {
    return await sequelize.transaction(async (t) => {
      const target = await cfg.find(id, t);
      if (!target) {
        return { ok: false, status: 404, message: 'Не найдено' };
      }

      if (targetType === 'video' && target.status !== 'approved') {
        return { ok: false, status: 403, message: 'Voting allowed only for approved videos' };
      }

      try {
        await Vote.create({
          targetType,
          targetId: id,
          userId: voter.userId,
          guestKey: voter.guestKey,
          vote
        }, { transaction: t });
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          return { ok: false, status: 409, message: 'Вы уже голосовали' };
        }
        throw err;
      }

      const upInc = vote === 'up' ? 1 : 0;
      const downInc = vote === 'down' ? 1 : 0;
      await target.increment({
        [cfg.upField]: upInc,
        [cfg.downField]: downInc
      }, { transaction: t });

      const updates = {};
      if (voter.userId != null) {
        const voters = Array.isArray(target.voters) ? [...target.voters] : [];
        const asStr = String(voter.userId);
        if (!voters.map(String).includes(asStr)) {
          voters.push(asStr);
          updates.voters = voters;
        }
      }
      if (Object.prototype.hasOwnProperty.call(target.dataValues, 'rating_updated_at')) {
        updates.rating_updated_at = new Date();
      }
      if (Object.keys(updates).length) {
        await target.update(updates, { transaction: t });
      }
      await target.reload({ transaction: t });

      const up = Number(target[cfg.upField] || 0);
      const down = Number(target[cfg.downField] || 0);

      return {
        ok: true,
        rating_up: up,
        rating_down: down,
        likes: up,
        dislikes: down,
        total: up + down,
        result: up - down,
        voted: true,
        doc: targetType === 'video' ? target : undefined
      };
    });
  } catch (err) {
    return { ok: false, status: 500, message: err.message };
  }
}

async function buildVotedMap({ user, targetType, targetIds }) {
  const map = {};
  const userIdRaw = getAuthUserId(user);
  if (!userIdRaw || !Array.isArray(targetIds) || !targetIds.length) return map;

  const userId = Number(userIdRaw);
  const ids = targetIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return map;

  const rows = await Vote.findAll({
    where: {
      targetType,
      targetId: ids,
      userId
    },
    attributes: ['targetId']
  });

  for (const row of rows) {
    map[String(row.targetId)] = true;
  }
  return map;
}

module.exports = {
  castVote,
  buildVotedMap,
  TARGET_CONFIG
};
