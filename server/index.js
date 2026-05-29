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

// ── Nodemailer (optionnel) ─────────────────────────────
let nodemailer;
try { nodemailer = require('nodemailer'); } catch(e) { console.warn('nodemailer non disponible'); }

const EMAIL_CFG_PATH = path.join(__dirname, 'email.config.json');
let emailConfig = null;
try { emailConfig = JSON.parse(fs.readFileSync(EMAIL_CFG_PATH, 'utf8')); } catch(_) {}

const CFG_PATH = path.join(__dirname, 'secretary.config.json');
const PORT     = process.env.PORT || 3001;

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

// ── Chargement config secrétariat (retourne le hash) ──
// Modifier le mot de passe via : node -e "require('bcryptjs').hash('MOTDEPASSE',12).then(h=>require('fs').writeFileSync('secretary.config.json',JSON.stringify({passwordHash:h},null,2)))"
async function loadSecretaryConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
    if (cfg.passwordHash) return cfg.passwordHash;
    if (cfg.password) {
      const hash = await bcrypt.hash(cfg.password, 12);
      fs.writeFileSync(CFG_PATH, JSON.stringify({ passwordHash: hash }, null, 2));
      console.log('✓ Mot de passe migré vers bcrypt (secretary.config.json mis à jour)');
      return hash;
    }
  } catch { /* pas de fichier config → accès libre */ }
  return '';
}

