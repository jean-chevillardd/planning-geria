#!/usr/bin/env node
// import_absences.js — Importe les absences depuis /tmp/absences_data.json
// Ne touche PAS aux affectations / médecins existants
// Usage : node import_absences.js

const initSqlJs = require('sql.js');
const fs  = require('fs');
const path = require('path');

const DB_PATH   = path.join(__dirname, 'database.sqlite');
const JSON_PATH = '/tmp/absences_data.json';

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`❌ Fichier introuvable : ${JSON_PATH}`);
    process.exit(1);
  }

  const absences = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log(`📂  ${absences.length} absences à importer depuis ${JSON_PATH}`);

  // ── Charger la BDD existante ─────────────────────────────
  console.log('⏳  Chargement database.sqlite…');
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db  = new SQL.Database(new Uint8Array(buf));

  // ── Vider les absences existantes (remplacement complet) ─
  console.log('🗑   Suppression des absences existantes…');
  db.run('DELETE FROM absences');

  // ── Vérifier les med_id présents dans la BDD ─────────────
  const rows = db.exec('SELECT id FROM medecins');
  const knownIds = new Set(rows[0]?.values.flat() || []);

  // ── Insérer les nouvelles absences ────────────────────────
  let inserted = 0, skipped = 0;
  const byType = {};

  for (const a of absences) {
    if (!knownIds.has(a.med_key)) {
      console.warn(`   ⚠ med_key inconnu : "${a.med_key}" — ignoré`);
      skipped++;
      continue;
    }
    db.run(
      'INSERT INTO absences (med_id, date_debut, date_fin, type_abs) VALUES (?,?,?,?)',
      [a.med_key, a.date_debut, a.date_fin, a.type_abs]
    );
    inserted++;
    byType[a.type_abs] = (byType[a.type_abs] || 0) + 1;
  }

  // ── Sauvegarde ───────────────────────────────────────────
  console.log('💾  Sauvegarde database.sqlite…');
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));

  // ── Résumé ───────────────────────────────────────────────
  console.log('\n✅  Import terminé !');
  console.log(`   Insérées : ${inserted}`);
  if (skipped) console.log(`   Ignorées : ${skipped} (med_key inconnu)`);
  console.log('   Répartition par type :');
  Object.entries(byType).sort((a,b) => b[1]-a[1])
    .forEach(([t, n]) => console.log(`     ${t.padEnd(35)} : ${n}`));
}

main().catch(err => { console.error('❌', err); process.exit(1); });
