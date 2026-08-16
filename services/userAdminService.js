const {
  sequelize,
  User,
  Product,
  Banner,
  Comment,
  Entitlement,
  AlbaTransaction,
  VideoPost,
  VerificationToken,
  Code,
  CodeUsage,
  AuditLog,
  Vote
} = require('../config/database');

async function deleteRegisteredUser(userId, actorUser) {
  const id = parseInt(String(userId), 10);
  const actorId = parseInt(String(actorUser?.id || actorUser?._id), 10);

  if (!Number.isFinite(id)) {
    const err = new Error('Некорректный ID пользователя');
    err.status = 400;
    throw err;
  }

  if (Number.isFinite(actorId) && id === actorId) {
    const err = new Error('Нельзя удалить собственный аккаунт');
    err.status = 400;
    throw err;
  }

  const user = await User.findByPk(id);
  if (!user) {
    const err = new Error('Пользователь не найден');
    err.status = 404;
    throw err;
  }

  if (user.role === 'admin') {
    const adminCount = await User.count({ where: { role: 'admin' } });
    if (adminCount <= 1) {
      const err = new Error('Нельзя удалить последнего администратора');
      err.status = 400;
      throw err;
    }
  }

  await sequelize.transaction(async (t) => {
    await User.update({ referredBy: null }, { where: { referredBy: id }, transaction: t });

    await Entitlement.destroy({ where: { ownerId: id }, transaction: t });
    await AlbaTransaction.update({ relatedUserId: null }, { where: { relatedUserId: id }, transaction: t });
    await AlbaTransaction.destroy({ where: { userId: id }, transaction: t });

    await Comment.destroy({ where: { userId: id }, transaction: t });
    await Vote.destroy({ where: { userId: id }, transaction: t });
    await VerificationToken.destroy({ where: { userId: id }, transaction: t });
    await VideoPost.destroy({ where: { userId: id }, transaction: t });
    await CodeUsage.destroy({ where: { userId: id }, transaction: t });

    await Code.update({ createdById: null }, { where: { createdById: id }, transaction: t });
    await Code.update({ usedById: null }, { where: { usedById: id }, transaction: t });
    await Code.update({ reservedForUserId: null }, { where: { reservedForUserId: id }, transaction: t });

    await AuditLog.update({ userId: null }, { where: { userId: id }, transaction: t });
    await AuditLog.update({ targetUserId: null }, { where: { targetUserId: id }, transaction: t });
    await AuditLog.update({ adminId: null }, { where: { adminId: id }, transaction: t });

    await Product.update(
      { ownerId: null, deleted: true },
      { where: { ownerId: id }, transaction: t }
    );
    await Banner.destroy({ where: { ownerId: id }, transaction: t });

    await User.destroy({ where: { id }, transaction: t });
  });

  return { username: user.username, id };
}

module.exports = { deleteRegisteredUser };