// ═══════════════════════════════════════════════════════
// FACTORY — crée et configure l'app Express
// ═══════════════════════════════════════════════════════
function createApp(dbLib) {
  const app = express();

  const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
  let DB_READY = false;
  let SECRETARY_HASH = '';

  app._setDbReady       = ()  => { DB_READY = true; };
  app._setSecretaryHash = (h) => { SECRETARY_HASH = h; };

  const checkMedExists = (med_id) =>
    !!dbLib.queryOne('SELECT 1 FROM medecins WHERE id=?', [med_id]);

  function logAudit(action, tableName, recordId, payloadBefore, payloadAfter) {
    try {
      dbLib.run(
        `INSERT INTO audit_log (action, table_name, record_id, payload_before, payload_after)
         VALUES (?, ?, ?, ?, ?)`,
        [
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

  // ── Authentification (avant le guard DB_READY) ──────
  app.post('/api/auth', authLimiter, async (req, res) => {
    if (!SECRETARY_HASH) return res.json({ ok: true, token: '' });
    const match = await bcrypt.compare(req.body.password || '', SECRETARY_HASH);
    if (!match) return res.status(401).json({ error: 'Mot de passe incorrect' });
    const token = jwt.sign({ role: 'secretary' }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ ok: true, token });
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
    });
    res.json({ ok: true, count });
  });

  // ── Guard : token JWT requis pour toute mutation ────
  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();
    if (!SECRETARY_HASH) return next();
    const token = req.headers['x-secretary-key'];
    if (!token) return res.status(403).json({ error: 'Accès réservé aux secrétaires' });
    try {
      jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      res.status(403).json({ error: 'Session expirée, veuillez vous reconnecter' });
    }
  });

  // ═══════════════════════════════════════════════════════
  // MÉDECINS
  // ═══════════════════════════════════════════════════════
  app.get('/api/medecins', (req, res) => {
    const rows = dbLib.queryAll('SELECT * FROM medecins WHERE actif=1 ORDER BY type, nom');
    res.json(rows.map(r => ({ ...r, sched: r.sched.split('').map(Number) })));
  });

  app.post('/api/medecins', (req, res) => {
    const { nom, type, sched, service, tel, email } = req.body;
    if (!nom || !type) return res.status(400).json({ error: 'nom et type requis' });
    if (!MED_TYPES.has(type)) return res.status(400).json({ error: 'type invalide' });
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
    const { nom, type, sched, service, tel, email } = req.body;
    const { id } = req.params;
    if (type !== undefined && !MED_TYPES.has(type))
      return res.status(400).json({ error: 'type invalide' });
    if (nom     !== undefined) dbLib.run('UPDATE medecins SET nom=?     WHERE id=?', [nom, id]);
    if (type    !== undefined) dbLib.run('UPDATE medecins SET type=?    WHERE id=?', [type, id]);
    if (sched   !== undefined) {
      const s = Array.isArray(sched) ? sched.join('') : sched;
      dbLib.run('UPDATE medecins SET sched=? WHERE id=?', [s, id]);
    }
    if (service !== undefined) dbLib.run('UPDATE medecins SET service=? WHERE id=?', [service, id]);
    if (tel     !== undefined) dbLib.run('UPDATE medecins SET tel=?     WHERE id=?', [tel, id]);
    if (email   !== undefined) dbLib.run('UPDATE medecins SET email=?   WHERE id=?', [email || null, id]);
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

  // ═══════════════════════════════════════════════════════
  // ABSENCES
  // ═══════════════════════════════════════════════════════
  app.get('/api/absences', (req, res) => {
    const rows = dbLib.queryAll(`
      SELECT a.id, a.med_id, a.date_debut, a.date_fin, a.type_abs, a.demi_journee, m.nom as med_nom
      FROM absences a JOIN medecins m ON a.med_id=m.id
      ORDER BY a.date_debut DESC
    `);
    res.json(rows);
  });

  app.post('/api/absences', (req, res) => {
    const { med_id, date_debut, date_fin, type_abs, demi_journee } = req.body;
    if (!med_id || !date_debut || !date_fin || !type_abs)
      return res.status(400).json({ error: 'Champs manquants' });
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    if (!isIsoDate(date_debut) || !isIsoDate(date_fin))
      return res.status(400).json({ error: 'Format de date invalide (YYYY-MM-DD attendu)' });
    if (!ABS_TYPES.has(type_abs))
      return res.status(400).json({ error: 'type_abs invalide' });
    if (date_fin < date_debut) return res.status(400).json({ error: 'date_fin < date_debut' });
    if (demi_journee != null && !['matin', 'apm'].includes(demi_journee))
      return res.status(400).json({ error: 'demi_journee invalide (matin, apm ou null)' });
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
    const { week_key, poste_id, med_id } = req.body;
    if (!week_key || !poste_id || !med_id) return res.status(400).json({ error: 'Champs manquants' });
    if (!isIsoDate(week_key)) return res.status(400).json({ error: 'week_key invalide' });
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
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
    if (!isIsoDate(week_key)) return res.status(400).json({ error: 'week_key invalide' });
    dbLib.run('DELETE FROM affectations WHERE week_key=? AND poste_id=? AND med_id=?', [week_key, poste_id, med_id]);
    dbLib.run('DELETE FROM exclusions   WHERE week_key=? AND poste_id=? AND med_id=?', [week_key, poste_id, med_id]);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // EXCLUSIONS
  // ═══════════════════════════════════════════════════════
  app.post('/api/exclusions', (req, res) => {
    const { week_key, poste_id, med_id, jour } = req.body;
    if (!isIsoDate(week_key)) return res.status(400).json({ error: 'week_key invalide' });
    if (!isIsoDate(jour))     return res.status(400).json({ error: 'jour invalide' });
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    dbLib.run('INSERT OR IGNORE INTO exclusions (week_key,poste_id,med_id,jour) VALUES (?,?,?,?)',
      [week_key, poste_id, med_id, jour]);
    res.json({ ok: true });
  });

  app.delete('/api/exclusions', (req, res) => {
    const { week_key, poste_id, med_id, jour } = req.body;
    if (!isIsoDate(week_key)) return res.status(400).json({ error: 'week_key invalide' });
    if (!isIsoDate(jour))     return res.status(400).json({ error: 'jour invalide' });
    dbLib.run('DELETE FROM exclusions WHERE week_key=? AND poste_id=? AND med_id=? AND jour=?',
      [week_key, poste_id, med_id, jour]);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // EXTRAS
  // ═══════════════════════════════════════════════════════
  app.post('/api/extras', (req, res) => {
    const { week_key, poste_id, med_id, jour } = req.body;
    if (!isIsoDate(week_key)) return res.status(400).json({ error: 'week_key invalide' });
    if (!isIsoDate(jour))     return res.status(400).json({ error: 'jour invalide' });
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    dbLib.run('INSERT OR IGNORE INTO extras (week_key,poste_id,med_id,jour) VALUES (?,?,?,?)',
      [week_key, poste_id, med_id, jour]);
    res.json({ ok: true });
  });

  app.delete('/api/extras', (req, res) => {
    const { week_key, poste_id, med_id, jour } = req.body;
    if (!isIsoDate(week_key)) return res.status(400).json({ error: 'week_key invalide' });
    if (!isIsoDate(jour))     return res.status(400).json({ error: 'jour invalide' });
    dbLib.run('DELETE FROM extras WHERE week_key=? AND poste_id=? AND med_id=? AND jour=?',
      [week_key, poste_id, med_id, jour]);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  // RENFORTS
  // ═══════════════════════════════════════════════════════
  app.post('/api/renforts', (req, res) => {
    const { week_key, poste_id, med_id, jour } = req.body;
    if (!week_key || !poste_id || !med_id || !jour)
      return res.status(400).json({ error: 'Champs manquants' });
    if (!isIsoDate(week_key)) return res.status(400).json({ error: 'week_key invalide' });
    if (!isIsoDate(jour))     return res.status(400).json({ error: 'jour invalide' });
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    dbLib.run('INSERT OR IGNORE INTO renforts (week_key,poste_id,med_id,jour) VALUES (?,?,?,?)',
      [week_key, poste_id, med_id, jour]);
    res.json({ ok: true });
  });

  app.delete('/api/renforts', (req, res) => {
    const { week_key, poste_id, med_id, jour } = req.body;
    if (!isIsoDate(week_key)) return res.status(400).json({ error: 'week_key invalide' });
    if (!isIsoDate(jour))     return res.status(400).json({ error: 'jour invalide' });
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

    let sent = 0;
    const errors = [];

    for (const med of medecins) {
      const token = crypto.randomBytes(32).toString('hex');
      dbLib.run(
        'INSERT INTO conge_tokens (token,med_id,created_at,expires_at) VALUES (?,?,?,?)',
        [token, med.id, createdAt, expiresAt]
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

    res.json({ ok: true, sent, total: medecins.length, errors });
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
    const { from_week, to_week } = req.body;
    if (!from_week || !to_week) return res.status(400).json({ error: 'from_week et to_week requis' });
    if (!isIsoDate(from_week) || !isIsoDate(to_week))
      return res.status(400).json({ error: 'Format de semaine invalide (YYYY-MM-DD attendu)' });
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
    const { date_iso, type_ast, med_id } = req.body;
    if (!date_iso || !type_ast || !med_id)
      return res.status(400).json({ error: 'date_iso, type_ast, med_id requis' });
    if (!checkMedExists(med_id)) return res.status(400).json({ error: 'med_id inconnu' });
    if (!isIsoDate(date_iso))
      return res.status(400).json({ error: 'date_iso invalide (YYYY-MM-DD attendu)' });
    if (!AST_TYPES.has(type_ast))
      return res.status(400).json({ error: 'type_ast invalide' });
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

    const medecins = dbLib.queryAll('SELECT id FROM medecins ORDER BY id');

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
  // CLIENT STATIQUE (production)
  // ═══════════════════════════════════════════════════════
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '../client/dist');
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

  let secretaryHash = '';
  loadSecretaryConfig().then(hash => {
    secretaryHash = hash;
    app._setSecretaryHash(hash);
    return dbLib.init();
  }).then(() => {
    app._setDbReady();
    const pwdStatus = secretaryHash
      ? '(mot de passe secrétariat configuré)'
      : '(ATTENTION : aucun mot de passe, accès libre)';
    app.listen(PORT, () => {
      console.log(`\n✓ Serveur planning gériatrie → http://localhost:${PORT}`);
      console.log(`  API → http://localhost:${PORT}/api`);
      console.log(`  Secrétariat ${pwdStatus}\n`);
    });
  }).catch(err => {
    console.error('Erreur init :', err);
    process.exit(1);
  });
}
