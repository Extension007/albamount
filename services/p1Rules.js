const { httpError } = require('../utils/httpError');

function assertVerified(user) {
  if (!user) throw httpError(401, 'Unauthorized', 'UNAUTH');
  if (user.emailVerified !== true) throw httpError(403, 'Email verification required', 'NOT_VERIFIED');
}

function editLimitForTier(tier) {
  return tier === 'paid' ? 5 : 3;
}

async function consumeSlotOrThrow(UserModel, userId) {
   const u = await UserModel.findByPk(userId, {
     attributes: ['slots']
   });
   if (!u) throw httpError(404, 'User not found', 'USER_NOT_FOUND');

   const total = Number(u.slots?.total ?? 2);
   const used = Number(u.slots?.used ?? 0);

   if (used >= total) throw httpError(403, 'Slot limit reached. Redeem a slot code.', 'SLOT_LIMIT');

   await UserModel.update(
     { slots: { total, used: used + 1 } },
     { where: { id: userId } }
   );
}

function assertEditAllowed(card) {
  const limit = editLimitForTier(card.tier || 'free');
  const editCount = Number(card.editCount || 0);
  if (editCount >= limit) throw httpError(403, `Edit limit reached (${limit}).`, 'EDIT_LIMIT');
}

module.exports = { assertVerified, consumeSlotOrThrow, assertEditAllowed, editLimitForTier };
