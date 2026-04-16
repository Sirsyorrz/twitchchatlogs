import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let db = null;

export async function getDB() {
  if (db) return db;
  db = await open({
    filename: path.join(__dirname, '../db.sqlite'),
    driver: sqlite3.Database
  });
  await db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  return db;
}

export async function initDB() {
  const db = await getDB();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS vods (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      user_login   TEXT,
      title        TEXT,
      duration     TEXT,
      created_at   TEXT,
      view_count   INTEGER,
      thumbnail_url TEXT,
      url          TEXT,
      downloaded_at TEXT,
      added_on     TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id             TEXT PRIMARY KEY,
      vod_id         TEXT NOT NULL,
      username       TEXT NOT NULL,
      display_name   TEXT,
      message        TEXT,
      offset_seconds INTEGER,
      color          TEXT,
      emotes         TEXT,
      badges         TEXT,
      FOREIGN KEY (vod_id) REFERENCES vods(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cm_vod     ON chat_messages(vod_id);
    CREATE INDEX IF NOT EXISTS idx_cm_user    ON chat_messages(username);
    CREATE INDEX IF NOT EXISTS idx_cm_offset  ON chat_messages(offset_seconds);
    CREATE INDEX IF NOT EXISTS idx_vods_login ON vods(user_login);
  `);

  console.log('✅ DB ready');
}
