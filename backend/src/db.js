import Database from 'better-sqlite3'
import path from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

try {
  const env = readFileSync(path.join(__dirname, '../../.env'), 'utf-8')
  for (const line of env.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0 && !process.env[t.slice(0, i).trim()])
      process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
} catch {}

const dbPath = path.join(process.env.STORAGE_PATH || '/mnt/win-aippt/imgbed', 'imgbed.db')
const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    ext TEXT NOT NULL,
    size INTEGER NOT NULL,
    compressed_size INTEGER,
    width INTEGER,
    height INTEGER,
    format TEXT DEFAULT 'webp',
    phash TEXT,
    tags TEXT DEFAULT '[]',
    description TEXT DEFAULT '',
    url TEXT,
    thumb_url TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_created ON images(created_at DESC);
`)

export default db
