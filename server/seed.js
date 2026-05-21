#!/usr/bin/env node
// seed.js -- Réinitialise la BDD et la remplit depuis les CSV du planning Google Sheets
// Usage : node seed.js

const initSqlJs = require('sql.js');
const fs  = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');

// ═══════════════════════════════════════════════════════════
// DICTIONNAIRE PRATICIENS
// Clé = nom normalisé (lowercase, sans "(ext)", sans "IPA", etc.)
// ═══════════════════════════════════════════════════════════
const MED_DICT = {
  // ── PH (Praticiens Hospitaliers) -- liste officielle ──────
  // AMIAUD M.
  'marie':          { id:'marie',      nom:'Marie (Amiaud)',              type:'ph' },
  // RACINE G.
  'gabrielle':      { id:'gabrielle',  nom:'Gabrielle (Racine)',          type:'ph' },
  // BLANCHET F.
  'fabienne':       { id:'fabienne',   nom:'Fabienne (Blanchet)',         type:'ph' },
  // COURTOIS A.
  'audrey':         { id:'audrey',     nom:'Audrey (Courtois)',           type:'ph' },
  // CUBILLE M.
  'marion':         { id:'marion',     nom:'Marion (Cubille)',            type:'ph' },
  // DE LA BASSETIERE A.
  'anne':                    { id:'anne_dlb', nom:'Anne de la Bassetière', type:'ph' },
  'anne dlb':                { id:'anne_dlb', nom:'Anne de la Bassetière', type:'ph' },
  'anne de la bassetiere':   { id:'anne_dlb', nom:'Anne de la Bassetière', type:'ph' },
  'de la bassetiere':        { id:'anne_dlb', nom:'Anne de la Bassetière', type:'ph' },
  // DECOURS R.
  'romain':         { id:'romain',     nom:'Romain (Decours)',            type:'ph' },
  // DELORME L.
  'laeti d':        { id:'laeti_d',    nom:'Laëtitia D. (Delorme)',       type:'ph' },
  'laetitia d':     { id:'laeti_d',    nom:'Laëtitia D. (Delorme)',       type:'ph' },
  'laëtitia d':     { id:'laeti_d',    nom:'Laëtitia D. (Delorme)',       type:'ph' },
  'laeti d.':       { id:'laeti_d',    nom:'Laëtitia D. (Delorme)',       type:'ph' },
  // GENDRE C.
  'clarisse':       { id:'clarisse',   nom:'Clarisse (Gendre)',           type:'ph' },
  // HUMEAU C.
  'caroline':       { id:'caroline',   nom:'Caroline (Humeau)',           type:'ph' },
  // LE GENTIL S.
  'sylvain':        { id:'sylvain',    nom:'Sylvain (Le Gentil)',         type:'ph' },
  // LEROUX C.
  'coralie':        { id:'coralie',    nom:'Coralie (Leroux)',            type:'ph' },
  // MAREAU A.
  'mareau':         { id:'mareau',     nom:'Mareau A.',                   type:'ph' },
  'a. mareau':      { id:'mareau',     nom:'Mareau A.',                   type:'ph' },
  'mareau a':       { id:'mareau',     nom:'Mareau A.',                   type:'ph' },
  'mareau a.':      { id:'mareau',     nom:'Mareau A.',                   type:'ph' },
  // MOTTE VINCENT P.
  'pauline':        { id:'pauline',    nom:'Pauline (Motte-Vincent)',     type:'ph' },
  // PERRON L.
  'laetitia p':     { id:'laeti_p',    nom:'Laëtitia P. (Perron)',        type:'ph' },
  'laeti p':        { id:'laeti_p',    nom:'Laëtitia P. (Perron)',        type:'ph' },
  'laëtitia p':     { id:'laeti_p',    nom:'Laëtitia P. (Perron)',        type:'ph' },
  'laeti p.':       { id:'laeti_p',    nom:'Laëtitia P. (Perron)',        type:'ph' },
  // SCHEER R.
  'robin':          { id:'robin',      nom:'Robin (Scheer)',              type:'ph' },
  // ANGELE G.
  'angèle':         { id:'angele',     nom:'Angèle G.',                   type:'ph' },
  'angele':         { id:'angele',     nom:'Angèle G.',                   type:'ph' },
  // MAUREEN H.
  'maureen':        { id:'maureen_h',  nom:'Maureen H.',                  type:'ph' },
  'maureen h':      { id:'maureen_h',  nom:'Maureen H.',                  type:'ph' },
  'maureen h.':     { id:'maureen_h',  nom:'Maureen H.',                  type:'ph' },
  // EMILIE J.
  'emilie':         { id:'emilie',     nom:'Émilie J.',                   type:'ph' },
  'émilie':         { id:'emilie',     nom:'Émilie J.',                   type:'ph' },
  'emilie j':       { id:'emilie',     nom:'Émilie J.',                   type:'ph' },
  'émilie j':       { id:'emilie',     nom:'Émilie J.',                   type:'ph' },
  // DIJOUX
  'dijoux':         { id:'dijoux',     nom:'Dijoux',                      type:'ph' },
  'dr dijoux':      { id:'dijoux',     nom:'Dijoux',                      type:'ph' },
  'dijoux rempl':   { id:'dijoux',     nom:'Dijoux',                      type:'ph' },
  'dr diijoux':     { id:'dijoux',     nom:'Dijoux',                      type:'ph' }, // typo CSV
  // Alias/abréviations courantes
  'caro':           { id:'caroline',   nom:'Caroline (Humeau)',           type:'ph' },

  // ── IPA ──────────────────────────────────────────────────
  'beatrice ipa':   { id:'beatrice_ipa', nom:'Béatrice (IPA)',   type:'ipa' },
  'béatrice ipa':   { id:'beatrice_ipa', nom:'Béatrice (IPA)',   type:'ipa' },
  'beatrice':       { id:'beatrice_ipa', nom:'Béatrice (IPA)',   type:'ipa' },
  'béatrice':       { id:'beatrice_ipa', nom:'Béatrice (IPA)',   type:'ipa' },
  'maurane ipa':    { id:'maurane_ipa',  nom:'Maurane (IPA)',    type:'ipa' },
  'morane ipa':     { id:'maurane_ipa',  nom:'Maurane (IPA)',    type:'ipa' },
  'maurane':        { id:'maurane_ipa',  nom:'Maurane (IPA)',    type:'ipa' },
  'morane':         { id:'maurane_ipa',  nom:'Maurane (IPA)',    type:'ipa' },
  'charlotte ipa':  { id:'charlotte_ipa', nom:'Charlotte (IPA)', type:'ipa' },
  'laurent ipa':    { id:'laurent_ipa',  nom:'Laurent (IPA)',    type:'ipa' },

  // ── Externes ──────────────────────────────────────────────
  'laurine':        { id:'laurine_ext',  nom:'Laurine (ext.)',   type:'externe' },
  'romane':         { id:'romane_ext',   nom:'Romane (ext.)',    type:'externe' },
  'marine':         { id:'marine_ext',   nom:'Marine (ext.)',    type:'externe' },
  'jeanne':         { id:'jeanne_ext',   nom:'Jeanne (ext.)',    type:'externe' },
  'emmanuel':       { id:'emmanuel_ext', nom:'Emmanuel (ext.)',  type:'externe' },
  'julia':          { id:'julia_ext',    nom:'Julia (ext.)',     type:'externe' },

  // ── PADHUE ───────────────────────────────────────────────
  'samira':         { id:'samira',  nom:'Samira Khalef',    type:'padhue' },
  'fatima':         { id:'fatima',  nom:'Fatima Manseur',   type:'padhue' },
  'ali':            { id:'ali',     nom:'Ali Hamadouche',   type:'padhue' },
  'nelson':         { id:'nelson',  nom:'Nelson Manisha',   type:'padhue' },

  // ── Internes -- liste officielle ───────────────────────────
  'etienne':        { id:'etienne_int',  nom:'Étienne',    type:'interne' },
  'étienne':        { id:'etienne_int',  nom:'Étienne',    type:'interne' },
  'gauthier':       { id:'gauthier_int', nom:'Gauthier',   type:'interne' },
  'charlotte':      { id:'charlotte_int', nom:'Charlotte', type:'interne' },
  'corentin':       { id:'corentin_int', nom:'Corentin',   type:'interne' },
  'mathilde':       { id:'mathilde_int', nom:'Mathilde',   type:'interne' },
};

