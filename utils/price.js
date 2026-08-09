/**
 * Free-form price for product/service cards (text and/or digits).
 */

function normalizePrice(value) {
  if (value == null) {
    throw new Error('Цена обязательна');
  }
  const raw = String(value).trim().replace(/\s+/g, ' ');
  if (!raw) {
    throw new Error('Цена обязательна');
  }
  if (raw.length > 80) {
    throw new Error('Цена слишком длинная');
  }
  return raw;
}

/** Display as stored; append ₸ only for plain numeric values */
function formatPriceDisplay(value) {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return '';
  if (/^\d+([.,]\d+)?$/.test(raw.replace(/\s/g, ''))) {
    return `${raw.replace(/\s/g, '').replace(',', '.')} ₸`;
  }
  return raw;
}

module.exports = {
  normalizePrice,
  formatPriceDisplay
};
