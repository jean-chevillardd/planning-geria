// clear_holidays.js — Nettoie les affectations sur les jours fériés
//
// Ce script NE supprime PAS les affectations de la semaine entière.
// Il crée des EXCLUSIONS pour chaque jour férié concerné (table `exclusions`)
// et supprime les EXTRAS qui tombent un jour férié (table `extras`).
//
// Usage : node clear_holidays.js

const dbLib = require('./db');

// ── Calcul des jours fériés français ──────────────────────────────────────────

function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getFrenchHolidays(year) {
  const add = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const easter = easterSunday(year);
  return new Set([
    fmt(new Date(year, 0,  1)),   // Jour de l'An
    fmt(add(easter, 1)),           // Lundi de Pâques
    fmt(new Date(year, 4,  1)),   // Fête du Travail
    fmt(new Date(year, 4,  8)),   // Victoire 1945
    fmt(add(easter, 39)),          // Ascension
    fmt(add(easter, 50)),          // Lundi de Pentecôte
    fmt(new Date(year, 6, 14)),   // Fête Nationale
    fmt(new Date(year, 7, 15)),   // Assomption
    fmt(new Date(year, 10,  1)),  // Toussaint
    fmt(new Date(year, 10, 11)),  // Armistice
    fmt(new Date(year, 11, 25)),  // Noël
  ]);
}

const _holCache = {};
function isHoliday(isoDate) {
  const year = parseInt(isoDate.slice(0, 4), 10);
  if (!_holCache[year]) _holCache[year] = getFrenchHolidays(year);
  return _holCache[year].has(isoDate);
}

// ── Helpers date ──────────────────────────────────────────────────────────────

/** Retourne les 5 jours ouvrés (lun–ven) d'une semaine à partir du lundi ISO */
function weekDays(weekKey) {
  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekKey + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const y  = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${mo}-${da}`);
  }
  return days;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await dbLib.init();
  console.log('✓ Base de données chargée.\n');

  const affectations    = dbLib.queryAll('SELECT week_key, poste_id, med_id FROM affectations');
  const extras          = dbLib.queryAll('SELECT id, jour FROM extras');
  const extraHolidayIds = extras.filter(e => isHoliday(e.jour)).map(e => e.id);

  console.log(`Affectations à analyser : ${affectations.length}`);
  console.log(`Extras à analyser       : ${extras.length}`);
  console.log(`Extras sur fériés       : ${extraHolidayIds.length}\n`);

  // Compter avant
  const beforeExcl = dbLib.queryOne('SELECT COUNT(*) as n FROM exclusions').n;
  const beforeExt  = dbLib.queryOne('SELECT COUNT(*) as n FROM extras').n;

  dbLib.transaction(() => {
    // 1) Pour chaque affectation, insérer une exclusion par jour férié de la semaine
    for (const { week_key, poste_id, med_id } of affectations) {
      const days = weekDays(week_key);
      for (const jour of days) {
        if (isHoliday(jour)) {
          dbLib.run(
            'INSERT OR IGNORE INTO exclusions (week_key, poste_id, med_id, jour) VALUES (?,?,?,?)',
            [week_key, poste_id, med_id, jour]
          );
        }
      }
    }

    // 2) Supprimer les extras sur jours fériés
    if (extraHolidayIds.length > 0) {
      const placeholders = extraHolidayIds.map(() => '?').join(',');
      dbLib.run(`DELETE FROM extras WHERE id IN (${placeholders})`, extraHolidayIds);
    }
  });

  // Compter après
  const afterExcl = dbLib.queryOne('SELECT COUNT(*) as n FROM exclusions').n;
  const afterExt  = dbLib.queryOne('SELECT COUNT(*) as n FROM extras').n;

  console.log('Résultat :');
  console.log(`  Exclusions ajoutées  : ${afterExcl - beforeExcl}`);
  console.log(`  Extras supprimés     : ${beforeExt - afterExt}`);
  console.log('\nTerminé. La base de données a été sauvegardée.');
}

main().catch(e => { console.error(e); process.exit(1); });
