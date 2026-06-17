const { validateEmail, validatePhone } = require('../../middleware/validators');

describe('Validators', () => {
  describe('validateEmail', () => {
    test('should return true for valid email', () => {
      expect(validateEmail('test@example.com')).toBe(true);
    });

    test('should return false for invalid email', () => {
      expect(validateEmail('invalid-email')).toBe(false);
    });

    test('should return true for empty/null', () => {
      expect(validateEmail('')).toBe(true);
      expect(validateEmail(null)).toBe(true);
    });
  });

  describe('validatePhone', () => {
    test('should return true for valid phone', () => {
      expect(validatePhone('+12345678901')).toBe(true);
      expect(validatePhone('12345678901')).toBe(true);
    });

    test('should return false for invalid phone', () => {
      expect(validatePhone('abc')).toBe(false);
    });

    test('should return true for empty/null', () => {
      expect(validatePhone('')).toBe(true);
      expect(validatePhone(null)).toBe(true);
    });
  });
});
