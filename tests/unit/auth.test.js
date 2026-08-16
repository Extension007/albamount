const { describe, it, expect } = require('@jest/globals');
const { normalizeUser } = require('../../utils/legacyId');

jest.mock('../../config/jwt', () => ({
  verifyToken: jest.fn(),
  generateToken: jest.fn(() => 'new-token')
}));

jest.mock('../../models/User', () => ({
  findByPk: jest.fn()
}));

const { verifyToken } = require('../../config/jwt');
const User = require('../../models/User');
const {
  getAuthUserId,
  getUserFromRequest,
  getUserFromRequestAsync
} = require('../../middleware/auth');

describe('auth middleware', () => {
  describe('getAuthUserId', () => {
    it('returns _id when present', () => {
      expect(getAuthUserId({ _id: '42' })).toBe('42');
    });

    it('falls back to id', () => {
      expect(getAuthUserId({ id: 7 })).toBe('7');
    });

    it('returns null for empty user', () => {
      expect(getAuthUserId(null)).toBeNull();
    });
  });

  describe('getUserFromRequest', () => {
    it('normalizes session user with id only', () => {
      const req = {
        cookies: {},
        session: { user: { id: 3, username: 'test', role: 'user' } }
      };
      const user = getUserFromRequest(req);
      expect(user._id).toBe('3');
      expect(user.username).toBe('test');
    });

    it('prefers JWT over session', () => {
      verifyToken.mockReturnValue({ _id: '9', username: 'jwt', role: 'user' });
      const req = {
        cookies: { exto_token: 'token' },
        session: { user: { id: 1, username: 'session', role: 'user' } }
      };
      const user = getUserFromRequest(req);
      expect(user._id).toBe('9');
    });

    it('accepts Bearer authorization header', () => {
      verifyToken.mockReturnValue({ _id: '11', username: 'hdr', role: 'user' });
      const req = {
        cookies: {},
        headers: { authorization: 'Bearer abc.def' },
        session: {}
      };
      const user = getUserFromRequest(req);
      expect(verifyToken).toHaveBeenCalledWith('abc.def');
      expect(user._id).toBe('11');
    });

    it('ignores non-Bearer authorization header', () => {
      verifyToken.mockClear();
      const req = {
        cookies: {},
        headers: { authorization: 'Basic abc' },
        session: { user: { id: 4, username: 'sess', role: 'user' } }
      };
      const user = getUserFromRequest(req);
      expect(verifyToken).not.toHaveBeenCalled();
      expect(user._id).toBe('4');
    });
  });

  describe('getUserFromRequestAsync', () => {
    it('loads user from DB by session id', async () => {
      verifyToken.mockReturnValue(null);
      User.findByPk.mockResolvedValue({
        id: 5,
        username: 'cabinet',
        role: 'user',
        emailVerified: true
      });

      const req = {
        cookies: {},
        session: { user: { id: 5, username: 'cabinet', role: 'user', emailVerified: true } }
      };

      const user = await getUserFromRequestAsync(req);
      expect(User.findByPk).toHaveBeenCalledWith('5', expect.any(Object));
      expect(user._id).toBe('5');
      expect(user.emailVerified).toBe(true);
    });

    it('returns normalized fallback when user id missing in token payload with id field', async () => {
      verifyToken.mockReturnValue({ id: 2, username: 'legacy', role: 'user' });
      User.findByPk.mockResolvedValue({
        id: 2,
        username: 'legacy',
        role: 'user',
        emailVerified: true
      });

      const req = { cookies: { exto_token: 'x' }, session: {} };
      const user = await getUserFromRequestAsync(req);
      expect(user._id).toBe('2');
    });
  });
});
