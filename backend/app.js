'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createApi } = require('./api');
const { openDatabase } = require('./database');
const { ApiError, securityHeaders, sendError } = require('./http-utils');

const DEFAULT_PUBLIC_DIR = path.resolve(__dirname, '..', 'frontend');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function resolveStatic(publicDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new ApiError(400, 'INVALID_PATH', 'The request path is invalid.');
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const target = path.resolve(publicDir, relative);
  if (target !== publicDir && !target.startsWith(`${publicDir}${path.sep}`)) return null;
  return target;
}

function serveFile(req, res, file) {
  const stat = fs.statSync(file);
  const type = MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Length': stat.size,
    'Content-Type': type,
  });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
}

function createApp(options = {}) {
  const ownsDatabase = !options.db;
  const db = options.db || openDatabase({
    filename: options.databaseFile,
    seed: options.seed !== false,
  });
  const publicDir = path.resolve(options.publicDir || DEFAULT_PUBLIC_DIR);
  const handleApi = createApi(db, { secureCookies: options.secureCookies });

  function app(req, res) {
    securityHeaders(res);
    Promise.resolve().then(async () => {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          Allow: 'GET, HEAD, POST, PATCH, OPTIONS',
          'Cache-Control': 'no-store',
        });
        res.end();
        return;
      }
      if (await handleApi(req, res, url)) return;
      if (!['GET', 'HEAD'].includes(req.method)) {
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not allowed for the requested resource.');
      }
      let file = resolveStatic(publicDir, url.pathname);
      if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
        serveFile(req, res, file);
        return;
      }
      const fallback = path.join(publicDir, 'index.html');
      if (fs.existsSync(fallback) && fs.statSync(fallback).isFile()) {
        serveFile(req, res, fallback);
        return;
      }
      throw new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }).catch((error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (!(error instanceof ApiError)) console.error(error);
      sendError(res, error);
    });
  }

  app.db = db;
  app.close = () => {
    if (ownsDatabase && db.isOpen) db.close();
  };
  return app;
}

module.exports = { createApp };
