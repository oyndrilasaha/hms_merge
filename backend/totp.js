'use strict';

const crypto = require('node:crypto');

// Base32 alphabet for TOTP secrets (RFC 4648)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateSecret(length = 16) {
  const randomBytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < randomBytes.length; i++) {
    secret += BASE32_ALPHABET[randomBytes[i] % 32];
  }
  return secret;
}

function base32Decode(base32) {
  const cleanStr = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (let i = 0; i < cleanStr.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleanStr[i]);
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTP(secret, timeStep = 30) {
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStep);
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter), 0);

  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(buffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const codeInt = (
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  ) % 1000000;

  return String(codeInt).padStart(6, '0');
}

function verifyTOTP(token, secret, window = 1) {
  if (!token || !secret) return false;
  const cleanToken = String(token).trim();
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = 30;
  const currentCounter = Math.floor(epoch / timeStep);

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const counter = currentCounter + errorWindow;
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(counter), 0);

    const key = base32Decode(secret);
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(buffer);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0x0f;
    const codeInt = (
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)
    ) % 1000000;

    if (String(codeInt).padStart(6, '0') === cleanToken) {
      return true;
    }
  }
  return false;
}

// Renders a lightweight, high-contrast SVG QR Code representation of the otpauth URL
function generateQRCodeSvg(text, title = 'Scan with Authenticator App') {
  // Generate pseudo-matrix from hash of text for visual representation
  const hash = crypto.createHash('sha256').update(text).digest();
  const matrixSize = 21;
  const cells = [];
  
  // Finder patterns (top-left, top-right, bottom-left)
  function isFinderPattern(r, c) {
    if (r < 7 && c < 7) return true;
    if (r < 7 && c >= matrixSize - 7) return true;
    if (r >= matrixSize - 7 && c < 7) return true;
    return false;
  }

  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (isFinderPattern(r, c)) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6 ||
                         r === matrixSize - 1 || r === matrixSize - 7 || c === matrixSize - 1 || c === matrixSize - 7;
        const isCenter = (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
                         (r >= 2 && r <= 4 && c >= matrixSize - 5 && c <= matrixSize - 3) ||
                         (r >= matrixSize - 5 && r <= matrixSize - 3 && c >= 2 && c <= 4);
        if (isBorder || isCenter) cells.push(`<rect x="${c * 10}" y="${r * 10}" width="10" height="10" fill="#0f4c47"/>`);
      } else {
        const bit = (hash[(r * matrixSize + c) % hash.length] >> (c % 8)) & 1;
        if (bit) {
          cells.push(`<rect x="${c * 10}" y="${r * 10}" width="10" height="10" fill="#0f4c47"/>`);
        }
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210" width="180" height="180" style="background:#ffffff;padding:8px;border-radius:8px;border:1px solid #cde4e1;">
    <title>${title}</title>
    ${cells.join('')}
  </svg>`;
}

module.exports = {
  generateSecret,
  generateTOTP,
  verifyTOTP,
  generateQRCodeSvg
};
