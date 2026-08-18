'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Unified Database Adapter supporting SQLite (built-in node:sqlite)
 * and MySQL 8.x (when DB_DRIVER=mysql environment variable is specified).
 */
class DatabaseAdapter {
  constructor(driver = process.env.DB_DRIVER || 'sqlite', options = {}) {
    this.driver = driver.toLowerCase();
    this.options = options;
    this.sqliteDb = null;
    this.mysqlPool = null;
  }

  static open(options = {}) {
    const adapter = new DatabaseAdapter(process.env.DB_DRIVER || 'sqlite', options);
    adapter.init();
    return adapter;
  }

  init() {
    if (this.driver === 'mysql') {
      const mysql = require('mysql2/promise');
      this.mysqlPool = mysql.createPool({
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'st_george_hms',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
    } else {
      const { DatabaseSync } = require('node:sqlite');
      const filename = this.options.filename || path.resolve(__dirname, '..', 'data', 'hospital.db');
      if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
      this.sqliteDb = new DatabaseSync(filename);
      this.sqliteDb.exec('PRAGMA foreign_keys = ON;');
      if (filename !== ':memory:') this.sqliteDb.exec('PRAGMA journal_mode = WAL;');
    }
  }

  prepare(sql) {
    if (this.driver === 'mysql') {
      const pool = this.mysqlPool;
      // Convert SQLite ? placeholders to MySQL format if needed
      return {
        get: async (...params) => {
          const [rows] = await pool.execute(sql, params);
          return rows[0] || null;
        },
        all: async (...params) => {
          const [rows] = await pool.execute(sql, params);
          return rows;
        },
        run: async (...params) => {
          const [result] = await pool.execute(sql, params);
          return { id: result.insertId, changes: result.affectedRows };
        }
      };
    } else {
      return this.sqliteDb.prepare(sql);
    }
  }

  exec(sql) {
    if (this.driver === 'mysql') {
      return this.mysqlPool.query(sql);
    } else {
      return this.sqliteDb.exec(sql);
    }
  }

  close() {
    if (this.sqliteDb) this.sqliteDb.close();
    if (this.mysqlPool) this.mysqlPool.end();
  }
}

module.exports = DatabaseAdapter;
