'use strict';

const http = require('node:http');
const { createApp } = require('./app');

function createServer(options = {}) {
  const app = options.app || createApp(options);
  const server = http.createServer(app);
  server.app = app;
  return server;
}

if (require.main === module) {
  const host = process.env.HOST || '0.0.0.0';
  const port = Number.parseInt(process.env.PORT || '3005', 10);
  const server = createServer({ databaseFile: process.env.SGH_DATABASE_FILE });

  server.listen(port, host, () => {
    console.log(`St George HMS is running at http://${host}:${port}`);
    console.log('This MVP contains synthetic demonstration data only.');
  });

  function shutdown() {
    server.close(() => {
      server.app.close();
      process.exit(0);
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createApp, createServer };
