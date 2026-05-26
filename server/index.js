// index.js — serveur Express + API REST (sql.js async init)
const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const dbLib   = require('./db');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3001'] }));
app.use(express.json());

// ═══════════════════════════════════════════════════════
// CONFIGURATION SECRÉTARIAT
// Modifier le mot de passe dans server/secretary.config.json
// ═══════════════════════════════════════════════════════
let SECRETARY_PASSWORD = '';
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'secretary.config.json'), 'utf8'));
  SECRETARY_PASSWORD = cfg.password || '';
} catch { /* pas de fichier config → toutes les modifications sont libres */ }

// Authentification (pas besoin de la DB, définie avant les guards)
app.post('/api/auth', (req, res) => {
  if (!SECRETARY_PASSWORD) return res.json({ ok: true });
  if (req.body.password === SECRETARY_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: 'Mot de passe incorrect' });
});

// ── Guard : DB initialisée ────────────────────────────
let DB_READY = false;
app.use((req, res, next) => {
  if (!DB_READY) return res.status(503).json({ error: 'Base de données en cours d\'initialisation' });
  next();
});

// ── Guard : secrétariat requis pour toute mutation ────
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();
  if (!SECRETARY_PASSWORD) return next();
  if (req.headers['x-secretary-key'] !== SECRETARY_PASSWORD)
    return res.status(403).json({ error: 'Accès réservé aux secrétaires' });
  next();
});

// ═══════════════════════════════════════════════════════
// MÉDECINS
// ═══════════════════════════════════════════════════════
app.get('/api/medecins', (req, res) => {
  const rows = dbLib.queryAll('SELECT * FROM medecins ORDER BY type, nom');
  res.json(rows.map(r => ({ ...r, sched: r.sched.split('').map(Number) })));
});

app.post('/api/medecins', (req, res) => {
  const { nom, type, sched, service, tel } = req.body;
  if (!nom || !type) return res.status(400).json({ error: 'nom et type requis' });
  const id = 'm_' + Date.now();
  const schedStr = (sched || Array(10).fill(1)).join('');
  const svc   = service || 'geriatrie';
  const phone = tel || '';
  dbLib.run('INSERT INTO medecins (id,nom,type,sched,service,tel) VALUES (?,?,?,?,?,?)', [id, nom, type, schedStr, svc, phone]);
  res.json({ id, nom, type, sched: schedStr.split('').map(Number), service: svc, tel: phone });
});

app.put('/api/medecins/:id', (req, res) => {
  const { nom, type, sched, service, tel } = req.body;
  const { id } = req.params;
  if (nom     !== undefined) dbLib.run('UPDATE medecins SET nom=?     WHERE id=?', [nom, id]);
  if (type    !== undefined) dbLib.run('UPDATE medecins SET type=?    WHERE id=?', [type, id]);
  if (sched   !== undefined) {
    const s = Array.isArray(sched) ? sched.join('') : sched;
    dbLib.run('UPDATE medecins SET sched=? WHERE id=?', [s, id]);
  }
  if (service !== undefined) dbLib.run('UPDATE medecins SET service=? WHERE id=?', [service, id]);
  if (tel     !== undefined) dbLib.run('UPDATE medecins SET tel=?     WHERE id=?', [tel, id]);
  const updated = dbLib.queryOne('SELECT * FROM medecins WHERE id=?', [id]);
  if (!updated) return res.status(404).json({ error: 'Médecin non trouvé' });
  res.json({ ...updated, sched: updated.sched.split('').map(Number) });
});

