/** Canonical label for “ask for price” on product/service cards */
const PRICE_ON_REQUEST = 'Уточняйте';

const ON_REQUEST_ALIASES = new Set([
  'уточняйте',
  'уточнить',
  'цена уточняйте',
  'цену уточняйте',
  'по запросу',
  'договорная',
  'договорной',
  'ask',
  'on request',
  'price on request'
]);

function isPriceOnRequest(value) {
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  if (!s) return false;
  if (s === PRICE_ON_REQUEST.toLowerCase()) return true;
  return ON_REQUEST_ALIASES.has(s);
}

/**
 * Normalize user/API price input to a string stored in DB.
 * Allows numeric prices and "Уточняйте".
 */
function normalizePrice(value) {
  if (value == null) return PRICE_ON_REQUEST;
  const raw = String(value).trim();
  if (!raw) return PRICE_ON_REQUEST;
  if (isPriceOnRequest(raw)) return PRICE_ON_REQUEST;

  // Keep digits, spaces, separators — strip currency symbols for storage cleanliness
  const cleaned = raw.replace(/[₸$€₽]/g, '').replace(/\s+/g, ' ').trim();
  if (isPriceOnRequest(cleaned)) return PRICE_ON_REQUEST;

  // Pure number (optional thousand separators)
  const numeric = cleaned.replace(/,/g, '.').replace(/\s/g, '');
  if (/^\d+(\.\d+)?$/.test(numeric)) {
    const n = Number(numeric);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error('Цена не может быть отрицательной');
    }
    // Store as integer string if whole number
    return Number.isInteger(n) ? String(n) : String(n);
  }

  // Allow short free-text prices (e.g. "от 1000") but cap length
  if (cleaned.length > 40) {
    throw new Error('Цена слишком длинная');
  }
  return cleaned;
}

/** Display helper for EJS/UI */
function formatPriceDisplay(value) {
  if (isPriceOnRequest(value)) return PRICE_ON_REQUEST;
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return PRICE_ON_REQUEST;
  if (/^\d+(\.\d+)?$/.test(raw.replace(/\s/g, ''))) {
    return `${raw.replace(/\s/g, '')} ₸`;
  }
  return raw;
}

function shouldShowCurrency(value) {
  if (isPriceOnRequest(value)) return false;
  const raw = value == null ? '' : String(value).trim().replace(/\s/g, '');
  return /^\d+(\.\d+)?$/.test(raw);
}

module.exports = {
  PRICE_ON_REQUEST,
  isPriceOnRequest,
  normalizePrice,
  formatPriceDisplay,
  shouldShowCurrency
};
