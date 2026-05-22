const PG_UNIQUE = '23505';

function isUniqueConstraintError(err) {
  return (
    err?.name === 'SequelizeUniqueConstraintError' ||
    err?.parent?.code === PG_UNIQUE ||
    err?.original?.code === PG_UNIQUE
  );
}

function getDuplicateFieldMessage(err, messages = {}) {
  const field = err?.errors?.[0]?.path;
  if (field === 'username') {
    return messages.username || 'Пользователь с таким именем уже существует';
  }
  if (field === 'email') {
    return messages.email || 'Пользователь с таким email уже существует';
  }
  return messages.default || 'Пользователь с такими данными уже существует';
}

module.exports = {
  isUniqueConstraintError,
  getDuplicateFieldMessage
};
