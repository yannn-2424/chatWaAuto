import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data'));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'automation.db');
const db = new sqlite3.Database(dbPath);

export const initDb = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Table schedules
      db.run(`
        CREATE TABLE IF NOT EXISTS schedules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_type TEXT NOT NULL,
          target_jid TEXT NOT NULL,
          target_name TEXT NOT NULL,
          message TEXT NOT NULL,
          schedule_type TEXT NOT NULL,
          scheduled_date TEXT,
          scheduled_time TEXT NOT NULL,
          days_of_week TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          next_run TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);

      // Table logs
      db.run(`
        CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          schedule_id INTEGER,
          target_name TEXT NOT NULL,
          target_jid TEXT NOT NULL,
          message TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          sent_at TEXT NOT NULL
        )
      `);

      // Table contacts & groups cache
      db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
          jid TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
};

export const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const getOne = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

export default db;
