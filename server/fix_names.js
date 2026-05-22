// fix_names.js — Supprime les parenthèses autour des noms de famille
// "Caroline (Leroux)"  →  "Caroline Leroux"
// "Béatrice (IPA)"     →  "Béatrice IPA"
//
// Usage : node fix_names.js

const dbLib = require('./db');

function stripParens(nom) {
  return nom
    .replace(/\s*\(([^)]+)\)/g, ' $1') // (contenu) → contenu
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  await dbLib.init();
  console.log('✓ Base de données chargée.\n');

  const medecins = dbLib.queryAll('SELECT id, nom FROM medecins');
  let updated = 0;

  dbLib.transaction(() => {
    for (const { id, nom } of medecins) {
      const cleaned = stripParens(nom);
      if (cleaned !== nom) {
        dbLib.run('UPDATE medecins SET nom=? WHERE id=?', [cleaned, id]);
        console.log(`  ${nom}  →  ${cleaned}`);
        updated++;
      }
    }
  });

  console.log(`\n${updated} nom(s) mis à jour. Base sauvegardée.`);
}

main().catch(e => { console.error(e); process.exit(1); });