app.delete('/api/medecins/:id', (req, res) => {
  const { id } = req.params;
  dbLib.run('DELETE FROM absences    WHERE med_id=?', [id]);
  dbLib.run('DELETE FROM affectations WHERE med_id=?', [id]);
  dbLib.run('DELETE FROM exclusions  WHERE med_id=?', [id]);
  dbLib.run('DELETE FROM extras      WHERE med_id=?', [id]);
  dbLib.run('DELETE FROM astreintes  WHERE med_id=?', [id]);
  dbLib.run('DELETE FROM medecins    WHERE id=?', [id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// ABSENCES
// ═══════════════════════════════════════════════════════
app.get('/api/absences', (req, res) => {
  const rows = dbLib.queryAll(`
    SELECT a.id, a.med_id, a.date_debut, a.date_fin, a.type_abs, m.nom as med_nom
    FROM absences a JOIN medecins m ON a.med_id=m.id
    ORDER BY a.date_debut DESC
  `);
  res.json(rows);
});

app.post('/api/absences', (req, res) => {
  const { med_id, date_debut, date_fin, type_abs } = req.body;
  if (!med_id || !date_debut || !date_fin || !type_abs)
    return res.status(400).json({ error: 'Champs manquants' });
  if (date_fin < date_debut) return res.status(400).json({ error: 'date_fin < date_debut' });
  const result = dbLib.run(
    'INSERT INTO absences (med_id,date_debut,date_fin,type_abs) VALUES (?,?,?,?)',
    [med_id, date_debut, date_fin, type_abs]
  );
  res.json({ id: result.lastInsertRowid, med_id, date_debut, date_fin, type_abs });
});

app.delete('/api/absences/:id', (req, res) => {
  dbLib.run('DELETE FROM absences WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// PLANNING SEMAINE
// ═══════════════════════════════════════════════════════
app.get('/api/planning/:weekKey', (req, res) => {
  const { weekKey } = req.params;

  const affRows = dbLib.queryAll(`
    SELECT a.poste_id, a.med_id, m.nom, m.type, m.sched
    FROM affectations a JOIN medecins m ON a.med_id=m.id
    WHERE a.week_key=?
  `, [weekKey]);

  const exclusions = dbLib.queryAll(
    'SELECT poste_id, med_id, jour FROM exclusions WHERE week_key=?', [weekKey]
  );

  const extraRows = dbLib.queryAll(`
    SELECT e.poste_id, e.med_id, e.jour, m.nom, m.type
    FROM extras e JOIN medecins m ON e.med_id=m.id
    WHERE e.week_key=?
  `, [weekKey]);

  const weekEnd = addDaysStr(weekKey, 4);
  const absences = dbLib.queryAll(`
    SELECT a.med_id, a.date_debut, a.date_fin, a.type_abs
    FROM absences a WHERE a.date_debut<=? AND a.date_fin>=?
  `, [weekEnd, weekKey]);

  const byPoste = {};
  affRows.forEach(a => {
    if (!byPoste[a.poste_id]) byPoste[a.poste_id] = { medecins: [] };
    byPoste[a.poste_id].medecins.push({
      id: a.med_id, nom: a.nom, type: a.type,
      sched: a.sched.split('').map(Number)
    });
  });

  res.json({ affectations: byPoste, exclusions, extras: extraRows, absences });
});

// ═══════════════════════════════════════════════════════
// AFFECTATIONS
// ═══════════════════════════════════════════════════════
app.post('/api/affectations', (req, res) => {
  const { week_key, poste_id, med_id } = req.body;
  if (!week_key || !poste_id || !med_id) return res.status(400).json({ error: 'Champs manquants' });
  try {
    dbLib.run(
      'INSERT OR IGNORE INTO affectations (week_key,poste_id,med_id) VALUES (?,?,?)',
      [week_key, poste_id, med_id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/affectations', (req, res) => {
  const { week_key, poste_id, med_id } = req.body;
  dbLib.run('DELETE FROM affectations WHERE week_key=? AND poste_id=? AND med_id=?', [week_key, poste_id, med_id]);
  dbLib.run('DELETE FROM exclusions   WHERE week_key=? AND poste_id=? AND med_id=?', [week_key, poste_id, med_id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// EXCLUSIONS
// ═══════════════════════════════════════════════════════
app.post('/api/exclusions', (req, res) => {
  const { week_key, poste_id, med_id, jour } = req.body;
  dbLib.run('INSERT OR IGNORE INTO exclusions (week_key,poste_id,med_id,jour) VALUES (?,?,?,?)',
    [week_key, poste_id, med_id, jour]);
  res.json({ ok: true });
});

app.delete('/api/exclusions', (req, res) => {
  const { week_key, poste_id, med_id, jour } = req.body;
  dbLib.run('DELETE FROM exclusions WHERE week_key=? AND poste_id=? AND med_id=? AND jour=?',
    [week_key, poste_id, med_id, jour]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// EXTRAS
// ═══════════════════════════════════════════════════════
app.post('/api/extras', (req, res) => {
  const { week_key, poste_id, med_id, jour } = req.body;
  dbLib.run('INSERT OR IGNORE INTO extras (week_key,poste_id,med_id,jour) VALUES (?,?,?,?)',
    [week_key, poste_id, med_id, jour]);
  res.json({ ok: true });
});

app.delete('/api/extras', (req, res) => {
  const { week_key, poste_id, med_id, jour } = req.body;
  dbLib.run('DELETE FROM extras WHERE week_key=? AND poste_id=? AND med_id=? AND jour=?',
    [week_key, poste_id, med_id, jour]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// COPIE SEMAINE
// ═══════════════════════════════════════════════════════
app.post('/api/planning/copy', (req, res) => {
  const { from_week, to_week } = req.body;
  if (!from_week || !to_week) return res.status(400).json({ error: 'from_week et to_week requis' });
  dbLib.transaction(() => {
    dbLib.run('DELETE FROM affectations WHERE week_key=?', [to_week]);
    dbLib.run('DELETE FROM exclusions   WHERE week_key=?', [to_week]);
    dbLib.run('DELETE FROM extras       WHERE week_key=?', [to_week]);
    const affs = dbLib.queryAll('SELECT poste_id, med_id FROM affectations WHERE week_key=?', [from_week]);
    affs.forEach(r => dbLib.run('INSERT OR IGNORE INTO affectations (week_key,poste_id,med_id) VALUES (?,?,?)',
      [to_week, r.poste_id, r.med_id]));
    const excls = dbLib.queryAll('SELECT poste_id, med_id, jour FROM exclusions WHERE week_key=?', [from_week]);
    excls.forEach(r => dbLib.run('INSERT OR IGNORE INTO exclusions (week_key,poste_id,med_id,jour) VALUES (?,?,?,?)',
      [to_week, r.poste_id, r.med_id, r.jour]));
    const exts = dbLib.queryAll('SELECT poste_id, med_id, jour FROM extras WHERE week_key=?', [from_week]);
    exts.forEach(r => dbLib.run('INSERT OR IGNORE INTO extras (week_key,poste_id,med_id,jour) VALUES (?,?,?,?)',
      [to_week, r.poste_id, r.med_id, r.jour]));
  });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// ASTREINTES
// ═══════════════════════════════════════════════════════
app.get('/api/astreintes', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month requis (YYYY-MM)' });
  const rows = dbLib.queryAll(`
    SELECT a.id, a.date_iso, a.type_ast, a.med_id, m.nom as med_nom, m.tel as med_tel
    FROM astreintes a JOIN medecins m ON a.med_id = m.id
    WHERE a.date_iso LIKE ?
    ORDER BY a.date_iso, a.type_ast
  `, [month + '-%']);
  res.json(rows);
});

app.post('/api/astreintes', (req, res) => {
  const { date_iso, type_ast, med_id } = req.body;
  if (!date_iso || !type_ast || !med_id)
    return res.status(400).json({ error: 'date_iso, type_ast, med_id requis' });
  try {
    dbLib.run('DELETE FROM astreintes WHERE date_iso=? AND type_ast=?', [date_iso, type_ast]);
    const result = dbLib.run(
      'INSERT INTO astreintes (date_iso,type_ast,med_id) VALUES (?,?,?)',
      [date_iso, type_ast, med_id]
    );
    const row = dbLib.queryOne(`
      SELECT a.id, a.date_iso, a.type_ast, a.med_id, m.nom as med_nom, m.tel as med_tel
      FROM astreintes a JOIN medecins m ON a.med_id=m.id WHERE a.id=?
    `, [result.lastInsertRowid]);
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/astreintes/:id', (req, res) => {
  dbLib.run('DELETE FROM astreintes WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// STATISTIQUES PAR MÉDECIN
// ═══════════════════════════════════════════════════════
app.get('/api/stats/medecin/:medId', (req, res) => {
  const { medId } = req.params;
  const year    = new Date().getFullYear();
  const fromKey = `${year}-01-01`;
  const toKey   = `${year}-12-31`;

  const affectations = dbLib.queryAll(`
    SELECT poste_id, COUNT(DISTINCT week_key) AS semaines
    FROM affectations
    WHERE med_id = ? AND week_key >= ? AND week_key <= ?
    GROUP BY poste_id
    ORDER BY semaines DESC
  `, [medId, fromKey, toKey]);

  const absences = dbLib.queryAll(`
    SELECT date_debut, date_fin, type_abs
    FROM absences
    WHERE med_id = ? AND date_fin >= ? AND date_debut <= ?
    ORDER BY date_debut
  `, [medId, fromKey, toKey]);

  res.json({ affectations, absences });
});

app.get('/api/stats/all', (req, res) => {
  const year    = new Date().getFullYear();
  const fromKey = `${year}-01-01`;
  const toKey   = `${year}-12-31`;

  const medecins = dbLib.queryAll('SELECT id FROM medecins ORDER BY id');
  const result = medecins.map(({ id }) => {
    const affectations = dbLib.queryAll(`
      SELECT poste_id, COUNT(DISTINCT week_key) AS semaines
      FROM affectations
      WHERE med_id = ? AND week_key >= ? AND week_key <= ?
      GROUP BY poste_id
      ORDER BY semaines DESC
    `, [id, fromKey, toKey]);

    const absences = dbLib.queryAll(`
      SELECT date_debut, date_fin, type_abs
      FROM absences
      WHERE med_id = ? AND date_fin >= ? AND date_debut <= ?
      ORDER BY date_debut
    `, [id, fromKey, toKey]);

    return { med_id: id, affectations, absences };
  });

  res.json(result);
});

// ═══════════════════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════════════════
function addDaysStr(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════
// DÉMARRAGE
// ═══════════════════════════════════════════════════════
dbLib.init().then(() => {
  DB_READY = true;
  const pwdStatus = SECRETARY_PASSWORD ? '(mot de passe secrétariat configuré)' : '(ATTENTION : aucun mot de passe, accès libre)';
  app.listen(PORT, () => {
    console.log(`\n✓ Serveur planning gériatrie → http://localhost:${PORT}`);
    console.log(`  API → http://localhost:${PORT}/api`);
    console.log(`  Secrétariat ${pwdStatus}\n`);
  });
}).catch(err => {
  console.error('Erreur init DB :', err);
  process.exit(1);
});
