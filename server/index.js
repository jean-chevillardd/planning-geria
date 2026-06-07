// index.js — serveur Express + API REST
const express   = require('express');
const cors      = require('cors');
const fs        = require('fs');
const path      = require('path');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const {
  validate,
  medecinsCreateSchema, medecinsUpdateSchema,
  absencesCreateSchema,
  affectationSchema, affectationMoveSchema,
  exclusionExtraSchema, extrasBulkDeleteSchema, renfortSchema,
  astreintesCreateSchema, planningCopySchema, teamCodeUpdateSchema,
  changePasswordSchema, createGestionnaireSchema, updateGestionnaireSchema, auditLogQuerySchema, extendTokenSchema,
  isoDate: zodIsoDate, month: zodMonth,
} = require('./validation');

// ── Nodemailer (optionnel) ─────────────────────────────
let nodemailer;
try { nodemailer = require('nodemailer'); } catch(e) { console.warn('nodemailer non disponible'); }

const EMAIL_CFG_PATH = path.join(__dirname, 'email.config.json');
let emailConfig = null;
try { emailConfig = JSON.parse(fs.readFileSync(EMAIL_CFG_PATH, 'utf8')); } catch(_) {}

const PORT = process.env.PORT || 3001;

// ═══════════════════════════════════════════════════════
// VALIDATION (constantes partagées)
// ═══════════════════════════════════════════════════════
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE    = /^\d{4}-\d{2}$/;
const MED_TYPES   = new Set(['ph', 'ipa', 'interne', 'externe', 'padhue']);
const ABS_TYPES   = new Set([
  'Congé annuel (CA)', 'Congé maladie', 'Congé maternité',
  'RTT', 'Récupération de garde', 'Formation', 'Activité hors site',
]);
const AST_TYPES   = new Set(['astreinte', 'pont_rouge', 'csg1']);

function isIsoDate(s) { return typeof s === 'string' && ISO_DATE_RE.test(s); }
function isMonth(s)   { return typeof s === 'string' && MONTH_RE.test(s); }

function addDaysStr(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}


