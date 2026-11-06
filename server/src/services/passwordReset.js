import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const MIN_PASSWORD_LENGTH = 10;

/** Only the SHA-256 hash of a reset token is stored, so a database leak cannot be used to reset passwords. */
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
export const newResetToken = () => crypto.randomBytes(32).toString('hex');

export function buildResetUrl(clientUrl, token) {
  const base = String(clientUrl || 'http://localhost:5173').split(',')[0].trim().replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Starts a password reset. Always resolves the same way whether or not the email exists,
 * so the endpoint cannot be used to discover which emails have accounts.
 * `User` and `sendMail` are injected so this can be unit-tested without a database or SMTP server.
 */
export async function requestPasswordReset({ User, sendMail, email, clientUrl, now = Date.now() }) {
  const user = await User.findOne({ email: String(email).trim().toLowerCase() });
  if (!user || !user.active) return { sent: false };
  const token = newResetToken();
  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetExpires = new Date(now + RESET_TOKEN_TTL_MS);
  await user.save();
  const url = buildResetUrl(clientUrl, token);
  await sendMail({
    to: user.email,
    subject: 'Reset your LuxuryStay password',
    text: `Hello ${user.name},\n\nWe received a request to reset your LuxuryStay password. Open this link to choose a new one (valid for 30 minutes):\n\n${url}\n\nIf you did not request this, you can ignore this email — your password will not change.\n\nLuxuryStay Hospitality`,
    html: `<p>Hello ${escapeHtml(user.name)},</p><p>We received a request to reset your LuxuryStay password. <a href="${url}">Choose a new password</a> (link valid for 30 minutes).</p><p>If you did not request this, you can ignore this email — your password will not change.</p><p>LuxuryStay Hospitality</p>`,
  });
  return { sent: true };
}

/** Completes a reset. Returns false when the token is unknown, already used, or expired. */
export async function completePasswordReset({ User, token, password, now = Date.now() }) {
  if (!token) return false;
  const user = await User.findOne({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpires: { $gt: new Date(now) },
  }).select('+passwordResetTokenHash +passwordResetExpires +passwordHash');
  if (!user || !user.active) return false;
  user.passwordHash = await bcrypt.hash(password, 12);
  user.mustChangePassword = false;
  user.passwordResetTokenHash = undefined; // single use
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = new Date(now); // signs out every older session (see middleware/auth.js)
  await user.save();
  return true;
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