// ═══════════════════════════════════════════════════════════
// MAPPING SERVICE → POSTE_ID
// ═══════════════════════════════════════════════════════════
const VALID_SERVICES = [
  'CSG 1', 'CSG 2', 'SSR5', 'SSR4', 'SSR3', 'HDJ', 'HDJNP',
  'EOPS', "Ligne d'avis", 'EMG', 'UCC', 'EMCC',
  'CST mémoire', 'HDJ oncoG', 'EHPAD/SLD', 'EHPAD Luçon',
  'Temps non clinique', 'TNC', 'T non clinique',
];

function getPosteId(service, medType) {
  const isTrainee = ['interne','externe','ipa','padhue'].includes(medType);
  const s = service.normalize('NFC').trim();
  if (s === 'CSG 1') return isTrainee ? 'csg1i1' : 'csg1a';
  if (s === 'CSG 2') return isTrainee ? 'csg2i1' : 'csg2a';
  if (s === 'SSR5')  return 'ssr5';
  if (s === 'SSR4')  return 'ssr4';
  if (s === 'SSR3')  return 'ssr3';
  if (s === 'HDJ')   return 'hdj';
  if (s === 'HDJNP') return 'hdjnp';
  if (s.startsWith('EOPS') || s.includes("Ligne d")) return 'eops';
  if (s === 'EMG')   return 'emg';
  if (s === 'UCC')   return 'ucc';
  if (s === 'EMCC')  return 'emcc';
  if (s.startsWith('CST m')) return 'cstmem';
  if (s === 'HDJ oncoG') return 'hdjog';
  if (s === 'EHPAD/SLD') return 'ehpad';
  if (s.includes('Lu')) return 'ehpadl';
  if (s === 'TNC' || s === 'T non clinique' || s.startsWith('Temps non cli')) return 'tnc';
  return null;
}

