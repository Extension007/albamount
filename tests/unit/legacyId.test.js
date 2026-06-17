const { describe, it, expect } = require('@jest/globals');
const {
  toPlainWithLegacyId,
  mapPlainWithLegacyId,
  normalizeUser,
  normalizeRenderLocals
} = require('../../utils/legacyId');

describe('legacyId helpers', () => {
  it('adds _id alias from id on plain objects', () => {
    const result = toPlainWithLegacyId({ id: 'abc123', name: 'Test' });
    expect(result._id).toBe('abc123');
    expect(result.id).toBe('abc123');
  });

  it('maps arrays of records', () => {
    const result = mapPlainWithLegacyId([{ id: 1 }, { id: 2 }]);
    expect(result[0]._id).toBe(1);
    expect(result[1]._id).toBe(2);
  });

  it('normalizes user session payload', () => {
    const result = normalizeUser({ id: 5, username: 'user' });
    expect(result._id).toBe('5');
  });

  it('normalizes render locals for product lists', () => {
    const locals = normalizeRenderLocals({
      products: [{ id: 'deadbeef' }],
      user: { id: 1, role: 'user' }
    });
    expect(locals.products[0]._id).toBe('deadbeef');
    expect(locals.user._id).toBe('1');
  });
});
