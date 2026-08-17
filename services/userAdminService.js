const { sequelize, User } = require('../config/database');
const logger = require('../utils/logger');

function pgCode(err) {
  return err.parent?.code || err.original?.code || err.code;
}

async function runSql(t, sql, id) {
  try {
    await sequelize.query(sql, { replacements: { id }, transaction: t });
  } catch (err) {
    const code = pgCode(err);
    if (code === '42P01' || code === '42703') {
      logger.warn({ msg: 'user_delete_skip_sql', sql, code, error: err.message });
      return;
    }
    throw err;
  }
}

async function listUserForeignKeys(t) {
  const [rows] = await sequelize.query(
    `
    SELECT
      rel.relname AS table_name,
      att.attname AS column_name,
      NOT att.attnotnull AS is_nullable
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    JOIN LATERAL unnest(con.conkey) AS cols(attnum) ON true
    JOIN pg_attribute att
      ON att.attrelid = rel.oid
     AND att.attnum = cols.attnum
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.users'::regclass
      AND n.nspname = 'public'
      AND att.attnum > 0
      AND NOT att.attisdropped
    `,
    { transaction: t }
  );
  return rows || [];
}

async function detachUserReferences(t, id) {
  await runSql(t, 'UPDATE products SET owner_id = NULL, deleted = true WHERE owner_id = :id', id);
  await runSql(
    t,
    `UPDATE entitlements
        SET related_transaction_id = NULL
      WHERE related_transaction_id IN (
        SELECT id FROM alba_transactions
         WHERE user_id = :id OR related_user_id = :id
      )`,
    id
  );

  for (let pass = 0; pass < 12; pass += 1) {
    const fks = await listUserForeignKeys(t);
    let ops = 0;

    for (const fk of fks) {
      const table = String(fk.table_name || '');
      const column = String(fk.column_name || '');
      if (!table || !column) continue;
      if (table === 'users' && column === 'id') continue;
      if (table === 'products' && column === 'owner_id') continue;

      const quoted = `"${table.replace(/"/g, '')}"`;
      const col = `"${column.replace(/"/g, '')}"`;
      const mustDelete = table !== 'users' && (fk.is_nullable === false || fk.is_nullable === 'f');
      if (mustDelete) {
        await runSql(t, `DELETE FROM ${quoted} WHERE ${col} = :id`, id);
      } else {
        await runSql(t, `UPDATE ${quoted} SET ${col} = NULL WHERE ${col} = :id`, id);
      }
      ops += 1;
    }

    if (ops === 0) break;
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
    await detachUserReferences(t, id);
    await runSql(t, 'DELETE FROM users WHERE id = :id', id);
  });

  return { username: user.username, id };
}

module.exports = { deleteRegisteredUser };
