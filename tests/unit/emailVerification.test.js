const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../config/database', () => {
  const actualOp = { gt: Symbol('gt') };
  return {
    sequelize: {
      transaction: jest.fn(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } })),
      query: jest.fn().mockResolvedValue([])
    },
    Op: actualOp
  };
});

jest.mock('../../models/User', () => ({
  findByPk: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('../../models/VerificationToken', () => ({
  update: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('../../services/emailService', () => ({
  sendMail: jest.fn().mockResolvedValue(true)
}));

const User = require('../../models/User');
const VerificationToken = require('../../models/VerificationToken');
const { verifyEmail, verifyEmailByTokenOnly } = require('../../services/emailVerificationService');

describe('emailVerificationService.verifyEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid token format without DB update', async () => {
    const result = await verifyEmail('1', 'short');
    expect(result.status).toBe('invalid');
    expect(VerificationToken.update).not.toHaveBeenCalled();
  });

  it('rejects non-numeric userId', async () => {
    const result = await verifyEmail('abc', 'a'.repeat(64));
    expect(result.status).toBe('invalid');
  });

  it('returns verified when atomic update consumes token', async () => {
    VerificationToken.update.mockResolvedValue([1]);
    const user = {
      id: 7,
      emailVerified: false,
      save: jest.fn().mockResolvedValue(true)
    };
    User.findByPk.mockResolvedValue(user);

    const result = await verifyEmail('7', 'ab'.repeat(32));
    expect(result.status).toBe('verified');
    expect(user.emailVerified).toBe(true);
    expect(user.verifiedAt).toBeInstanceOf(Date);
    expect(user.save).toHaveBeenCalled();
  });

  it('returns already_verified when token used but user verified', async () => {
    VerificationToken.update.mockResolvedValue([0]);
    User.findByPk.mockResolvedValue({
      id: 7,
      emailVerified: true,
      verificationToken: null
    });

    const result = await verifyEmail('7', 'cd'.repeat(32));
    expect(result.status).toBe('already_verified');
  });

  it('verifyEmailByTokenOnly resolves userId from token row', async () => {
    VerificationToken.findOne.mockResolvedValue({ userId: 3, token: 'ef'.repeat(32) });
    VerificationToken.update.mockResolvedValue([1]);
    const user = {
      id: 3,
      emailVerified: false,
      save: jest.fn().mockResolvedValue(true)
    };
    User.findByPk.mockResolvedValue(user);

    const result = await verifyEmailByTokenOnly('ef'.repeat(32));
    expect(result.status).toBe('verified');
    expect(result.user.id).toBe(3);
  });
});
