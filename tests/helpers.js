'use strict';

process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { createApp, createServer } = require('../src/server');
const { DEMO_PASSWORD } = require('../src/database');

async function startTestServer(t) {
  const app = createApp({ databaseFile: ':memory:', secureCookies: false });
  const server = createServer({ app });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    app.close();
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function request(path, {
    method = 'GET',
    session,
    headers: suppliedHeaders,
    json,
    body,
  } = {}) {
    const headers = new Headers(suppliedHeaders || {});
    if (session?.cookie) headers.set('Cookie', session.cookie);
    if (session?.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers.set('X-CSRF-Token', session.csrfToken);
    }
    if (json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(json);
    }

    const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const text = await response.text();
    let payload = null;
    if (text) {
      const type = response.headers.get('content-type') || '';
      payload = type.includes('json') ? JSON.parse(text) : text;
    }
    return { response, status: response.status, payload, text };
  }

  async function login(username, password = DEMO_PASSWORD) {
    const result = await request('/api/auth/login', {
      method: 'POST',
      json: { username, password },
    });
    assert.equal(result.status, 200, `Expected ${username} to sign in: ${result.text}`);
    const setCookie = result.response.headers.get('set-cookie');
    assert.ok(setCookie, 'Login must return a session cookie.');
    return {
      cookie: setCookie.split(';', 1)[0],
      setCookie,
      csrfToken: result.payload.data.csrfToken,
      user: result.payload.data.user,
    };
  }

  return { app, baseUrl, login, request, server };
}

function assertApiError(result, status, code) {
  assert.equal(result.status, status, result.text);
  assert.equal(result.payload?.error?.code, code, result.text);
  assert.equal(typeof result.payload?.error?.message, 'string');
  assert.ok(result.payload.error.message.length > 0);
}

module.exports = {
  assertApiError,
  startTestServer,
};
