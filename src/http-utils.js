'use strict';

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function sendData(res, data, status = 200, extraHeaders) {
  sendJson(res, status, { data }, extraHeaders);
}

function sendError(res, error) {
  const status = error instanceof ApiError ? error.status : 500;
  const payload = {
    error: {
      code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
      message: error instanceof ApiError ? error.message : 'An unexpected error occurred.',
    },
  };
  if (error instanceof ApiError && error.details !== undefined) {
    payload.error.details = error.details;
  }
  sendJson(res, status, payload);
}

async function readJson(req, maxBytes = 1024 * 1024) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (type && type !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 1 MB.');
    }
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must contain a JSON object.');
  }
}

function stringField(body, key, {
  required = false,
  min = 0,
  max = 500,
  pattern,
  label = key,
} = {}) {
  const raw = body[key];
  if (raw == null || raw === '') {
    if (required) throw new ApiError(400, 'VALIDATION_ERROR', `${label} is required.`, { field: key });
    return null;
  }
  if (typeof raw !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be text.`, { field: key });
  }
  const value = raw.trim();
  if (value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} is invalid.`, { field: key });
  }
  return value;
}

function integerField(body, key, { required = false, min = 1, max = Number.MAX_SAFE_INTEGER, label = key } = {}) {
  const raw = body[key];
  if (raw == null || raw === '') {
    if (required) throw new ApiError(400, 'VALIDATION_ERROR', `${label} is required.`, { field: key });
    return null;
  }
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be a valid whole number.`, { field: key });
  }
  return value;
}

function enumField(body, key, allowed, { required = false, fallback = null, label = key } = {}) {
  const raw = body[key];
  if (raw == null || raw === '') {
    if (required) throw new ApiError(400, 'VALIDATION_ERROR', `${label} is required.`, { field: key });
    return fallback;
  }
  if (!allowed.includes(raw)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be one of: ${allowed.join(', ')}.`, { field: key });
  }
  return raw;
}

function dateField(body, key, { required = false, dateOnly = false, label = key } = {}) {
  const value = stringField(body, key, { required, max: 40, label });
  if (value == null) return null;
  if (dateOnly) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
      throw new ApiError(400, 'VALIDATION_ERROR', `${label} must use YYYY-MM-DD.`, { field: key });
    }
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be a valid date and time.`, { field: key });
  }
  return parsed.toISOString();
}

function emailField(body, key, options = {}) {
  const value = stringField(body, key, { max: 254, label: 'Email', ...options });
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Email is invalid.', { field: key });
  }
  return value;
}

function clientIp(req) {
  return req.socket.remoteAddress || null;
}

function camelKey(key) {
  return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) output[camelKey(key)] = camelize(item);
  return output;
}

module.exports = {
  ApiError,
  camelize,
  clientIp,
  dateField,
  emailField,
  enumField,
  integerField,
  readJson,
  securityHeaders,
  sendData,
  sendError,
  sendJson,
  stringField,
};
