const { castVote } = require('../../services/voteService');

describe('voteService validation', () => {
  test('rejects invalid target type', async () => {
    const result = await castVote({
      targetType: 'unknown',
      targetId: 1,
      vote: 'up',
      guestKey: 'g1'
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  test('rejects invalid vote value', async () => {
    const result = await castVote({
      targetType: 'product',
      targetId: 1,
      vote: 'sideways',
      guestKey: 'g1'
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  test('rejects missing voter', async () => {
    const result = await castVote({
      targetType: 'product',
      targetId: 1,
      vote: 'up'
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  test('rejects non-integer id', async () => {
    const result = await castVote({
      targetType: 'product',
      targetId: 'abc',
      vote: 'up',
      guestKey: 'g1'
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });
});
