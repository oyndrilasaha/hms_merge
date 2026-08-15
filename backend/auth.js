'use strict';

const {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} = require('node:crypto');

const SESSION_COOKIE = 'sgh_session';
const configuredTtl = Number.parseInt(process.env.SGH_SESSION_TTL_SECONDS || '600', 10);
const SESSION_TTL_SECONDS = Number.isInteger(configuredTtl)
  ? Math.min(Math.max(configuredTtl, 300), 3600)
  : 600;

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHex) {
  try {
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookies(header = '') {
  const cookies = {};
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function sessionCookie(token, { secure = false, maxAge = SESSION_TTL_SECONDS } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie({ secure = false } = {}) {
  return sessionCookie('', { secure, maxAge: 0 });
}

function createSession(db, userId, ttlSeconds = SESSION_TTL_SECONDS) {
  const token = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)',
  ).run(tokenHash(token), userId, csrfToken, expiresAt);
  return { token, csrfToken, expiresAt };
}

function destroySession(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

function getSession(db, req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;

  const session = db.prepare(`
    SELECT
      s.token_hash, s.csrf_token, s.expires_at,
      u.id, u.username, u.full_name, u.email, u.role, u.branch_id,
      b.code AS branch_code, b.name AS branch_name,
      p.id AS patient_id, p.medical_record_number
    FROM sessions s
    JOIN users u ON u.id = s.user_id AND u.active = 1
    LEFT JOIN branches b ON b.id = u.branch_id
    LEFT JOIN patients p ON p.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(tokenHash(token), new Date().toISOString());

  if (!session) {
    destroySession(db, token);
    return null;
  }
  return { token, ...session };
}

function publicUser(session) {
  return {
    id: session.id,
    username: session.username,
    fullName: session.full_name,
    email: session.email,
    role: session.role,
    branch: session.branch_id
      ? { id: session.branch_id, code: session.branch_code, name: session.branch_name }
      : null,
    patientId: session.patient_id || null,
    medicalRecordNumber: session.medical_record_number || null,
  };
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  createSession,
  destroySession,
  getSession,
  hashPassword,
  parseCookies,
  publicUser,
  sessionCookie,
  tokenHash,
  verifyPassword,
};