function isValidService(s) {
  const n = (s || '').normalize('NFC').trim();
  return VALID_SERVICES.some(v => v.normalize('NFC') === n) ||
    n.startsWith('Ligne d') || n.startsWith('EHPAD Lu') || n.startsWith('CST m') ||
    n.startsWith('Temps non cli') || n === 'TNC';
}

// ═══════════════════════════════════════════════════════════
// CONFIG DES FICHIERS CSV (semaines = lundi ISO de chaque semaine)
// ═══════════════════════════════════════════════════════════
const CSV_CONFIG = [
  { file: '/tmp/planning_jan2026.csv',
    weeks: ['2026-01-05','2026-01-12','2026-01-19','2026-01-26'] },
  { file: '/tmp/planning_feb2026.csv',
    weeks: ['2026-02-02','2026-02-09','2026-02-16','2026-02-23'] },
  { file: '/tmp/planning_mar2026.csv',
    weeks: ['2026-03-02','2026-03-09','2026-03-16','2026-03-23','2026-03-30'] },
  { file: '/tmp/planning_apr2026.csv',
    weeks: ['2026-04-06','2026-04-13','2026-04-20','2026-04-27'] },
  { file: '/tmp/planning_may2026.csv',
    weeks: ['2026-05-04','2026-05-11','2026-05-18','2026-05-25'] },
  { file: '/tmp/planning_jun2026.csv',
    weeks: ['2026-06-01','2026-06-08','2026-06-15','2026-06-22'] },
  { file: '/tmp/planning_jul2026.csv',
    weeks: ['2026-06-29','2026-07-06','2026-07-13','2026-07-20','2026-07-27'] },
  { file: '/tmp/planning_aug2026.csv',
    weeks: ['2026-08-03','2026-08-10','2026-08-17','2026-08-24'] },
  { file: '/tmp/planning_sep2026.csv',
    weeks: ['2026-08-31','2026-09-07','2026-09-14','2026-09-21','2026-09-28'] },
  { file: '/tmp/planning_oct2026.csv',
    weeks: ['2026-10-05','2026-10-12','2026-10-19','2026-10-26'] },
];

// ═══════════════════════════════════════════════════════════
// NORMALISATION DE NOM
// ═══════════════════════════════════════════════════════════
function normalizeName(raw) {
  return raw
    .trim()
    .toLowerCase()
    // Prend la 1ère partie avant "/"
    .replace(/\/.*$/g, '')
    // Retire tout ce qui est entre parenthèses : "(ext)", "(1 cs)", "(matin)"...
    .replace(/\s*\(.*?\)\s*/g, '')
    // Retire les suffixes de service ou d'annotation courants
    .replace(/\b(eops|ucc|hdj|ssr|ehpad|csg|cs|ide|ffi|ext\.?)\b.*$/gi, '')
    // Retire "matin", "apm", "1/2", "sauf ..."
    .replace(/\b(matin|apr[eè]s-midi|apm|sauf\s+\S+)\b.*$/gi, '')
    // Retire les "?" et "!"
    .replace(/[?!]+/g, '')
    // Retire "+quelquechose"
    .replace(/\+.*$/g, '')
    // Normalise les espaces
    .replace(/\s+/g, ' ')
    .trim();
}

