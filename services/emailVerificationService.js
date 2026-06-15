const crypto = require('crypto');
const { Op } = require('sequelize');
const ejs = require('ejs');
const path = require('path');
const User = require('../models/User');
const { sendMail } = require('./emailService');

const DEFAULT_BASE_URL = 'http://localhost:3000';

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

async function sendVerificationEmail(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  user.verificationToken = token;
  user.verificationTokenExpires = expires;
  user.lastVerificationSent = new Date();
  await user.save();

  const baseUrl = resolveBaseUrl();
  const supportEmail = resolveSupportEmail();
  const verificationLink = `${baseUrl}/verify-email/${token}`;
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
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    user.lastVerificationSent = undefined;
    await user.save().catch(saveError => {
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

async function verifyEmail(token) {
  console.log('[verifyEmail] token=%s', token);
  const user = await User.findOne({
    where: {
      verificationToken: token,
      verificationTokenExpires: { [Op.gt]: new Date() }
    }
  });

  if (!user) {
    console.warn('[verifyEmail] invalid/expired token=%s', token);
    throw new Error('Invalid or expired verification token');
  }

  console.log('[verifyEmail] matched user id=%s username=%s email=%s', user.id, user.username, user.email);

  user.emailVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;
  await user.save();

  const baseUrl = resolveBaseUrl();
  const supportEmail = resolveSupportEmail();
  const loginLink = `${baseUrl}/user/login`;
  const logoUrl = `${baseUrl}/albamount.png`;
  const subject = 'Email подтвержден';
  const preheader = 'Email подтвержден. Добро пожаловать в ALBAMOUNT.';

  const html = await ejs.renderFile(path.join(__dirname, '../views/emails/confirmation-success-template.ejs'), {
    subject,
    preheader,
    username: user.username,
    loginLink,
    baseUrl,
    logoUrl,
    supportEmail
  });

  await sendMail({
    to: user.email,
    subject,
    html
  }).catch(error => {
    console.error('Failed to send confirmation success email:', error);
  });

  return user;
}

module.exports = {
  sendVerificationEmail,
  resendVerificationEmail,
  verifyEmail
};