// db.js — SQLite via better-sqlite3 (synchrone, écriture directe sur disque)
// Remplace sql.js/WASM : plus de persist(), plus de inTransaction flag.

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');

let db;

async function init() {
  db = new Database(DB_PATH);

  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // ── Schéma complet (inclut les colonnes ajoutées via ALTER TABLE) ──────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS medecins (
      id      TEXT PRIMARY KEY,
      nom     TEXT NOT NULL,
      type    TEXT NOT NULL,
      sched   TEXT NOT NULL DEFAULT '1111111111',
      service TEXT DEFAULT 'geriatrie',
      tel     TEXT DEFAULT '',
      email   TEXT DEFAULT NULL,
      actif   INTEGER NOT NULL DEFAULT 1
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS absences (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      med_id       TEXT NOT NULL,
      date_debut   TEXT NOT NULL,
      date_fin     TEXT NOT NULL,
      type_abs     TEXT NOT NULL,
      demi_journee TEXT DEFAULT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS affectations (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      poste_id TEXT NOT NULL,
      med_id   TEXT NOT NULL,
      UNIQUE(week_key, poste_id, med_id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS exclusions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      poste_id TEXT NOT NULL,
      med_id   TEXT NOT NULL,
      jour     TEXT NOT NULL,
      UNIQUE(week_key, poste_id, med_id, jour)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS extras (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      poste_id TEXT NOT NULL,
      med_id   TEXT NOT NULL,
      jour     TEXT NOT NULL,
      UNIQUE(week_key, poste_id, med_id, jour)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS renforts (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      poste_id TEXT NOT NULL,
      med_id   TEXT NOT NULL,
      jour     TEXT NOT NULL,
      UNIQUE(week_key, poste_id, med_id, jour)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS conge_tokens (
      token      TEXT PRIMARY KEY,
      med_id     TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS astreintes (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      date_iso TEXT NOT NULL,
      type_ast TEXT NOT NULL,
      med_id   TEXT NOT NULL,
      UNIQUE(date_iso, type_ast)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        TEXT,
      action         TEXT NOT NULL,
      table_name     TEXT NOT NULL,
      record_id      TEXT,
      payload_before TEXT,
      payload_after  TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Migrations idempotentes (bases existantes avant la refacto schéma) ─────
  try { db.exec(`ALTER TABLE medecins ADD COLUMN service TEXT DEFAULT 'geriatrie'`); } catch(_) {}
  try { db.exec(`ALTER TABLE medecins ADD COLUMN tel TEXT DEFAULT ''`); } catch(_) {}
  try { db.exec(`ALTER TABLE medecins ADD COLUMN email TEXT DEFAULT NULL`); } catch(_) {}
  try { db.exec(`ALTER TABLE absences ADD COLUMN demi_journee TEXT DEFAULT NULL`); } catch(_) {}
  try { db.exec(`ALTER TABLE medecins ADD COLUMN actif INTEGER NOT NULL DEFAULT 1`); } catch(_) {}

  // ── Seed ──────────────────────────────────────────────────────────────────
  const count = queryOne('SELECT COUNT(*) as n FROM medecins').n;
  if (count === 0) {
    const medecins = [
      ['clarisse',  'Clarisse',            'ph',     '1111111111'],
      ['romain',    'Romain Decours',       'ph',     '1111111111'],
      ['laeti_p',   'Laëtitia P.',          'ph',     '1111111111'],
      ['laeti_d',   'Laëtitia D.',          'ph',     '1111111111'],
      ['anne_dlb',  'Anne DLB',             'ph',     '1111111111'],
      ['audrey',    'Audrey Courtois',      'ph',     '1100111111'],
      ['gabrielle', 'Gabrielle',            'ph',     '1111111111'],
      ['coralie',   'Coralie',              'ph',     '1111111111'],
      ['caroline',  'Caroline',             'ph',     '1111001111'],
      ['sylvain',   'Sylvain',              'ph',     '1111111111'],
      ['marion',    'Marion',               'ph',     '1111111111'],
      ['fabienne',  'Fabienne Blanchet',    'ph',     '1111111111'],
      ['robin',     'Robin',                'ph',     '1111111111'],
      ['mathilde',  'Mathilde',             'ph',     '1111111111'],
      ['melissa',   'Mélissa Lidec',        'ph',     '1100111111'],
      ['pauline',   'Pauline',              'ph',     '1111111111'],
      ['dubrez',    'Dr Dubrez',            'ph',     '1111111111'],
      ['flora',     'Flora',                'ph',     '1111111111'],
      ['maureen',   'Maureen H.',           'ph',     '1111111111'],
      ['beatrice',  'Béatrice',             'ipa',    '1111111111'],
      ['maurane',   'Maurane',              'ipa',    '1111111111'],
      ['int1',      'Interne 1',            'interne','1111111111'],
      ['int2',      'Interne 2',            'interne','1111111111'],
      ['int3',      'Interne 3',            'interne','1111111111'],
      ['int4',      'Interne 4',            'interne','1111111111'],
      ['int5',      'Interne 5',            'interne','1111111111'],
      ['julia',     'Julia',                'externe','1111111111'],
      ['ext2',      'Externe 2',            'externe','1111111111'],
      ['ext3',      'Externe 3',            'externe','1111111111'],
      ['ext4',      'Externe 4',            'externe','1111111111'],
      ['samira',    'Samira Khalef',        'padhue', '1111111111'],
      ['fatima',    'Fatima Manseur',       'padhue', '1111111111'],
      ['ali',       'Ali Hamadouche',       'padhue', '1111111111'],
      ['nelson',    'Nelson Manisha',       'padhue', '1111111111'],
    ];
    const insertMed = db.prepare('INSERT INTO medecins (id,nom,type,sched) VALUES (?,?,?,?)');
    const insertAll = db.transaction((meds) => {
      for (const [id, nom, type, sched] of meds) {
        insertMed.run(id, nom, type, sched);
      }
    });
    insertAll(medecins);
    console.log('✓ Base initialisée avec', medecins.length, 'praticiens');
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
