const crypto = require('crypto');
const { AdminUser, Settings, RefreshToken } = require('../models');
const { ensureDefaultRoles } = require('./role.service');

const JWT_SECRET = process.env.JWT_SECRET || '';
const TOKEN_TTL_SECONDS = Number(process.env.JWT_EXPIRES_IN_SECONDS || 60 * 30);
const REFRESH_TOKEN_DAYS = Math.max(1, Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || 7));
const SESSION_REFRESH_HOURS = Math.max(1, Number(process.env.SESSION_REFRESH_EXPIRES_IN_HOURS || 8));

async function getTokenTtlSeconds() {
  const settings = await Settings.findOne({ key: 'system' }).select('security.sessionTimeoutMinutes').lean();
  const minutes = Number(settings?.security?.sessionTimeoutMinutes || 30);
  return Math.max(60, Math.round(minutes * 60));
}

function getRefreshTtlSeconds(rememberMe = true) {
  return rememberMe
    ? Math.round(REFRESH_TOKEN_DAYS * 24 * 60 * 60)
    : Math.round(SESSION_REFRESH_HOURS * 60 * 60);
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.warn('WARNING: JWT_SECRET is missing or shorter than 32 characters. Set a strong JWT_SECRET in .env.');
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlJson(value) { return b64url(JSON.stringify(value)); }

function signToken(payload) {
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = b64urlJson(payload);
  const signature = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest());
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Invalid token signature');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 }, (err, derived) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt.toString('hex')}$${derived.toString('hex')}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [algorithm, saltHex, hashHex] = String(stored || '').split('$');
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return resolve(false);
    crypto.scrypt(String(password), Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 }, (err, derived) => {
      if (err) return reject(err);
      const expected = Buffer.from(hashHex, 'hex');
      resolve(expected.length === derived.length && crypto.timingSafeEqual(expected, derived));
    });
  });
}

async function createToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = await getTokenTtlSeconds();
  return signToken({
    sub: String(user._id),
    email: user.email,
    role: user.role,
    employeeId: user.employeeId || '',
    iat: now,
    exp: now + ttl
  });
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function newOpaqueRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

async function createRefreshToken(user, { rememberMe = true, ip = '', userAgent = '' } = {}) {
  const refreshToken = newOpaqueRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const ttlSeconds = getRefreshTtlSeconds(rememberMe);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await RefreshToken.create({
    userId: user._id,
    tokenHash,
    expiresAt,
    rememberMe: Boolean(rememberMe),
    ip: String(ip || ''),
    userAgent: String(userAgent || '')
  });

  return { refreshToken, refreshExpiresIn: ttlSeconds, expiresAt };
}

async function rotateRefreshToken(rawToken, { ip = '', userAgent = '' } = {}) {
  const tokenHash = hashRefreshToken(rawToken);
  const session = await RefreshToken.findOne({ tokenHash });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    const error = new Error('Refresh token is invalid or expired');
    error.code = 'INVALID_REFRESH_TOKEN';
    throw error;
  }

  const user = await AdminUser.findById(session.userId);
  if (!user || !user.active) {
    session.revokedAt = new Date();
    await session.save();
    const error = new Error('Account is inactive or no longer exists');
    error.code = 'INVALID_REFRESH_TOKEN';
    throw error;
  }

  const next = await createRefreshToken(user, {
    rememberMe: session.rememberMe,
    ip: ip || session.ip,
    userAgent: userAgent || session.userAgent
  });

  session.revokedAt = new Date();
  session.lastUsedAt = new Date();
  session.replacedByTokenHash = hashRefreshToken(next.refreshToken);
  await session.save();

  return { user, ...next };
}

async function revokeRefreshToken(rawToken) {
  if (!rawToken) return false;
  const tokenHash = hashRefreshToken(rawToken);
  const result = await RefreshToken.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date(), lastUsedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

async function revokeAllRefreshTokens(userId) {
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), lastUsedAt: new Date() } }
  );
}

async function ensureBootstrapAdmin() {
  await ensureDefaultRoles();
  const count = await AdminUser.countDocuments();
  if (count) return;
  const email = String(process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
  const passwordHash = await hashPassword(password);
  const { Role } = require('../models');
  const superRole = await Role.findOne({ code: 'SUPER_ADMIN' }).lean();
  await AdminUser.create({ name: process.env.ADMIN_NAME || 'System Administrator', email, passwordHash, role: 'SUPER_ADMIN', roleId: superRole?._id || null, mustChangePassword: !process.env.ADMIN_PASSWORD });
  console.log(`Bootstrap admin created: ${email}`);
  if (!process.env.ADMIN_PASSWORD) console.log(`Generated temporary admin password (change it immediately): ${password}`);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  ensureBootstrapAdmin,
  TOKEN_TTL_SECONDS,
  getTokenTtlSeconds,
  getRefreshTtlSeconds,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens
};
