const SHOWCASE = 'showcase';
const SERVICES = 'services';

function normalizeAccountType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'services' || raw === 'service' || raw === 'услуги' || raw === 'uslugi') {
    return SERVICES;
  }
  if (raw === 'showcase' || raw === 'vitrine' || raw === 'витрина' || raw === 'vetrina' || raw === 'реклама' || raw === 'ad') {
    return SHOWCASE;
  }
  return null;
}

function allowedCardType(accountType) {
  return normalizeAccountType(accountType) === SERVICES ? 'service' : 'product';
}

function isShowcaseAccount(accountType) {
  return allowedCardType(accountType) === 'product';
}

function assertCanCreateCardType(accountType, type) {
  const allowed = allowedCardType(accountType);
  const requested = type === 'service' ? 'service' : 'product';
  if (requested !== allowed) {
    const err = new Error(
      allowed === 'service'
        ? 'Этот аккаунт может публиковать только услуги'
        : 'Этот аккаунт может публиковать только рекламу'
    );
    err.status = 403;
    throw err;
  }
  return allowed;
}

module.exports = {
  SHOWCASE,
  SERVICES,
  normalizeAccountType,
  allowedCardType,
  isShowcaseAccount,
  assertCanCreateCardType
};
