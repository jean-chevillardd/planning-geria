// db.js — SQLite via better-sqlite3 (synchrone, écriture directe sur disque)
// Remplace sql.js/WASM : plus de persist(), plus de inTransaction flag.

const Database = require('better-sqlite3');
const path     = require('path');
const { applySchema, applySeed, SEED_MEDECINS } = require('./db_schema');

const DB_PATH = path.join(__dirname, 'database.sqlite');

let db;

async function init() {
  db = new Database(DB_PATH);

  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  applySchema(db);

  // ── Migrations idempotentes (bases existantes avant la refacto schéma) ─────
  try { db.exec(`ALTER TABLE medecins ADD COLUMN service TEXT DEFAULT 'geriatrie'`); } catch(_) {}
  try { db.exec(`ALTER TABLE medecins ADD COLUMN tel TEXT DEFAULT ''`); } catch(_) {}
  try { db.exec(`ALTER TABLE medecins ADD COLUMN email TEXT DEFAULT NULL`); } catch(_) {}
  try { db.exec(`ALTER TABLE absences ADD COLUMN demi_journee TEXT DEFAULT NULL`); } catch(_) {}
  try { db.exec(`ALTER TABLE medecins ADD COLUMN actif INTEGER NOT NULL DEFAULT 1`); } catch(_) {}
  try { db.exec(`ALTER TABLE conge_tokens ADD COLUMN used_at TEXT DEFAULT NULL`); } catch(_) {}
  try { db.exec(`ALTER TABLE conge_tokens ADD COLUMN campaign_id INTEGER DEFAULT NULL`); } catch(_) {}
  try { db.exec(`ALTER TABLE absences ADD COLUMN source_token TEXT DEFAULT NULL`); } catch(_) {}
  try { db.exec(`ALTER TABLE absences ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0`); } catch(_) {}

  applySeed(db);
  const count = db.prepare('SELECT COUNT(*) as n FROM medecins').get().n;
  if (count === SEED_MEDECINS.length) {
    console.log('✓ Base initialisée avec', count, 'praticiens');
  }

  // Seed code équipe par défaut (si absent)
  const existingCode = db.prepare("SELECT value FROM settings WHERE key='team_code'").get();
  if (!existingCode) {
    const defaultCode = require('crypto').randomBytes(3).toString('hex').toUpperCase();
    db.prepare("INSERT INTO settings (key, value) VALUES ('team_code', ?)").run(defaultCode);
    console.log(`✓ Code équipe initial généré : ${defaultCode} (modifiable dans l'interface gestionnaire)`);
  }

  return db;
}

// ── API (interface identique à l'ancienne pour index.js) ──────────────────────

function queryAll(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function queryOne(sql, params = []) {
  return db.prepare(sql).get(...params) || null;
}

function run(sql, params = []) {
  const info = db.prepare(sql).run(...params);
  return { lastInsertRowid: info.lastInsertRowid };
}

function transaction(fn) {
  db.transaction(fn)();
}

module.exports = { init, queryAll, queryOne, run, transaction };
