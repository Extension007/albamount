const {
  normalizePrice,
  formatPriceDisplay,
  isPriceOnRequest,
  PRICE_ON_REQUEST
} = require('../../utils/price');

describe('price helpers', () => {
  test('normalizes numeric price', () => {
    expect(normalizePrice('15000')).toBe('15000');
    expect(normalizePrice('15 000')).toBe('15000');
  });

  test('normalizes ask-price aliases to Уточняйте', () => {
    expect(normalizePrice('уточняйте')).toBe(PRICE_ON_REQUEST);
    expect(normalizePrice('По запросу')).toBe(PRICE_ON_REQUEST);
    expect(normalizePrice('договорная')).toBe(PRICE_ON_REQUEST);
  });

  test('formatPriceDisplay', () => {
    expect(formatPriceDisplay('1000')).toBe('1000 ₸');
    expect(formatPriceDisplay(PRICE_ON_REQUEST)).toBe(PRICE_ON_REQUEST);
    expect(isPriceOnRequest('Уточняйте')).toBe(true);
  });
});
