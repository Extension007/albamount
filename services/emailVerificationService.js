const crypto = require('crypto');
const { Op } = require('sequelize');
const ejs = require('ejs');
const path = require('path');
const { sequelize } = require('../config/database');
const User = require('../models/User');
const VerificationToken = require('../models/VerificationToken');
const { sendMail } = require('./emailService');

const DEFAULT_BASE_URL = 'http://localhost:3000';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_HEX_RE = /^[a-f0-9]{64}$/i;

function resolveBaseUrl() {
  const baseUrl = process.env.BASE_URL;
  if (baseUrl) {
    return baseUrl.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BASE_URL must be set in production for email links.');
  }
  return DEFAULT_BASE_URL;
}

function resolveSupportEmail() {
  return process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || 'support@albamount.xyz';
}

async function ensureVerificationTokensTable() {
  await sequelize.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).catch(() => {});
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_verification_tokens_user_id ON verification_tokens(user_id)`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON verification_tokens(token)`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_verification_tokens_used ON verification_tokens(used)`);
}

async function sendVerificationEmail(user) {
  await ensureVerificationTokensTable();

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await VerificationToken.update(
    { used: true },
    { where: { userId: user.id, used: false } }
  );

  await VerificationToken.create({
    userId: user.id,
    token,
    expiresAt,
    used: false
  });

  // Legacy columns for older clients / transitional period
  user.verificationToken = token;
  user.verificationTokenExpires = expiresAt;
  user.lastVerificationSent = new Date();
  await user.save();

  const baseUrl = resolveBaseUrl();
  const supportEmail = resolveSupportEmail();
  const verificationLink = `${baseUrl}/verify-email/${user.id}/${token}`;
  const logoUrl = `${baseUrl}/albamount.png`;
  const subject = 'Подтвердите email';
  const preheader = 'Подтвердите email, чтобы завершить регистрацию в ALBAMOUNT.';

  try {
    const html = await ejs.renderFile(path.join(__dirname, '../views/emails/verification-template.ejs'), {
      subject,
      preheader,
      username: user.username,
      verificationLink,
      validityPeriod: '24 часа',
      baseUrl,
      logoUrl,
      supportEmail
    });

    const text = await ejs.renderFile(path.join(__dirname, '../views/emails/verification-template.txt.ejs'), {
      username: user.username,
      verificationLink,
      validityPeriod: '24 часа'
    });

    await sendMail({
      to: user.email,
      subject,
      html,
      text
    });
  } catch (error) {
    await VerificationToken.update(
      { used: true },
      { where: { userId: user.id, token } }
    ).catch(() => {});

    user.verificationToken = null;
    user.verificationTokenExpires = null;
    user.lastVerificationSent = null;
    await user.save().catch((saveError) => {
      console.error('Failed to rollback verification token on send error:', saveError);
    });
    throw error;
  }
}

async function resendVerificationEmail(email) {
  const user = await User.findOne({ where: { email, emailVerified: false } });
  if (!user) {
    throw new Error('User not found or already verified');
  }

  await sendVerificationEmail(user);
}

/**
 * Atomically consume token for userId+token pair.
 * @returns {{ status: 'verified'|'already_verified'|'invalid', user?: import('sequelize').Model }}
 */
async function verifyEmail(userId, token) {
  if (!/^\d+$/.test(String(userId)) || !TOKEN_HEX_RE.test(String(token || ''))) {
    return { status: 'invalid' };
  }

  await ensureVerificationTokensTable();

  const uid = parseInt(userId, 10);

  return sequelize.transaction(async (t) => {
    const [affected] = await VerificationToken.update(
      { used: true },
      {
        where: {
          userId: uid,
          token,
          used: false,
          expiresAt: { [Op.gt]: new Date() }
        },
        transaction: t
      }
    );

    if (affected > 0) {
      const user = await User.findByPk(uid, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!user) {
        return { status: 'invalid' };
      }

      user.emailVerified = true;
      user.verifiedAt = new Date();
      user.verificationToken = null;
      user.verificationTokenExpires = null;
      await user.save({ transaction: t });

      return { status: 'verified', user };
    }

    const user = await User.findByPk(uid, { transaction: t });
    if (user?.emailVerified) {
      return { status: 'already_verified', user };
    }

    // Legacy fallback: token still only on users table
    if (
      user &&
      !user.emailVerified &&
      user.verificationToken === token &&
      user.verificationTokenExpires &&
      new Date(user.verificationTokenExpires) > new Date()
    ) {
      user.emailVerified = true;
      user.verifiedAt = new Date();
      user.verificationToken = null;
      user.verificationTokenExpires = null;
      await user.save({ transaction: t });

      await VerificationToken.update(
        { used: true },
        { where: { userId: uid, token }, transaction: t }
      ).catch(() => {});

      return { status: 'verified', user };
    }

    return { status: 'invalid' };
  });
}

/**
 * Legacy path: token-only URL. Resolves user_id from verification_tokens, then verifies pair.
 */
async function verifyEmailByTokenOnly(token) {
  if (!TOKEN_HEX_RE.test(String(token || ''))) {
    return { status: 'invalid' };
  }

  await ensureVerificationTokensTable();

  const row = await VerificationToken.findOne({
    where: { token },
    order: [['createdAt', 'DESC']]
  });

  if (row) {
    return verifyEmail(row.userId, token);
  }

  // Legacy: look up by users.verification_token
  const legacyUser = await User.findOne({
    where: {
      verificationToken: token,
      verificationTokenExpires: { [Op.gt]: new Date() }
    }
  });

  if (!legacyUser) {
    // Already verified with consumed legacy token? cannot know user — invalid
    return { status: 'invalid' };
  }

  return verifyEmail(legacyUser.id, token);
}

module.exports = {
  sendVerificationEmail,
  resendVerificationEmail,
  verifyEmail,
  verifyEmailByTokenOnly,
  ensureVerificationTokensTable,
  resolveBaseUrl
};
