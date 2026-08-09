const { parsePagination } = require('../../utils/pagination');

describe('parsePagination', () => {
  test('defaults', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 24, offset: 0 });
  });

  test('page and limit', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({
      page: 3,
      limit: 10,
      offset: 20
    });
  });

  test('caps max limit', () => {
    expect(parsePagination({ limit: '999' }, { maxLimit: 100 }).limit).toBe(100);
  });

  test('rejects non-positive page', () => {
    expect(parsePagination({ page: '0' }).page).toBe(1);
  });
});
