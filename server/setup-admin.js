// setup-admin.js — crée ou met à jour un compte gestionnaire
// Usage : node setup-admin.js <email> <mot_de_passe> [nom]
// Exemple : node setup-admin.js marie@chd-vendee.fr MonMotDePasse "Marie Dupont"

const bcrypt   = require('bcryptjs');
const Database = require('better-sqlite3');
const path     = require('path');
const { applySchema } = require('./db_schema');

const [,, email, password, nom = ''] = process.argv;

if (!email || !password) {
  console.error('Usage : node setup-admin.js <email> <mot_de_passe> [nom]');
  process.exit(1);
}

(async () => {
  const db   = new Database(path.join(__dirname, 'database.sqlite'));
  applySchema(db);

  const hash = await bcrypt.hash(password, 12);
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim());

  if (existing) {
    db.prepare('UPDATE users SET password_hash=?, nom=? WHERE email=?')
      .run(hash, nom, email.toLowerCase().trim());
    console.log(`✓ Compte gestionnaire mis à jour : ${email}`);
  } else {
    db.prepare('INSERT INTO users (email, password_hash, nom) VALUES (?,?,?)')
      .run(email.toLowerCase().trim(), hash, nom);
    console.log(`✓ Compte gestionnaire créé : ${email}`);
  }

  db.close();
})();
