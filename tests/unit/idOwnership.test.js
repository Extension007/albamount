const { isValidEntityId } = require('../../utils/idValidation');
const { isRecordOwner, getRecordOwnerId } = require('../../utils/ownership');

describe('idValidation', () => {
  test('accepts positive integer ids', () => {
    expect(isValidEntityId('1')).toBe(true);
    expect(isValidEntityId(42)).toBe(true);
  });

  test('rejects zero and empty', () => {
    expect(isValidEntityId('0')).toBe(false);
    expect(isValidEntityId('')).toBe(false);
    expect(isValidEntityId(null)).toBe(false);
  });

  test('accepts legacy hex ids', () => {
    expect(isValidEntityId('507f1f77bcf86cd799439011')).toBe(true);
    expect(isValidEntityId('a'.repeat(32))).toBe(true);
  });
});

describe('ownership', () => {
  test('matches ownerId to user _id', () => {
    expect(isRecordOwner({ ownerId: 5 }, { _id: '5' })).toBe(true);
    expect(isRecordOwner({ ownerId: 5 }, { id: 6 })).toBe(false);
  });

  test('reads nested owner association', () => {
    expect(getRecordOwnerId({ owner: { id: 9 } })).toBe('9');
  });
});
