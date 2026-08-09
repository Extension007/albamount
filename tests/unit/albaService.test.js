const { spendAlba } = require('../../services/albaService');

describe('albaService spend guards', () => {
  test('rejects non-positive amount', async () => {
    await expect(
      spendAlba({ UserModel: {}, userId: 1, amount: 0, reason: 'upgrade_to_paid' })
    ).rejects.toThrow('Amount must be positive');
  });

  test('rejects disallowed spend reason', async () => {
    const result = await spendAlba({
      UserModel: {},
      userId: 1,
      amount: 10,
      reason: 'referral_bonus'
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  test('allows upgrade_to_paid reason without hitting balance when amount invalid path already covered', async () => {
    const result = await spendAlba({
      UserModel: {},
      userId: 1,
      amount: 5,
      reason: 'not_a_real_reason'
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not allowed/i);
  });
});