// ═══════════════════════════════════════════════════════
// FACTORY — crée et configure l'app Express
// ═══════════════════════════════════════════════════════
function createApp(dbLib) {
  const app = express();
  app.set('trust proxy', 1);

  const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
  if (!process.env.JWT_SECRET) console.warn('⚠ JWT_SECRET non défini — sessions invalidées à chaque redémarrage');
  let DB_READY = false;

  app._setDbReady = () => { DB_READY = true; };

  const checkMedExists = (med_id) =>
    !!dbLib.queryOne('SELECT 1 FROM medecins WHERE id=? AND actif=1', [med_id]);

  function logAudit(userId, action, tableName, recordId, payloadBefore, payloadAfter) {
    try {
      dbLib.run(
        `INSERT INTO audit_log (user_id, action, table_name, record_id, payload_before, payload_after)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId != null ? String(userId) : null,
          action,
          tableName,
          recordId != null ? String(recordId) : null,
          payloadBefore != null ? JSON.stringify(payloadBefore) : null,
          payloadAfter  != null ? JSON.stringify(payloadAfter)  : null,
        ]
      );
    } catch(_) { /* audit ne doit jamais faire échouer la requête principale */ }
  }

  app.use(helmet());
  const corsOrigins = process.env.NODE_ENV === 'production'
    ? true
    : ['http://localhost:5173', 'http://localhost:3001'];
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json());

  // ── Rate limiting (anti brute-force sur /api/auth) ──
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Trop de tentatives, réessayez dans 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // ── Auth médecin : code équipe partagé ──────────────
  app.post('/api/auth/team', authLimiter, (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code manquant' });
    const row = dbLib.queryOne("SELECT value FROM settings WHERE key='team_code'");
    if (!row) return res.status(500).json({ error: 'Code équipe non configuré' });
    if (code !== row.value) return res.status(401).json({ error: 'Code équipe incorrect' });
    const token = jwt.sign({ role: 'medecin' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token });
  });

  // ── Auth gestionnaire : email + mot de passe ────────
  app.post('/api/auth/gestionnaire', authLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    const user = dbLib.queryOne('SELECT * FROM users WHERE email=?', [email.toLowerCase().trim()]);
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = jwt.sign({ role: 'gestionnaire', userId: user.id, nom: user.nom }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ ok: true, token, nom: user.nom });
  });

  // ── Guard : DB initialisée ──────────────────────────
  app.use((req, res, next) => {
    if (!DB_READY) return res.status(503).json({ error: 'Base de données en cours d\'initialisation' });
    next();
  });

  // ═══════════════════════════════════════════════════════
  // CONGÉS SELF-SERVICE — routes publiques (pas de JWT)
  // ═══════════════════════════════════════════════════════

  app.get('/api/conge/token/:token', (req, res) => {
    const { token } = req.params;
    if (!token || token.length > 128) return res.status(400).json({ error: 'Token invalide' });
    const now = new Date().toISOString();
    const row = dbLib.queryOne('SELECT * FROM conge_tokens WHERE token=?', [token]);
    if (!row) return res.status(404).json({ error: 'Lien invalide ou expiré' });
    if (row.used_at) return res.status(410).json({ error: 'Ce lien a déjà été utilisé' });
    if (row.expires_at < now) return res.status(410).json({ error: 'Ce lien a expiré (72h)' });
    const med = dbLib.queryOne('SELECT id, nom, type FROM medecins WHERE id=?', [row.med_id]);
    if (!med) return res.status(404).json({ error: 'Praticien introuvable' });
    res.json({ valid: true, med_id: med.id, nom: med.nom, type: med.type });
  });

  app.post('/api/conge/submit', (req, res) => {
    const { token, absences } = req.body;
    if (!token) return res.status(400).json({ error: 'Token manquant' });
    const now = new Date().toISOString();
    const row = dbLib.queryOne('SELECT * FROM conge_tokens WHERE token=?', [token]);
    if (!row) return res.status(404).json({ error: 'Lien invalide' });
    if (row.used_at) return res.status(410).json({ error: 'Ce lien a déjà été utilisé' });
    if (row.expires_at < now) return res.status(410).json({ error: 'Ce lien a expiré' });
    if (!Array.isArray(absences) || absences.length === 0)
      return res.status(400).json({ error: 'Aucune absence fournie' });
    if (absences.length > 20)
      return res.status(400).json({ error: 'Trop d\'absences (max 20)' });
    for (const abs of absences) {
      const { date_debut, date_fin, type_abs } = abs;
      if (!isIsoDate(date_debut) || !isIsoDate(date_fin))
        return res.status(400).json({ error: 'Date invalide' });
      if (!ABS_TYPES.has(type_abs))
        return res.status(400).json({ error: 'Type d\'absence invalide' });
      if (date_fin < date_debut)
        return res.status(400).json({ error: 'date_fin antérieure à date_debut' });
    }
    let count = 0;
    dbLib.transaction(() => {
      for (const abs of absences) {
        dbLib.run(
          'INSERT INTO absences (med_id,date_debut,date_fin,type_abs) VALUES (?,?,?,?)',
          [row.med_id, abs.date_debut, abs.date_fin, abs.type_abs]
        );
        count++;
      }
      dbLib.run('UPDATE conge_tokens SET used_at=? WHERE token=?', [now, token]);
    });
    res.json({ ok: true, count });
  });

  // ── Middlewares auth ────────────────────────────────
  function requireAuth(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentification requise' });
    try {
      req.authUser = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
    }
  }

  function requireGestionnaire(req, res, next) {
    requireAuth(req, res, () => {
      if (req.authUser.role !== 'gestionnaire')
        return res.status(403).json({ error: 'Accès réservé aux gestionnaires' });
      next();
    });
  }

  app._makeToken = (role = 'gestionnaire', userId = null) =>
    jwt.sign(userId ? { role, userId } : { role }, JWT_SECRET, { expiresIn: '1h' });

  // Guard global : toutes les mutations exigent le rôle gestionnaire
  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    requireGestionnaire(req, res, next);
  });

  // ═══════════════════════════════════════════════════════
  // MÉDECINS
  // ═══════════════════════════════════════════════════════
  app.get('/api/medecins', (req, res) => {
    const rows = dbLib.queryAll('SELECT * FROM medecins WHERE actif=1 ORDER BY type, nom');
    res.json(rows.map(r => ({ ...r, sched: r.sched.split('').map(Number) })));
  });

  app.get('/api/medecins/archives', (req, res) => {
    const rows = dbLib.queryAll('SELECT * FROM medecins WHERE actif=0 ORDER BY type, nom');
    res.json(rows.map(r => ({ ...r, sched: r.sched.split('').map(Number) })));
  });

  const SCHED_RE = /^[01]{10}$/;

  app.post('/api/medecins', (req, res) => {
    const v = validate(medecinsCreateSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { nom, type, sched, service, tel, email } = v.data;
    const id = 'm_' + Date.now();
    const schedStr = (sched || Array(10).fill(1)).join('');
    const svc   = service || 'geriatrie';
    const phone = tel || '';
    const mail  = email || null;
    dbLib.run('INSERT INTO medecins (id,nom,type,sched,service,tel,email) VALUES (?,?,?,?,?,?,?)', [id, nom, type, schedStr, svc, phone, mail]);
    logAudit('CREATE', 'medecins', id, null, { id, nom, type });
    res.json({ id, nom, type, sched: schedStr.split('').map(Number), service: svc, tel: phone, email: mail });
  });

  app.put('/api/medecins/:id', (req, res) => {
    const v = validate(medecinsUpdateSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { nom, type, sched, service, tel, email } = v.data;
    const { id } = req.params;
    const sets = [];
    const vals = [];
    if (nom     !== undefined) { sets.push('nom=?');     vals.push(nom); }
    if (type    !== undefined) { sets.push('type=?');    vals.push(type); }
    if (sched   !== undefined) {
      const s = Array.isArray(sched) ? sched.join('') : sched;
      sets.push('sched=?'); vals.push(s);
    }
    if (service !== undefined) { sets.push('service=?'); vals.push(service); }
    if (tel     !== undefined) { sets.push('tel=?');     vals.push(tel); }
    if (email   !== undefined) { sets.push('email=?');   vals.push(email || null); }
    if (sets.length > 0) {
      vals.push(id);
      dbLib.transaction(() => {
        dbLib.run(`UPDATE medecins SET ${sets.join(', ')} WHERE id=?`, vals);
      });
    }
    const updated = dbLib.queryOne('SELECT * FROM medecins WHERE id=?', [id]);
    if (!updated) return res.status(404).json({ error: 'Médecin non trouvé' });
    res.json({ ...updated, sched: updated.sched.split('').map(Number) });
  });

  app.patch('/api/medecins/:id/archiver', (req, res) => {
    const { id } = req.params;
    const med = dbLib.queryOne('SELECT id, nom, type FROM medecins WHERE id=?', [id]);
    if (!med) return res.status(404).json({ error: 'Médecin non trouvé' });
    dbLib.run('UPDATE medecins SET actif=0 WHERE id=?', [id]);
    logAudit('DELETE', 'medecins', id, med, null);
    res.json({ ok: true });
  });

  app.patch('/api/medecins/:id/desarchiver', (req, res) => {
    const { id } = req.params;
    const med = dbLib.queryOne('SELECT id, nom, type FROM medecins WHERE id=?', [id]);
    if (!med) return res.status(404).json({ error: 'Médecin non trouvé' });
    dbLib.run('UPDATE medecins SET actif=1 WHERE id=?', [id]);
    logAudit('UPDATE', 'medecins', id, { actif: 0 }, { actif: 1 });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // ABSENCES
  // ═══════════════════════════════════════════════════════
  app.get('/api/absences', (req, res) => {
    const year = new Date().getFullYear();
    const from = `${year - 1}-01-01`;
    const to   = `${year + 1}-12-31`;
    const rows = dbLib.queryAll(`
      SELECT a.id, a.med_id, a.date_debut, a.date_fin, a.type_abs, a.demi_journee, m.nom as med_nom
      FROM absences a JOIN medecins m ON a.med_id=m.id
      WHERE a.date_fin >= ? AND a.date_debut <= ?
      ORDER BY a.date_debut DESC
    `, [from, to]);
    res.json(rows);
  });

  app.post('/api/absences', (req, res) => {
    const v = validate(absencesCreateSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { med_id, date_debut, date_fin, type_abs, demi_journee } = v.data;
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    if (date_fin < date_debut) return res.status(400).json({ error: 'date_fin < date_debut' });
    const dj = demi_journee || null;
    const result = dbLib.run(
      'INSERT INTO absences (med_id,date_debut,date_fin,type_abs,demi_journee) VALUES (?,?,?,?,?)',
      [med_id, date_debut, date_fin, type_abs, dj]
    );
    logAudit('CREATE', 'absences', result.lastInsertRowid, null, { med_id, date_debut, date_fin, type_abs });
    res.json({ id: result.lastInsertRowid, med_id, date_debut, date_fin, type_abs, demi_journee: dj });
  });

  app.delete('/api/absences/:id', (req, res) => {
    const before = dbLib.queryOne('SELECT * FROM absences WHERE id=?', [req.params.id]);
    dbLib.run('DELETE FROM absences WHERE id=?', [req.params.id]);
    if (before) logAudit('DELETE', 'absences', req.params.id, before, null);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // PLANNING SEMAINE
  // ═══════════════════════════════════════════════════════
  app.get('/api/planning/:weekKey', (req, res) => {
    const { weekKey } = req.params;
    if (!isIsoDate(weekKey))
      return res.status(400).json({ error: 'weekKey invalide (YYYY-MM-DD attendu)' });

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

    const renfortRows = dbLib.queryAll(`
      SELECT r.poste_id, r.med_id, r.jour, m.nom, m.type
      FROM renforts r JOIN medecins m ON r.med_id=m.id
      WHERE r.week_key=?
    `, [weekKey]);

    const byPoste = {};
    affRows.forEach(a => {
      if (!byPoste[a.poste_id]) byPoste[a.poste_id] = { medecins: [] };
      byPoste[a.poste_id].medecins.push({
        id: a.med_id, nom: a.nom, type: a.type,
        sched: a.sched.split('').map(Number)
      });
    });

    res.json({ affectations: byPoste, exclusions, extras: extraRows, renforts: renfortRows, absences });
  });

  // ═══════════════════════════════════════════════════════
  // AFFECTATIONS
  // ═══════════════════════════════════════════════════════
  app.post('/api/affectations', (req, res) => {
    const v = validate(affectationSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { week_key, poste_id, med_id } = v.data;
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    const existing = dbLib.queryOne(
      'SELECT poste_id FROM affectations WHERE week_key=? AND med_id=?',
      [week_key, med_id]
    );
    if (existing && existing.poste_id !== poste_id) {
      return res.status(409).json({ error: 'Médecin déjà affecté à un autre poste cette semaine' });
    }
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
    if (!zodIsoDate.safeParse(week_key).success) return res.status(400).json({ error: 'week_key invalide' });
    dbLib.run('DELETE FROM affectations WHERE week_key=? AND poste_id=? AND med_id=?', [week_key, poste_id, med_id]);
    dbLib.run('DELETE FROM exclusions   WHERE week_key=? AND poste_id=? AND med_id=?', [week_key, poste_id, med_id]);
    res.json({ ok: true });
  });

  app.post('/api/affectations/move', (req, res) => {
    const v = validate(affectationMoveSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { week_key, source_poste_id, target_poste_id, med_id } = v.data;
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    dbLib.transaction(() => {
      dbLib.run('DELETE FROM affectations WHERE week_key=? AND poste_id=? AND med_id=?',
        [week_key, source_poste_id, med_id]);
      dbLib.run('INSERT OR IGNORE INTO affectations (week_key,poste_id,med_id) VALUES (?,?,?)',
        [week_key, target_poste_id, med_id]);
    });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // EXCLUSIONS
  // ═══════════════════════════════════════════════════════
  app.post('/api/exclusions', (req, res) => {
    const v = validate(exclusionExtraSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { week_key, poste_id, med_id, jour } = v.data;
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    dbLib.run('INSERT OR IGNORE INTO exclusions (week_key,poste_id,med_id,jour) VALUES (?,?,?,?)',
      [week_key, poste_id, med_id, jour]);
    res.json({ ok: true });
  });

  app.delete('/api/exclusions', (req, res) => {
    const v = validate(exclusionExtraSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { week_key, poste_id, med_id, jour } = v.data;
    dbLib.run('DELETE FROM exclusions WHERE week_key=? AND poste_id=? AND med_id=? AND jour=?',
      [week_key, poste_id, med_id, jour]);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // EXTRAS
  // ═══════════════════════════════════════════════════════
  app.post('/api/extras', (req, res) => {
    const v = validate(exclusionExtraSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { week_key, poste_id, med_id, jour } = v.data;
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    dbLib.run('INSERT OR IGNORE INTO extras (week_key,poste_id,med_id,jour) VALUES (?,?,?,?)',
      [week_key, poste_id, med_id, jour]);
    res.json({ ok: true });
  });

  app.delete('/api/extras', (req, res) => {
    const v = validate(exclusionExtraSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { week_key, poste_id, med_id, jour } = v.data;
    dbLib.run('DELETE FROM extras WHERE week_key=? AND poste_id=? AND med_id=? AND jour=?',
      [week_key, poste_id, med_id, jour]);
    res.json({ ok: true });
  });

  // Supprime tous les extras d'un médecin dans un poste pour toute la semaine (nettoyage doublon)
  app.delete('/api/extras/poste', (req, res) => {
    const v = validate(extrasBulkDeleteSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { week_key, poste_id, med_id } = v.data;
    dbLib.run('DELETE FROM extras WHERE week_key=? AND poste_id=? AND med_id=?',
      [week_key, poste_id, med_id]);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // RENFORTS
  // ═══════════════════════════════════════════════════════
  app.post('/api/renforts', (req, res) => {
    const v = validate(renfortSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { week_key, poste_id, med_id, jour } = v.data;
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    dbLib.run('INSERT OR IGNORE INTO renforts (week_key,poste_id,med_id,jour) VALUES (?,?,?,?)',
      [week_key, poste_id, med_id, jour]);
    res.json({ ok: true });
  });

  app.delete('/api/renforts', (req, res) => {
    const v = validate(renfortSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { week_key, poste_id, med_id, jour } = v.data;
    dbLib.run('DELETE FROM renforts WHERE week_key=? AND poste_id=? AND med_id=? AND jour=?',
      [week_key, poste_id, med_id, jour]);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // CAMPAGNE CONGÉS (secrétariat)
  // ═══════════════════════════════════════════════════════

  app.post('/api/conge/campaign', async (req, res) => {
    const { types, base_url } = req.body;
    if (!Array.isArray(types) || types.length === 0)
      return res.status(400).json({ error: 'types requis (tableau de types de médecins)' });

    if (!emailConfig || !emailConfig.gmail_user || !emailConfig.gmail_pass)
      return res.status(503).json({ error: 'Configuration email manquante — créez server/email.config.json (voir email.config.json.example)' });
    if (!nodemailer)
      return res.status(503).json({ error: 'nodemailer non installé' });

    const placeholders = types.map(() => '?').join(',');
    const medecins = dbLib.queryAll(
      `SELECT id, nom, type, email FROM medecins WHERE type IN (${placeholders}) AND actif=1 AND email IS NOT NULL AND TRIM(email) != ''`,
      types
    );
    if (medecins.length === 0)
      return res.status(400).json({ error: 'Aucun praticien avec adresse email dans les catégories sélectionnées' });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: emailConfig.gmail_user, pass: emailConfig.gmail_pass },
    });

    const appUrl    = (base_url || 'http://localhost:5173').replace(/\/$/, '');
    const now       = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();

    const createdById = req.authUser?.userId ?? null;
    const campaignRow = dbLib.run(
      'INSERT INTO conge_campaigns (created_at, created_by, types) VALUES (?,?,?)',
      [createdAt, createdById, JSON.stringify(types)]
    );
    const campaignId = campaignRow.lastInsertRowid;

    let sent = 0;
    const errors = [];

    for (const med of medecins) {
      const token = crypto.randomBytes(32).toString('hex');
      dbLib.run(
        'INSERT INTO conge_tokens (token,med_id,created_at,expires_at,campaign_id) VALUES (?,?,?,?,?)',
        [token, med.id, createdAt, expiresAt, campaignId]
      );

      const link      = `${appUrl}/conge/${token}`;
      const firstName = med.nom.split(' ')[0];

      try {
        await transporter.sendMail({
          from: `"Planning Gériatrie" <${emailConfig.gmail_user}>`,
          to:   med.email,
          subject: 'Saisissez vos congés — Planning Pôle Gériatrie',
          html: `
            <div style="font-family:system-ui,Arial,sans-serif;max-width:500px;margin:auto;padding:24px">
              <div style="background:#1858c8;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0">
                <strong style="font-size:16px">Planning Pôle Gériatrie</strong>
              </div>
              <div style="border:1px solid #ddd;border-top:none;padding:28px 24px;border-radius:0 0 10px 10px;background:#fff">
                <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a">Bonjour <strong>${firstName}</strong>,</p>
                <p style="margin:0 0 24px;font-size:14px;color:#444;line-height:1.6">
                  Vous pouvez saisir vos demandes de congés en cliquant sur le bouton ci-dessous.<br>
                  Ce lien est <strong>personnel</strong> et valable <strong>72 heures</strong>.
                </p>
                <p style="text-align:center;margin:28px 0">
                  <a href="${link}"
                     style="background:#2272f0;color:#fff;padding:14px 32px;border-radius:9px;
                            text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
                    Saisir mes congés
                  </a>
                </p>
                <p style="font-size:12px;color:#999;margin:24px 0 0">
                  Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                  <span style="color:#2272f0">${link}</span>
                </p>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
                <p style="font-size:11px;color:#bbb;margin:0">CHU · Pôle Gériatrie — Planning interne</p>
              </div>
            </div>
          `,
          text: `Bonjour ${firstName},\n\nSaisissez vos congés via ce lien personnel (valable 72h) :\n${link}\n\nCHU · Pôle Gériatrie`,
        });
        sent++;
      } catch(e) {
        errors.push({ nom: med.nom, email: med.email, error: e.message });
      }
    }

    res.json({ ok: true, sent, total: medecins.length, errors, campaign_id: campaignId });
  });

  // ── Suivi de campagne ────────────────────────────────────

  app.get('/api/conge/campaign/latest', requireGestionnaire, (req, res) => {
    const campaign = dbLib.queryOne(
      'SELECT * FROM conge_campaigns ORDER BY id DESC LIMIT 1'
    );
    if (!campaign) return res.json(null);

    const now = new Date().toISOString();
    const tokens = dbLib.queryAll(
      `SELECT ct.token, ct.med_id, ct.created_at, ct.expires_at, ct.used_at,
              m.nom, m.type, m.email
       FROM conge_tokens ct
       JOIN medecins m ON m.id = ct.med_id
       WHERE ct.campaign_id = ?
       ORDER BY m.nom`,
      [campaign.id]
    );

    const members = tokens.map(t => {
      let status;
      if (t.used_at) {
        status = 'responded';
      } else if (t.expires_at < now) {
        status = 'expired';
      } else {
        status = 'pending';
      }
      const msLeft = status === 'pending'
        ? Math.max(0, new Date(t.expires_at).getTime() - Date.now())
        : 0;
      return {
        med_id:     t.med_id,
        nom:        t.nom,
        type:       t.type,
        email:      t.email,
        status,
        expires_at: t.expires_at,
        used_at:    t.used_at,
        ms_left:    msLeft,
      };
    });

    res.json({
      id:         campaign.id,
      created_at: campaign.created_at,
      types:      JSON.parse(campaign.types),
      members,
    });
  });

  app.put('/api/conge/campaign/extend/:medId', requireGestionnaire, (req, res) => {
    const v = validate(extendTokenSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { hours } = v.data;

    const campaign = dbLib.queryOne(
      'SELECT id FROM conge_campaigns ORDER BY id DESC LIMIT 1'
    );
    if (!campaign) return res.status(404).json({ error: 'Aucune campagne trouvée' });

    const token = dbLib.queryOne(
      'SELECT * FROM conge_tokens WHERE campaign_id=? AND med_id=? AND used_at IS NULL',
      [campaign.id, req.params.medId]
    );
    if (!token) return res.status(404).json({ error: 'Token introuvable ou déjà utilisé' });

    const newExpiry = new Date(
      Math.max(Date.now(), new Date(token.expires_at).getTime()) + hours * 60 * 60 * 1000
    ).toISOString();
    dbLib.run('UPDATE conge_tokens SET expires_at=? WHERE token=?', [newExpiry, token.token]);
    res.json({ ok: true, expires_at: newExpiry });
  });

  app.post('/api/conge/campaign/resend/:medId', requireGestionnaire, async (req, res) => {
    if (!emailConfig || !emailConfig.gmail_user || !emailConfig.gmail_pass)
      return res.status(503).json({ error: 'Configuration email manquante' });
    if (!nodemailer)
      return res.status(503).json({ error: 'nodemailer non installé' });

    const campaign = dbLib.queryOne(
      'SELECT * FROM conge_campaigns ORDER BY id DESC LIMIT 1'
    );
    if (!campaign) return res.status(404).json({ error: 'Aucune campagne trouvée' });

    const med = dbLib.queryOne(
      'SELECT id, nom, type, email FROM medecins WHERE id=? AND actif=1',
      [req.params.medId]
    );
    if (!med) return res.status(404).json({ error: 'Praticien introuvable' });
    if (!med.email) return res.status(400).json({ error: 'Aucun email pour ce praticien' });

    // Invalide les anciens tokens de cette campagne pour ce médecin
    dbLib.run(
      "UPDATE conge_tokens SET expires_at=datetime('now') WHERE campaign_id=? AND med_id=? AND used_at IS NULL",
      [campaign.id, med.id]
    );

    const now       = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
    const token     = crypto.randomBytes(32).toString('hex');
    dbLib.run(
      'INSERT INTO conge_tokens (token,med_id,created_at,expires_at,campaign_id) VALUES (?,?,?,?,?)',
      [token, med.id, createdAt, expiresAt, campaign.id]
    );

    const appUrl    = (req.body?.base_url || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const link      = `${appUrl}/conge/${token}`;
    const firstName = med.nom.split(' ')[0];

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: emailConfig.gmail_user, pass: emailConfig.gmail_pass },
    });

    try {
      await transporter.sendMail({
        from:    `"Planning Gériatrie" <${emailConfig.gmail_user}>`,
        to:      med.email,
        subject: 'Nouveau lien — Saisissez vos congés',
        html: `
          <div style="font-family:system-ui,Arial,sans-serif;max-width:500px;margin:auto;padding:24px">
            <div style="background:#1858c8;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0">
              <strong style="font-size:16px">Planning Pôle Gériatrie</strong>
            </div>
            <div style="border:1px solid #ddd;border-top:none;padding:28px 24px;border-radius:0 0 10px 10px;background:#fff">
              <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a">Bonjour <strong>${firstName}</strong>,</p>
              <p style="margin:0 0 24px;font-size:14px;color:#444;line-height:1.6">
                Un nouveau lien personnel vous a été envoyé pour saisir vos congés.<br>
                Il est <strong>valable 72 heures</strong>.
              </p>
              <p style="text-align:center;margin:28px 0">
                <a href="${link}"
                   style="background:#2272f0;color:#fff;padding:14px 32px;border-radius:9px;
                          text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
                  Saisir mes congés
                </a>
              </p>
              <p style="font-size:12px;color:#999;margin:24px 0 0">
                Si le bouton ne fonctionne pas : <span style="color:#2272f0">${link}</span>
              </p>
            </div>
          </div>
        `,
        text: `Bonjour ${firstName},\n\nNouvel accès pour saisir vos congés (72h) :\n${link}\n\nCHU · Pôle Gériatrie`,
      });
      res.json({ ok: true, expires_at: expiresAt });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/conge/preview', (req, res) => {
    const types = (req.query.types || '').split(',').filter(Boolean);
    if (types.length === 0) return res.json([]);
    const placeholders = types.map(() => '?').join(',');
    const rows = dbLib.queryAll(
      `SELECT id, nom, type, email FROM medecins WHERE type IN (${placeholders}) AND actif=1 ORDER BY nom`,
      types
    );
    res.json(rows.map(r => ({ id: r.id, nom: r.nom, type: r.type, email: r.email || null })));
  });

  // ═══════════════════════════════════════════════════════
  // COPIE SEMAINE
  // ═══════════════════════════════════════════════════════
  app.post('/api/planning/copy', (req, res) => {
    const v = validate(planningCopySchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { from_week, to_week } = v.data;
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
    if (!isMonth(month)) return res.status(400).json({ error: 'month invalide (YYYY-MM attendu)' });
    const rows = dbLib.queryAll(`
      SELECT a.id, a.date_iso, a.type_ast, a.med_id, m.nom as med_nom, m.tel as med_tel
      FROM astreintes a JOIN medecins m ON a.med_id = m.id
      WHERE a.date_iso LIKE ?
      ORDER BY a.date_iso, a.type_ast
    `, [month + '-%']);
    res.json(rows);
  });

  app.post('/api/astreintes', (req, res) => {
    const v = validate(astreintesCreateSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { date_iso, type_ast, med_id } = v.data;
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    try {
      const before = dbLib.queryOne('SELECT * FROM astreintes WHERE date_iso=? AND type_ast=?', [date_iso, type_ast]);
      dbLib.run('DELETE FROM astreintes WHERE date_iso=? AND type_ast=?', [date_iso, type_ast]);
      const result = dbLib.run(
        'INSERT INTO astreintes (date_iso,type_ast,med_id) VALUES (?,?,?)',
        [date_iso, type_ast, med_id]
      );
      const row = dbLib.queryOne(`
        SELECT a.id, a.date_iso, a.type_ast, a.med_id, m.nom as med_nom, m.tel as med_tel
        FROM astreintes a JOIN medecins m ON a.med_id=m.id WHERE a.id=?
      `, [result.lastInsertRowid]);
      logAudit('CREATE', 'astreintes', result.lastInsertRowid, before || null, { date_iso, type_ast, med_id });
      res.json(row);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/astreintes/:id', (req, res) => {
    const before = dbLib.queryOne('SELECT * FROM astreintes WHERE id=?', [req.params.id]);
    dbLib.run('DELETE FROM astreintes WHERE id=?', [req.params.id]);
    if (before) logAudit('DELETE', 'astreintes', req.params.id, before, null);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // STATISTIQUES PAR MÉDECIN
  // ═══════════════════════════════════════════════════════
  app.get('/api/stats/medecin/:medId', (req, res) => {
    const { medId } = req.params;
    const year    = new Date().getFullYear();
    const fromKey = req.query.from || `${year}-01-01`;
    const toKey   = req.query.to   || `${year}-12-31`;

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
    const fromKey = req.query.from || `${year}-01-01`;
    const toKey   = req.query.to   || `${year}-12-31`;

    const affRows = dbLib.queryAll(`
      SELECT med_id, poste_id, COUNT(DISTINCT week_key) AS semaines
      FROM affectations
      WHERE week_key >= ? AND week_key <= ?
      GROUP BY med_id, poste_id
      ORDER BY med_id, semaines DESC
    `, [fromKey, toKey]);

    const absRows = dbLib.queryAll(`
      SELECT med_id, date_debut, date_fin, type_abs
      FROM absences
      WHERE date_fin >= ? AND date_debut <= ?
      ORDER BY med_id, date_debut
    `, [fromKey, toKey]);

    const medecins = dbLib.queryAll('SELECT id FROM medecins WHERE actif=1 ORDER BY id');

    const affByMed = {};
    for (const r of affRows) {
      if (!affByMed[r.med_id]) affByMed[r.med_id] = [];
      affByMed[r.med_id].push({ poste_id: r.poste_id, semaines: r.semaines });
    }

    const absByMed = {};
    for (const r of absRows) {
      if (!absByMed[r.med_id]) absByMed[r.med_id] = [];
      absByMed[r.med_id].push({ date_debut: r.date_debut, date_fin: r.date_fin, type_abs: r.type_abs });
    }

    const result = medecins.map(({ id }) => ({
      med_id: id,
      affectations: affByMed[id] || [],
      absences:     absByMed[id] || [],
    }));

    res.json(result);
  });

  // ═══════════════════════════════════════════════════════
  // BACKUP BASE DE DONNÉES (téléchargement SQLite)
  // ═══════════════════════════════════════════════════════
  app.get('/api/backup/download', requireGestionnaire, (req, res) => {
    const dbPath = path.join(__dirname, 'database.sqlite');
    if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'Base de données introuvable' });
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="planning-backup-${date}.sqlite"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(dbPath).pipe(res);
  });

  // ═══════════════════════════════════════════════════════
  // SETTINGS (code équipe, gestionnaires)
  // ═══════════════════════════════════════════════════════
  app.get('/api/settings/team-code', requireGestionnaire, (req, res) => {
    const row = dbLib.queryOne("SELECT value FROM settings WHERE key='team_code'");
    res.json({ team_code: row ? row.value : '' });
  });

  app.put('/api/settings/team-code', requireGestionnaire, (req, res) => {
    const v = validate(teamCodeUpdateSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const newCode = v.data.code;
    dbLib.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('team_code', ?)", [newCode]);
    logAudit(req.authUser.userId, 'update', 'settings', 'team_code', null, { team_code: newCode });
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // GESTIONNAIRES & AUDIT LOG (onglet Paramètres — P31)
  // ═══════════════════════════════════════════════════════

  app.put('/api/auth/change-password', requireGestionnaire, async (req, res) => {
    const v = validate(changePasswordSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { currentPassword, newPassword } = v.data;
    const user = dbLib.queryOne('SELECT * FROM users WHERE id=?', [req.authUser.userId]);
    if (!user) return res.status(404).json({ error: 'Compte introuvable' });
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    const newHash = await bcrypt.hash(newPassword, 10);
    dbLib.run('UPDATE users SET password_hash=? WHERE id=?', [newHash, user.id]);
    logAudit(req.authUser.userId, 'UPDATE', 'users', user.id, null, { password: 'changed' });
    res.json({ ok: true });
  });

  app.get('/api/gestionnaires', requireGestionnaire, (req, res) => {
    const rows = dbLib.queryAll('SELECT id, nom, email, created_at FROM users ORDER BY created_at ASC');
    res.json(rows);
  });

  app.post('/api/gestionnaires', requireGestionnaire, async (req, res) => {
    const v = validate(createGestionnaireSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { nom, email, password } = v.data;
    const existing = dbLib.queryOne('SELECT id FROM users WHERE email=?', [email]);
    if (existing) return res.status(409).json({ error: 'Un compte avec cet email existe déjà' });
    const hash = await bcrypt.hash(password, 10);
    const result = dbLib.run('INSERT INTO users (nom, email, password_hash) VALUES (?,?,?)', [nom, email, hash]);
    const newId = result.lastInsertRowid;
    logAudit(req.authUser.userId, 'CREATE', 'users', newId, null, { nom, email });
    const created = dbLib.queryOne('SELECT id, nom, email, created_at FROM users WHERE id=?', [newId]);
    res.status(201).json(created);
  });

  app.put('/api/gestionnaires/:id', requireGestionnaire, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.authUser.userId) return res.status(403).json({ error: 'Impossible de modifier son propre compte via cette route' });
    const v = validate(updateGestionnaireSchema, req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { nom, email } = v.data;
    const user = dbLib.queryOne('SELECT * FROM users WHERE id=?', [id]);
    if (!user) return res.status(404).json({ error: 'Gestionnaire introuvable' });
    const emailConflict = dbLib.queryOne('SELECT id FROM users WHERE email=? AND id!=?', [email, id]);
    if (emailConflict) return res.status(409).json({ error: 'Un compte avec cet email existe déjà' });
    dbLib.run('UPDATE users SET nom=?, email=? WHERE id=?', [nom, email, id]);
    logAudit(req.authUser.userId, 'UPDATE', 'users', id, { nom: user.nom, email: user.email }, { nom, email });
    res.json({ id, nom, email });
  });

  app.delete('/api/gestionnaires/:id', requireGestionnaire, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.authUser.userId) return res.status(403).json({ error: 'Impossible de supprimer son propre compte' });
    const user = dbLib.queryOne('SELECT id, nom, email FROM users WHERE id=?', [id]);
    if (!user) return res.status(404).json({ error: 'Gestionnaire introuvable' });
    const count = dbLib.queryOne('SELECT COUNT(*) as n FROM users').n;
    if (count <= 1) return res.status(409).json({ error: 'Impossible de supprimer le dernier gestionnaire' });
    dbLib.run('DELETE FROM users WHERE id=?', [id]);
    logAudit(req.authUser.userId, 'DELETE', 'users', id, { nom: user.nom, email: user.email }, null);
    res.json({ ok: true });
  });

  const AUDIT_PAGE_SIZE = 20;
  app.get('/api/audit-log', requireGestionnaire, (req, res) => {
    const v = validate(auditLogQuerySchema, req.query);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { action, table, from, to, page } = v.data;
    const conditions = [];
    const params = [];
    if (action) { conditions.push('UPPER(al.action)=?');        params.push(action.toUpperCase()); }
    if (table)  { conditions.push('al.table_name=?');            params.push(table); }
    if (from)   { conditions.push("date(al.created_at)>=?");    params.push(from); }
    if (to)     { conditions.push("date(al.created_at)<=?");    params.push(to); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const total = dbLib.queryOne(
      `SELECT COUNT(*) as n FROM audit_log al ${where}`, params
    ).n;
    const offset = (page - 1) * AUDIT_PAGE_SIZE;
    const rows = dbLib.queryAll(
      `SELECT al.*, u.nom as gestionnaire_nom
       FROM audit_log al
       LEFT JOIN users u ON u.id = CAST(al.user_id AS INTEGER)
       ${where}
       ORDER BY al.id DESC
       LIMIT ? OFFSET ?`,
      [...params, AUDIT_PAGE_SIZE, offset]
    );
    res.json({ total, page, totalPages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)), rows });
  });

  // ═══════════════════════════════════════════════════════
  // CLIENT STATIQUE (production)
  // ═══════════════════════════════════════════════════════
  const clientDist = path.join(__dirname, '../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}

module.exports = { createApp };

// ═══════════════════════════════════════════════════════
// DÉMARRAGE (uniquement si exécuté directement)
// ═══════════════════════════════════════════════════════
if (require.main === module) {
  const dbLib = require('./db');
  const app   = createApp(dbLib);

  dbLib.init().then(() => {
    app._setDbReady();
    app.listen(PORT, () => {
      console.log(`\n✓ Serveur planning gériatrie → http://localhost:${PORT}`);
      console.log(`  API → http://localhost:${PORT}/api\n`);
    });
  }).catch(err => {
    console.error('Erreur init :', err);
    process.exit(1);
  });
}
