const { httpError } = require('../utils/httpError');
const { Op, literal } = require('sequelize');

function assertVerified(user) {
  if (!user) throw httpError(401, 'Unauthorized', 'UNAUTH');
  if (user.emailVerified !== true) throw httpError(403, 'Email verification required', 'NOT_VERIFIED');
}

function editLimitForTier(tier) {
  return tier === 'paid' ? 5 : 3;
}

async function consumeSlotOrThrow(UserModel, userId) {
  const [affected] = await UserModel.update(
    { slots_used: literal('COALESCE(slots_used, 0) + 1') },
    {
      where: {
        id: userId,
        [Op.and]: literal('COALESCE(slots_used, 0) < COALESCE(slots_total, 2)')
      }
    }
  );

  if (!affected) {
    const u = await UserModel.findByPk(userId, {
      attributes: ['id', 'slots_total', 'slots_used']
    });
    if (!u) throw httpError(404, 'User not found', 'USER_NOT_FOUND');
    throw httpError(403, 'Slot limit reached. Redeem a slot code.', 'SLOT_LIMIT');
  }
}

function assertEditAllowed(card) {
  const limit = editLimitForTier(card.tier || 'free');
  const editCount = Number(card.editCount || 0);
  if (editCount >= limit) throw httpError(403, `Edit limit reached (${limit}).`, 'EDIT_LIMIT');
}

module.exports = { assertVerified, consumeSlotOrThrow, assertEditAllowed, editLimitForTier };