const SKIP_NAMES = new Set([
  '', '.', 'fermé', 'ferme', 'interne', 'externe', 'ide', 'ffi',
  'ou', 'et', 'a', 'à',
  // Anciens PH supprimés de la liste officielle
  'bertrand', 'melissa', 'mélissa', 'elise', 'élise',
  'flora', 'rakotiniary', 'dr rakotiniary',
  'dr pouliquen', 'pouliquen', 'dr dubrez', 'dubrez',
  // Anciens internes supprimés
  'clemence', 'clémence', 'paul', 'nicolas', 'heloise', 'héloise',
  // Ambiguïtés
  'elise anne c', 'caroline ou clarisse',
]);

function lookupMed(rawName) {
  const n = normalizeName(rawName);
  if (!n || SKIP_NAMES.has(n) || n.length < 2) return null;
  // Correspondance exacte
  if (MED_DICT[n]) return MED_DICT[n];
  // Fallback sur le 1er mot (ex: "caro t21" → "caro")
  const first = n.split(' ')[0];
  if (first !== n && MED_DICT[first]) return MED_DICT[first];
  return null;
}

// Gestion de "Robin/Anne" → deux noms séparés par "/"
function extractNames(cellValue) {
  if (!cellValue) return [];
  return cellValue.split('/').map(s => s.trim()).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════
// PARSING CSV
// col pour semaine n (0-indexed), jour d (0=lun..4=ven) :
//   col = 2 + n * 11 + d * 2
// ═══════════════════════════════════════════════════════════
function parseCsv(filePath, weekKeys, unknown) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = content.split('\n').map(r => r.split(','));

  // { weekKey → { service → Set<medId> } }
  const result = {};
  weekKeys.forEach(w => { result[w] = {}; });

  let currentService = null;
  const STOP_PREFIXES = [
    'nb de ph', 'amiaud', 'blanchet', 'courtois', 'cubille', 'de la basset',
    'decours', 'delorme', 'gendre', 'humeau', 'le gentil', 'leroux',
    'mareau', 'motte', 'perron', 'racine', 'scheer', 'angele', 'dijoux',
    'maureen', 'emilie', 'émilie', 'interim', 'effectif',
    'samira', 'fatima', 'ali hamad', 'nelson',
    'internes', 'externe',
    // anciens PH (toujours présents dans les lignes récap CSV)
    'lidec', 'martin e', 'weyd', 'pouliquen', 'dubrez', 'rakotiniary',
    // anciens internes (toujours présents dans les lignes récap CSV)
    'levaux', 'kamate', 'lafosse', 'laurent heloise',
  ];

  function shouldStop(col0) {
    const l = col0.trim().toLowerCase();
    return STOP_PREFIXES.some(p => l.startsWith(p));
  }

  for (let ri = 2; ri < rows.length; ri++) {   // skip rows 0,1 (header)
    const row = rows[ri];
    const col0 = (row[0] || '').trim();

    if (col0) {
      if (shouldStop(col0)) { currentService = null; continue; }
      currentService = isValidService(col0) ? col0 : null;
    }

    if (!currentService) continue;

    // Collecter les noms pour chaque semaine
    weekKeys.forEach((weekKey, wi) => {
      for (let d = 0; d < 5; d++) {
        const colIdx = 2 + wi * 11 + d * 2;
        const cell = (row[colIdx] || '').trim();
        if (!cell) continue;

        const rawNames = extractNames(cell);
        rawNames.forEach(rawName => {
          const med = lookupMed(rawName);
          if (!med) {
            const n = normalizeName(rawName);
            if (n && n.length > 1 && !SKIP_NAMES.has(n)) unknown.add(n);
            return;
          }
          if (!result[weekKey][currentService]) result[weekKey][currentService] = new Set();
          result[weekKey][currentService].add(med.id);
        });
      }
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// SCHÉMA
// ═══════════════════════════════════════════════════════════
function createSchema(db) {
  db.run(`PRAGMA foreign_keys = OFF`);
  db.run(`DROP TABLE IF EXISTS extras`);
  db.run(`DROP TABLE IF EXISTS exclusions`);
  db.run(`DROP TABLE IF EXISTS affectations`);
  db.run(`DROP TABLE IF EXISTS absences`);
  db.run(`DROP TABLE IF EXISTS medecins`);

  db.run(`
    CREATE TABLE medecins (
      id    TEXT PRIMARY KEY,
      nom   TEXT NOT NULL,
      type  TEXT NOT NULL,
      sched TEXT NOT NULL DEFAULT '1111111111'
    )
  `);
  db.run(`
    CREATE TABLE absences (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      med_id     TEXT NOT NULL,
      date_debut TEXT NOT NULL,
      date_fin   TEXT NOT NULL,
      type_abs   TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE affectations (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      poste_id TEXT NOT NULL,
      med_id   TEXT NOT NULL,
      UNIQUE(week_key, poste_id, med_id)
    )
  `);
  db.run(`
    CREATE TABLE exclusions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      poste_id TEXT NOT NULL,
      med_id   TEXT NOT NULL,
      jour     TEXT NOT NULL,
      UNIQUE(week_key, poste_id, med_id, jour)
    )
  `);
  db.run(`
    CREATE TABLE extras (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      poste_id TEXT NOT NULL,
      med_id   TEXT NOT NULL,
      jour     TEXT NOT NULL,
      UNIQUE(week_key, poste_id, med_id, jour)
    )
  `);
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
async function main() {
  console.log('⏳  Initialisation sql.js...');
  const SQL = await initSqlJs();
  const db  = new SQL.Database();

  console.log('🔨  Création du schéma...');
  createSchema(db);

  // ── Insertion des praticiens (dédupliqués) ─────────────
  console.log('👥  Insertion des praticiens...');
  const inserted = new Set();
  for (const med of Object.values(MED_DICT)) {
    if (inserted.has(med.id)) continue;
    inserted.add(med.id);
    db.run(
      'INSERT OR IGNORE INTO medecins (id,nom,type,sched) VALUES (?,?,?,?)',
      [med.id, med.nom, med.type, '1111111111']
    );
  }
  console.log(`   → ${inserted.size} praticiens insérés`);

  // ── Lecture et insertion des affectations ──────────────
  let totalAff = 0;
  const unknown = new Set();

  for (const cfg of CSV_CONFIG) {
    if (!fs.existsSync(cfg.file)) { console.warn(`   ⚠ Fichier introuvable : ${cfg.file}`); continue; }
    console.log(`📅  Parsing ${path.basename(cfg.file)}...`);

    const parsed = parseCsv(cfg.file, cfg.weeks, unknown);

    for (const [weekKey, services] of Object.entries(parsed)) {
      for (const [service, medIds] of Object.entries(services)) {
        for (const medId of medIds) {
          // Retrouver le type pour mapper le poste
          const medEntry = Object.values(MED_DICT).find(m => m.id === medId);
          if (!medEntry) continue;
          const posteId = getPosteId(service, medEntry.type);
          if (!posteId) continue;

          db.run(
            'INSERT OR IGNORE INTO affectations (week_key,poste_id,med_id) VALUES (?,?,?)',
            [weekKey, posteId, medId]
          );
          totalAff++;
        }
      }
    }
  }

  console.log(`   → ${totalAff} affectations insérées`);

  // ── Sauvegarde ─────────────────────────────────────────
  console.log('💾  Sauvegarde database.sqlite...');
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));

  // ── Résumé ──────────────────────────────────────────────
  console.log('\n✅  Seed terminé !');
  console.log(`   Praticiens : ${inserted.size}`);
  console.log(`   Affectations : ${totalAff}`);

  const byType = {};
  for (const m of Object.values(MED_DICT)) {
    if (!byType[m.type]) byType[m.type] = new Set();
    byType[m.type].add(m.id);
  }
  for (const [type, ids] of Object.entries(byType)) {
    console.log(`     ${type.padEnd(10)} : ${ids.size}`);
  }

  if (unknown.size) {
    console.log(`\n⚠️  Noms non reconnus dans les CSV (${unknown.size}) :`);
    [...unknown].sort().forEach(n => console.log(`     "${n}"`));
  } else {
    console.log('\n✔️  Tous les noms ont été reconnus.');
  }
}

main().catch(err => { console.error('❌', err); process.exit(1); });
