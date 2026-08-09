const { normalizePrice, formatPriceDisplay } = require('../../utils/price');

describe('price helpers', () => {
  test('keeps free text as-is', () => {
    expect(normalizePrice('от 1000')).toBe('от 1000');
    expect(normalizePrice('договорная')).toBe('договорная');
    expect(normalizePrice('15000 тг')).toBe('15000 тг');
  });

  test('trims whitespace', () => {
    expect(normalizePrice('  12000  ')).toBe('12000');
  });

  test('rejects empty', () => {
    expect(() => normalizePrice('')).toThrow(/обязательна/i);
    expect(() => normalizePrice('   ')).toThrow(/обязательна/i);
  });

  test('formatPriceDisplay adds currency for plain numbers only', () => {
    expect(formatPriceDisplay('1000')).toBe('1000 ₸');
    expect(formatPriceDisplay('от 1000')).toBe('от 1000');
  });
});
