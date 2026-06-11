// db_schema.js — source unique du schéma SQLite et du seed
// Importé par db.js (prod) et db_testable.js (tests)

function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS medecins (
      id      TEXT PRIMARY KEY,
      nom     TEXT NOT NULL,
      type    TEXT NOT NULL,
      sched   TEXT NOT NULL DEFAULT '1111111111',
      service TEXT DEFAULT 'geriatrie',
      tel     TEXT DEFAULT '',
      email   TEXT DEFAULT NULL,
      actif   INTEGER NOT NULL DEFAULT 1,
      date_arrivee TEXT DEFAULT NULL,
      date_depart  TEXT DEFAULT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS absences (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      med_id       TEXT NOT NULL,
      date_debut   TEXT NOT NULL,
      date_fin     TEXT NOT NULL,
      type_abs     TEXT NOT NULL,
      demi_journee TEXT DEFAULT NULL,
      source_token TEXT DEFAULT NULL,
      confirmed    INTEGER NOT NULL DEFAULT 0
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
  // Contrainte P1 : 1 médecin = 1 poste max par semaine (renforts dans table séparée, pas impactés)
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_aff_week_med ON affectations(week_key, med_id)`);
  } catch(_) {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS conge_campaigns (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      created_by INTEGER,
      types      TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS conge_tokens (
      token       TEXT PRIMARY KEY,
      med_id      TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      used_at     TEXT DEFAULT NULL,
      campaign_id INTEGER DEFAULT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS conge_requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      medecin_id  TEXT NOT NULL,
      date_debut  TEXT NOT NULL,
      date_fin    TEXT NOT NULL,
      type        TEXT NOT NULL,
      note        TEXT,
      statut      TEXT NOT NULL DEFAULT 'pending',
      absence_id  INTEGER DEFAULT NULL,
      created_at  TEXT NOT NULL,
      FOREIGN KEY (medecin_id) REFERENCES medecins(id)
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nom           TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS fermetures (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      poste_id   TEXT NOT NULL,
      date_debut TEXT NOT NULL,
      date_fin   TEXT NOT NULL,
      label      TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

const SEED_MEDECINS = [
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

function applySeed(db) {
  const count = db.prepare('SELECT COUNT(*) as n FROM medecins').get().n;
  if (count > 0) return;
  const insertMed = db.prepare('INSERT INTO medecins (id,nom,type,sched) VALUES (?,?,?,?)');
  db.transaction((meds) => {
    for (const [id, nom, type, sched] of meds) insertMed.run(id, nom, type, sched);
  })(SEED_MEDECINS);
}

module.exports = { applySchema, applySeed, SEED_MEDECINS };
