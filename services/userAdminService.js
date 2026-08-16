const { sequelize, User } = require('../config/database');
const logger = require('../utils/logger');

async function runSql(t, sql, id) {
  try {
    await sequelize.query(sql, { replacements: { id }, transaction: t });
  } catch (err) {
    const code = err.parent?.code || err.original?.code;
    if (code === '42P01' || code === '42703') {
      logger.warn({ msg: 'user_delete_skip_sql', sql, code, error: err.message });
      return;
    }
    throw err;
  }
}

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
    await runSql(t, 'UPDATE users SET referred_by = NULL WHERE referred_by = :id', id);
    await runSql(t, 'UPDATE categories SET created_by = NULL WHERE created_by = :id', id);

    await runSql(t, 'DELETE FROM entitlements WHERE owner_id = :id', id);
    await runSql(t, 'UPDATE alba_transactions SET related_user_id = NULL WHERE related_user_id = :id', id);
    await runSql(t, 'DELETE FROM alba_transactions WHERE user_id = :id', id);

    await runSql(t, 'DELETE FROM comments WHERE user_id = :id', id);
    await runSql(t, 'DELETE FROM votes WHERE user_id = :id', id);
    await runSql(t, 'DELETE FROM verification_tokens WHERE user_id = :id', id);
    await runSql(t, 'DELETE FROM video_posts WHERE user_id = :id', id);
    await runSql(t, 'DELETE FROM code_usage WHERE user_id = :id', id);
    await runSql(t, 'DELETE FROM code_usages WHERE user_id = :id', id);

    await runSql(t, 'UPDATE codes SET created_by = NULL WHERE created_by = :id', id);
    await runSql(t, 'UPDATE codes SET used_by = NULL WHERE used_by = :id', id);
    await runSql(t, 'UPDATE codes SET reserved_for_user_id = NULL WHERE reserved_for_user_id = :id', id);

    await runSql(t, 'UPDATE audit_logs SET user_id = NULL WHERE user_id = :id', id);
    await runSql(t, 'UPDATE audit_logs SET target_user_id = NULL WHERE target_user_id = :id', id);
    await runSql(t, 'UPDATE audit_logs SET admin_id = NULL WHERE admin_id = :id', id);

    await runSql(t, 'UPDATE products SET owner_id = NULL, deleted = true WHERE owner_id = :id', id);
    await runSql(t, 'DELETE FROM banners WHERE owner_id = :id', id);

    await User.destroy({ where: { id }, transaction: t });
  });

  return { username: user.username, id };
}

module.exports = { deleteRegisteredUser };
