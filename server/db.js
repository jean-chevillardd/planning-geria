// db.js — SQLite via sql.js (pur JS/WASM, sans compilation native)
// La BDD est chargée depuis un fichier .sqlite au démarrage et
// sauvegardée sur disque après chaque écriture.

const initSqlJs = require('sql.js');
const fs        = require('fs');
const path      = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');

// sql.js fonctionne en mémoire ; on persiste manuellement
let db;
let inTransaction = false;

function persist() {
  if (inTransaction) return; // db.export() ferait un COMMIT implicite dans une transaction ouverte
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function init() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // ── Schéma ─────────────────────────────────────────────
  db.run(`PRAGMA foreign_keys = ON`);

  db.run(`
    CREATE TABLE IF NOT EXISTS medecins (
      id    TEXT PRIMARY KEY,
      nom   TEXT NOT NULL,
      type  TEXT NOT NULL,
      sched TEXT NOT NULL DEFAULT '1111111111'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS absences (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      med_id     TEXT NOT NULL,
      date_debut TEXT NOT NULL,
      date_fin   TEXT NOT NULL,
      type_abs   TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS affectations (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      poste_id TEXT NOT NULL,
      med_id   TEXT NOT NULL,
      UNIQUE(week_key, poste_id, med_id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS exclusions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      poste_id TEXT NOT NULL,
      med_id   TEXT NOT NULL,
      jour     TEXT NOT NULL,
      UNIQUE(week_key, poste_id, med_id, jour)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS extras (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      poste_id TEXT NOT NULL,
      med_id   TEXT NOT NULL,
      jour     TEXT NOT NULL,
      UNIQUE(week_key, poste_id, med_id, jour)
    )
  `);

  // ── Migrations idempotentes ────────────────────────────
  try { db.run(`ALTER TABLE medecins ADD COLUMN service TEXT DEFAULT 'geriatrie'`); } catch(_) {}
  try { db.run(`ALTER TABLE medecins ADD COLUMN tel TEXT DEFAULT ''`); } catch(_) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS astreintes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      date_iso  TEXT NOT NULL,
      type_ast  TEXT NOT NULL,
      med_id    TEXT NOT NULL,
      UNIQUE(date_iso, type_ast)
    )
  `);

  // ── Seed ───────────────────────────────────────────────
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
      ['flora',     'Flora',               'ph',     '1111111111'],
      ['maureen',   'Maureen H.',           'ph',     '1111111111'],
      ['beatrice',  'Béatrice',             'ipa',    '1111111111'],
      ['maurane',   'Maurane',              'ipa',    '1111111111'],
      ['int1',      'Interne 1',            'interne','1111111111'],
      ['int2',      'Interne 2',            'interne','1111111111'],
      ['int3',      'Interne 3',            'interne','1111111111'],
      ['int4',      'Interne 4',            'interne','1111111111'],
      ['int5',      'Interne 5',            'interne','1111111111'],
      ['julia',     'Julia',                 'externe','1111111111'],
      ['ext2',      'Externe 2',            'externe','1111111111'],
      ['ext3',      'Externe 3',            'externe','1111111111'],
      ['ext4',      'Externe 4',            'externe','1111111111'],
      ['samira',    'Samira Khalef',         'padhue', '1111111111'],
      ['fatima',    'Fatima Manseur',        'padhue', '1111111111'],
      ['ali',       'Ali Hamadouche',        'padhue', '1111111111'],
      ['nelson',    'Nelson Manisha',        'padhue', '1111111111'],
    ];
    medecins.forEach(([id, nom, type, sched]) => {
      db.run('INSERT INTO medecins (id,nom,type,sched) VALUES (?,?,?,?)', [id, nom, type, sched]);
    });
    persist();
    console.log('✓ Base initialisée avec', medecins.length, 'praticiens');
  }

  return db;
}

// ── Helpers sql.js (rend l'API proche de better-sqlite3) ──

/** Retourne toutes les lignes d'un SELECT */
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Retourne la première ligne */
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

/** Execute une requête INSERT/UPDATE/DELETE, retourne { lastInsertRowid } */
function run(sql, params = []) {
  db.run(sql, params);
  const id = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0];
  persist();
  return { lastInsertRowid: id };
}

/** Execute plusieurs instructions dans une transaction */
function transaction(fn) {
  db.run('BEGIN');
  inTransaction = true;
  try {
    fn();
    inTransaction = false;
    db.run('COMMIT');
    persist();
  } catch(e) {
    inTransaction = false;
    try { db.run('ROLLBACK'); } catch(_) {}
    throw e;
  }
}

module.exports = { init, queryAll, queryOne, run, transaction };
