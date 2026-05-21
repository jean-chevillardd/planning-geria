// db_testable.js — version de db.js avec chemin de DB configurable via env
// Permet aux tests d'utiliser des DB temporaires isolées

const initSqlJs = require('sql.js');
const fs        = require('fs');
const path      = require('path');

// En test, PG_TEST_DB_PATH peut pointer vers un fichier temporaire
const DB_PATH = process.env.PG_TEST_DB_PATH || path.join(__dirname, 'database.sqlite');

let db;

function persist() {
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

  // Seed initial
  const count = queryOne('SELECT COUNT(*) as n FROM medecins').n;
  if (count === 0) {
    const medecins = [
      ['clarisse',  'Clarisse',            'ph',     '1111111111'],
      ['romain',    'Romain (Decours)',     'ph',     '1111111111'],
      ['laeti_p',   'Laëtitia P.',          'ph',     '1111111111'],
      ['laeti_d',   'Laëtitia D.',          'ph',     '1111111111'],
      ['anne_dlb',  'Anne DLB',             'ph',     '1111111111'],
      ['audrey',    'Audrey (Courtois)',     'ph',     '1100111111'],
      ['gabrielle', 'Gabrielle',            'ph',     '1111111111'],
      ['coralie',   'Coralie',              'ph',     '1111111111'],
      ['caroline',  'Caroline',             'ph',     '1111001111'],
      ['sylvain',   'Sylvain',              'ph',     '1111111111'],
      ['marion',    'Marion',               'ph',     '1111111111'],
      ['fabienne',  'Fabienne (Blanchet)',   'ph',     '1111111111'],
      ['robin',     'Robin',                'ph',     '1111111111'],
      ['mathilde',  'Mathilde',             'ph',     '1111111111'],
      ['melissa',   'Mélissa (Lidec)',       'ph',     '1100111111'],
      ['pauline',   'Pauline',              'ph',     '1111111111'],
      ['dubrez',    'Dr Dubrez',            'ph',     '1111111111'],
      ['flora',     'Flora',               'ph',     '1111111111'],
      ['maureen',   'Maureen H.',           'ph',     '1111111111'],
      ['beatrice',  'Béatrice (IPA)',        'ipa',    '1111111111'],
      ['maurane',   'Maurane (IPA)',         'ipa',    '1111111111'],
      ['int1',      'Interne 1',            'interne','1111111111'],
      ['int2',      'Interne 2',            'interne','1111111111'],
      ['int3',      'Interne 3',            'interne','1111111111'],
      ['int4',      'Interne 4',            'interne','1111111111'],
      ['int5',      'Interne 5',            'interne','1111111111'],
      ['julia',     'Julia (ext.)',          'externe','1111111111'],
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
  }

  return db;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  const id = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0];
  persist();
  return { lastInsertRowid: id };
}

function transaction(fn) {
  db.run('BEGIN');
  try {
    fn();
    db.run('COMMIT');
    persist();
  } catch(e) {
    db.run('ROLLBACK');
    throw e;
  }
}

module.exports = { init, queryAll, queryOne, run, transaction };
