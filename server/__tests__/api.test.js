/**
 * Tests API serveur — planning-geriatrie
 * Utilise supertest + Jest
 * La DB est créée en mémoire pour chaque suite (db_testable + :memory:)
 */

const request = require('supertest');

// ════════════════════════════════════════════════════════════════════════════
// SUITE DE TESTS
// ════════════════════════════════════════════════════════════════════════════

let app, dbLib;

// Proxy supertest qui injecte le header gestionnaire sur toutes les mutations
const authReq = (a) => ['post', 'put', 'patch', 'delete'].reduce((o, m) => {
  o[m] = (url) => request(a)[m](url).set('Authorization', `Bearer ${a._makeToken('gestionnaire')}`);
  return o;
}, {});

beforeAll(async () => {
  jest.resetModules();
  process.env.PG_TEST_DB_PATH = ':memory:';

  dbLib = require('../db_testable');
  await dbLib.init();

  const { createApp } = require('../index');
  app = createApp(dbLib);
  app._setDbReady();
}, 30000);

afterAll(() => {
  // Nettoyage éventuel
});

// ── Constantes de test ───────────────────────────────────────────────────────
const TEST_MED = { nom: 'Test Dupont', type: 'ph' };
const WEEK_KEY = '2025-06-02'; // lundi
const WEEK_KEY2 = '2025-06-09'; // semaine suivante

// ════════════════════════════════════════════════════════════════════════════
// MÉDECINS
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/medecins', () => {
  test('retourne un tableau (seed présent)', async () => {
    const res = await request(app).get('/api/medecins');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('chaque médecin a id, nom, type, sched (tableau)', async () => {
    const res = await request(app).get('/api/medecins');
    const med = res.body[0];
    expect(med).toHaveProperty('id');
    expect(med).toHaveProperty('nom');
    expect(med).toHaveProperty('type');
    expect(Array.isArray(med.sched)).toBe(true);
    expect(med.sched).toHaveLength(10);
  });

  test('sched contient uniquement 0 et 1', async () => {
    const res = await request(app).get('/api/medecins');
    res.body.forEach(m => {
      m.sched.forEach(v => expect([0, 1]).toContain(v));
    });
  });
});

describe('POST /api/medecins', () => {
  let createdId;

  test('happy path — crée un médecin', async () => {
    const res = await authReq(app).post('/api/medecins').send(TEST_MED);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.nom).toBe(TEST_MED.nom);
    expect(res.body.type).toBe(TEST_MED.type);
    expect(Array.isArray(res.body.sched)).toBe(true);
    createdId = res.body.id;
  });

  test('sched par défaut = 10 x 1 si non fourni', async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Sched', type: 'interne' });
    expect(res.status).toBe(200);
    expect(res.body.sched).toEqual([1,1,1,1,1,1,1,1,1,1]);
  });

  test('sched personnalisé accepté', async () => {
    const customSched = [1,0,1,0,1,0,1,0,1,0];
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Mi-temps', type: 'ph', sched: customSched });
    expect(res.status).toBe(200);
    expect(res.body.sched).toEqual(customSched);
  });

  test('400 si nom manquant', async () => {
    const res = await authReq(app).post('/api/medecins').send({ type: 'ph' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400 si type manquant', async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr X' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400 si body vide', async () => {
    const res = await authReq(app).post('/api/medecins').send({});
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/medecins/:id', () => {
  let medId;

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Edit', type: 'ipa' });
    medId = res.body.id;
  });

  test('met à jour le nom', async () => {
    const res = await authReq(app).put(`/api/medecins/${medId}`).send({ nom: 'Dr Edité' });
    expect(res.status).toBe(200);
    expect(res.body.nom).toBe('Dr Edité');
  });

  test('met à jour le type', async () => {
    const res = await authReq(app).put(`/api/medecins/${medId}`).send({ type: 'padhue' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('padhue');
  });

  test('met à jour le sched (tableau)', async () => {
    const newSched = [1,0,1,0,0,0,1,0,1,0];
    const res = await authReq(app).put(`/api/medecins/${medId}`).send({ sched: newSched });
    expect(res.status).toBe(200);
    expect(res.body.sched).toEqual(newSched);
  });

  test('met à jour le sched (chaîne)', async () => {
    const res = await authReq(app).put(`/api/medecins/${medId}`).send({ sched: '1111000000' });
    expect(res.status).toBe(200);
    expect(res.body.sched).toEqual([1,1,1,1,0,0,0,0,0,0]);
  });

  test('ID inexistant — retourne 404', async () => {
    const res = await authReq(app).put('/api/medecins/id_qui_nexiste_pas').send({ nom: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/medecins/:id/archiver', () => {
  test('archive un médecin — il disparaît de la liste active', async () => {
    const create = await authReq(app).post('/api/medecins').send({ nom: 'Dr ToArchive', type: 'externe' });
    const id = create.body.id;
    const res = await authReq(app).patch(`/api/medecins/${id}/archiver`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // N'apparaît plus dans GET /api/medecins (filtre actif=1)
    const list = await request(app).get('/api/medecins');
    expect(list.body.find(m => m.id === id)).toBeUndefined();
  });

  test('les données historiques (absences) sont préservées après archivage', async () => {
    const cr = await authReq(app).post('/api/medecins').send({ nom: 'Dr Historique', type: 'ph' });
    const id = cr.body.id;
    await authReq(app).post('/api/absences').send({
      med_id: id, date_debut: '2025-06-02', date_fin: '2025-06-06', type_abs: 'Congé annuel (CA)'
    });
    await authReq(app).patch(`/api/medecins/${id}/archiver`);
    // L'absence est conservée (traçabilité historique)
    const abs = await request(app).get('/api/absences');
    expect(abs.body.find(a => a.med_id === id)).toBeDefined();
  });

  test('ID inexistant — retourne 404', async () => {
    const res = await authReq(app).patch('/api/medecins/id_fantome/archiver');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/medecins/:id/desarchiver', () => {
  test('désarchive un médecin — réapparaît dans la liste active', async () => {
    const cr = await authReq(app).post('/api/medecins').send({ nom: 'Dr Reanimate', type: 'ph' });
    const id = cr.body.id;
    await authReq(app).patch(`/api/medecins/${id}/archiver`);
    const archived = await request(app).get('/api/medecins');
    expect(archived.body.find(m => m.id === id)).toBeUndefined();

    const res = await authReq(app).patch(`/api/medecins/${id}/desarchiver`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const active = await request(app).get('/api/medecins');
    expect(active.body.find(m => m.id === id)).toBeDefined();
  });

  test('ID inexistant — retourne 404', async () => {
    const res = await authReq(app).patch('/api/medecins/id_fantome/desarchiver');
    expect(res.status).toBe(404);
  });
});

describe('B5 — dates arrivée / départ (masquage planning)', () => {
  const futureDate = '2099-01-01';
  const pastDate   = '2000-01-01';

  test('date_arrivee future → absent de GET /api/medecins', async () => {
    const cr = await authReq(app).post('/api/medecins').send({ nom: 'Dr Futur', type: 'ph', date_arrivee: futureDate });
    expect(cr.status).toBe(200);
    const id = cr.body.id;
    const list = await request(app).get('/api/medecins');
    expect(list.body.some(m => m.id === id)).toBe(false);
  });

  test('date_depart passée → absent de GET /api/medecins et présent dans archives', async () => {
    const cr = await authReq(app).post('/api/medecins').send({ nom: 'Dr Parti', type: 'ph', date_depart: pastDate });
    const id = cr.body.id;
    const list = await request(app).get('/api/medecins');
    expect(list.body.some(m => m.id === id)).toBe(false);
    const arch = await request(app).get('/api/medecins/archives');
    expect(arch.body.some(m => m.id === id)).toBe(true);
  });

  test('date_depart future → encore présent (actif jusqu\'à la date)', async () => {
    const cr = await authReq(app).post('/api/medecins').send({ nom: 'Dr PartiPlusTard', type: 'ph', date_depart: futureDate });
    const id = cr.body.id;
    const list = await request(app).get('/api/medecins');
    expect(list.body.some(m => m.id === id)).toBe(true);
  });

  test('archiver avec date_depart future → archivage programmé sans désactiver', async () => {
    const cr = await authReq(app).post('/api/medecins').send({ nom: 'Dr Programme', type: 'ph' });
    const id = cr.body.id;
    const arch = await authReq(app).patch(`/api/medecins/${id}/archiver`).send({ date_depart: futureDate });
    expect(arch.status).toBe(200);
    const list = await request(app).get('/api/medecins');
    expect(list.body.some(m => m.id === id)).toBe(true); // encore actif aujourd'hui
  });

  test('désarchiver efface date_depart', async () => {
    const cr = await authReq(app).post('/api/medecins').send({ nom: 'Dr Revient', type: 'ph', date_depart: pastDate });
    const id = cr.body.id;
    await authReq(app).patch(`/api/medecins/${id}/desarchiver`);
    const list = await request(app).get('/api/medecins');
    const found = list.body.find(m => m.id === id);
    expect(found).toBeDefined();
    expect(found.date_depart).toBeNull();
  });
});

describe('PUT /api/medecins/:id — champs email, service, tel', () => {
  let medId;

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Fields', type: 'ph' });
    medId = res.body.id;
  });

  test('met à jour email', async () => {
    const res = await authReq(app).put(`/api/medecins/${medId}`).send({ email: 'dr@chu.fr' });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('dr@chu.fr');
  });

  test('met à jour service', async () => {
    const res = await authReq(app).put(`/api/medecins/${medId}`).send({ service: 'ssr' });
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('ssr');
  });

  test('met à jour tel', async () => {
    const res = await authReq(app).put(`/api/medecins/${medId}`).send({ tel: '0601020304' });
    expect(res.status).toBe(200);
    expect(res.body.tel).toBe('0601020304');
  });

  test('email null efface l\'email', async () => {
    const res = await authReq(app).put(`/api/medecins/${medId}`).send({ email: null });
    expect(res.status).toBe(200);
    expect(res.body.email).toBeNull();
  });

  test('sched invalide (9 chars) → 400', async () => {
    const res = await authReq(app).put(`/api/medecins/${medId}`).send({ sched: '111111111' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sched invalide/);
  });

  test('sched invalide (caractère non-binaire) → 400', async () => {
    const res = await authReq(app).put(`/api/medecins/${medId}`).send({ sched: '111111111X' });
    expect(res.status).toBe(400);
  });

  test('PUT sans champ — retourne le médecin inchangé', async () => {
    const res = await authReq(app).put(`/api/medecins/${medId}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(medId);
  });
});

describe('POST /api/medecins — validation sched', () => {
  test('sched invalide (longueur 9) → 400', async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr SchedBad', type: 'ph', sched: [1,1,1,1,1,1,1,1,1] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sched invalide/);
  });

  test('sched valide personnalisé → 200', async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr SchedOk', type: 'ph', sched: [1,0,1,0,1,0,1,0,1,0] });
    expect(res.status).toBe(200);
    expect(res.body.sched).toEqual([1,0,1,0,1,0,1,0,1,0]);
  });
});

describe('POST /api/affectations/move', () => {
  let medId;

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Move', type: 'ph' });
    medId = res.body.id;
    await authReq(app).post('/api/affectations').send({ week_key: '2025-09-01', poste_id: 'csg1a', med_id: medId });
  });

  test('déplace atomiquement une affectation — source disparaît, cible apparaît', async () => {
    const res = await authReq(app).post('/api/affectations/move').send({
      week_key: '2025-09-01', source_poste_id: 'csg1a', target_poste_id: 'ssr3', med_id: medId
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const plan = await request(app).get('/api/planning/2025-09-01');
    expect(plan.body.affectations['csg1a']?.medecins?.some(m => m.id === medId)).toBeFalsy();
    expect(plan.body.affectations['ssr3']?.medecins?.some(m => m.id === medId)).toBe(true);
  });

  test('400 si champs manquants', async () => {
    const res = await authReq(app).post('/api/affectations/move').send({ week_key: '2025-09-01' });
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ABSENCES
// ════════════════════════════════════════════════════════════════════════════

describe('Absences CRUD', () => {
  let medId, absId;

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Abs', type: 'ph' });
    medId = res.body.id;
  });

  test('GET /api/absences — retourne tableau', async () => {
    const res = await request(app).get('/api/absences');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/absences — happy path', async () => {
    const res = await authReq(app).post('/api/absences').send({
      med_id: medId, date_debut: '2025-06-02', date_fin: '2025-06-06', type_abs: 'Congé annuel (CA)'
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.med_id).toBe(medId);
    absId = res.body.id;
  });

  test('POST /api/absences — absence d\'un seul jour', async () => {
    const res = await authReq(app).post('/api/absences').send({
      med_id: medId, date_debut: '2025-06-10', date_fin: '2025-06-10', type_abs: 'RTT'
    });
    expect(res.status).toBe(200);
  });

  test('POST /api/absences — 400 si champ manquant', async () => {
    const res = await authReq(app).post('/api/absences').send({
      med_id: medId, date_debut: '2025-06-02'
      // date_fin et type_abs manquants
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/absences — 400 si date_fin < date_debut', async () => {
    const res = await authReq(app).post('/api/absences').send({
      med_id: medId, date_debut: '2025-06-10', date_fin: '2025-06-01', type_abs: 'RTT'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date_fin/);
  });

  test('GET /api/absences — contient le med_nom (JOIN)', async () => {
    const res = await request(app).get('/api/absences');
    const abs = res.body.find(a => a.id === absId);
    expect(abs).toBeDefined();
    expect(abs.med_nom).toBe('Dr Abs');
  });

  test('DELETE /api/absences/:id — supprime', async () => {
    const res = await authReq(app).delete(`/api/absences/${absId}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const list = await request(app).get('/api/absences');
    expect(list.body.find(a => a.id === absId)).toBeUndefined();
  });

  test('DELETE /api/absences/:id inexistant — idempotent', async () => {
    const res = await authReq(app).delete('/api/absences/999999');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PLANNING SEMAINE
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/planning/:weekKey', () => {
  test('retourne la structure attendue pour semaine vide', async () => {
    const res = await request(app).get('/api/planning/2025-01-06');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('affectations');
    expect(res.body).toHaveProperty('exclusions');
    expect(res.body).toHaveProperty('extras');
    expect(res.body).toHaveProperty('absences');
  });

  test('affectations est un objet', async () => {
    const res = await request(app).get('/api/planning/2025-01-06');
    expect(typeof res.body.affectations).toBe('object');
  });

  test('exclusions et extras sont des tableaux', async () => {
    const res = await request(app).get('/api/planning/2025-01-06');
    expect(Array.isArray(res.body.exclusions)).toBe(true);
    expect(Array.isArray(res.body.extras)).toBe(true);
    expect(Array.isArray(res.body.absences)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AFFECTATIONS
// ════════════════════════════════════════════════════════════════════════════

describe('Affectations CRUD', () => {
  let medId;

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Affecté', type: 'ph' });
    medId = res.body.id;
  });

  test('POST /api/affectations — happy path', async () => {
    const res = await authReq(app).post('/api/affectations').send({
      week_key: WEEK_KEY, poste_id: 'csg1a', med_id: medId
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST /api/affectations — idempotent (double insertion ignorée)', async () => {
    const res = await authReq(app).post('/api/affectations').send({
      week_key: WEEK_KEY, poste_id: 'csg1a', med_id: medId
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('Planning reflète l\'affectation', async () => {
    const res = await request(app).get(`/api/planning/${WEEK_KEY}`);
    expect(res.body.affectations['csg1a']).toBeDefined();
    expect(res.body.affectations['csg1a'].medecins.some(m => m.id === medId)).toBe(true);
  });

  test('POST /api/affectations — 400 si champs manquants', async () => {
    const res = await authReq(app).post('/api/affectations').send({ week_key: WEEK_KEY });
    expect(res.status).toBe(400);
  });

  test('DELETE /api/affectations — supprime', async () => {
    const res = await authReq(app).delete('/api/affectations').send({
      week_key: WEEK_KEY, poste_id: 'csg1a', med_id: medId
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const plan = await request(app).get(`/api/planning/${WEEK_KEY}`);
    const meds = plan.body.affectations['csg1a']?.medecins || [];
    expect(meds.some(m => m.id === medId)).toBe(false);
  });

  test('DELETE /api/affectations supprime aussi les exclusions associées', async () => {
    // Setup : affecter puis exclure
    await authReq(app).post('/api/affectations').send({ week_key: WEEK_KEY, poste_id: 'csg1b', med_id: medId });
    await authReq(app).post('/api/exclusions').send({ week_key: WEEK_KEY, poste_id: 'csg1b', med_id: medId, jour: '2025-06-03' });

    let plan = await request(app).get(`/api/planning/${WEEK_KEY}`);
    expect(plan.body.exclusions.some(e => e.med_id === medId)).toBe(true);

    // Retirer l'affectation
    await authReq(app).delete('/api/affectations').send({ week_key: WEEK_KEY, poste_id: 'csg1b', med_id: medId });

    plan = await request(app).get(`/api/planning/${WEEK_KEY}`);
    expect(plan.body.exclusions.some(e => e.med_id === medId && e.poste_id === 'csg1b')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EXCLUSIONS
// ════════════════════════════════════════════════════════════════════════════

describe('Exclusions CRUD', () => {
  let medId;

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Exclu', type: 'ph' });
    medId = res.body.id;
    await authReq(app).post('/api/affectations').send({ week_key: WEEK_KEY, poste_id: 'hdj', med_id: medId });
  });

  test('POST /api/exclusions — happy path', async () => {
    const res = await authReq(app).post('/api/exclusions').send({
      week_key: WEEK_KEY, poste_id: 'hdj', med_id: medId, jour: '2025-06-04'
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST /api/exclusions — idempotent', async () => {
    const res = await authReq(app).post('/api/exclusions').send({
      week_key: WEEK_KEY, poste_id: 'hdj', med_id: medId, jour: '2025-06-04'
    });
    expect(res.status).toBe(200);
  });

  test('Planning contient l\'exclusion', async () => {
    const res = await request(app).get(`/api/planning/${WEEK_KEY}`);
    expect(res.body.exclusions.some(e => e.med_id === medId && e.jour === '2025-06-04')).toBe(true);
  });

  test('DELETE /api/exclusions — supprime', async () => {
    const res = await authReq(app).delete('/api/exclusions').send({
      week_key: WEEK_KEY, poste_id: 'hdj', med_id: medId, jour: '2025-06-04'
    });
    expect(res.status).toBe(200);
    const plan = await request(app).get(`/api/planning/${WEEK_KEY}`);
    expect(plan.body.exclusions.some(e => e.med_id === medId && e.jour === '2025-06-04')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EXTRAS
// ════════════════════════════════════════════════════════════════════════════

describe('Extras CRUD', () => {
  let medId;

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Extra', type: 'ph' });
    medId = res.body.id;
  });

  test('POST /api/extras — happy path', async () => {
    const res = await authReq(app).post('/api/extras').send({
      week_key: WEEK_KEY, poste_id: 'ssr3', med_id: medId, jour: '2025-06-02'
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST /api/extras — idempotent', async () => {
    const res = await authReq(app).post('/api/extras').send({
      week_key: WEEK_KEY, poste_id: 'ssr3', med_id: medId, jour: '2025-06-02'
    });
    expect(res.status).toBe(200);
  });

  test('Planning contient l\'extra avec nom', async () => {
    const res = await request(app).get(`/api/planning/${WEEK_KEY}`);
    const extra = res.body.extras.find(e => e.med_id === medId);
    expect(extra).toBeDefined();
    expect(extra.nom).toBe('Dr Extra');
    expect(extra.jour).toBe('2025-06-02');
  });

  test('DELETE /api/extras — supprime', async () => {
    const res = await authReq(app).delete('/api/extras').send({
      week_key: WEEK_KEY, poste_id: 'ssr3', med_id: medId, jour: '2025-06-02'
    });
    expect(res.status).toBe(200);
    const plan = await request(app).get(`/api/planning/${WEEK_KEY}`);
    expect(plan.body.extras.some(e => e.med_id === medId)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// COPIE DE SEMAINE
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/planning/copy', () => {
  let medId;

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Copy', type: 'ph' });
    medId = res.body.id;
    // Setup semaine source
    await authReq(app).post('/api/affectations').send({ week_key: '2025-05-26', poste_id: 'ucc', med_id: medId });
    await authReq(app).post('/api/exclusions').send({ week_key: '2025-05-26', poste_id: 'ucc', med_id: medId, jour: '2025-05-27' });
  });

  test('happy path — copie affectations + exclusions de la semaine source', async () => {
    const res = await authReq(app).post('/api/planning/copy').send({
      from_week: '2025-05-26', to_week: '2025-06-16'
    });
    expect(res.status).toBe(200);
    const plan = await request(app).get('/api/planning/2025-06-16');
    expect(plan.body.affectations['ucc']?.medecins.some(m => m.id === medId)).toBe(true);
  });

  test('écrase les affectations existantes de la semaine cible', async () => {
    const r2 = await authReq(app).post('/api/medecins').send({ nom: 'Dr ToOverwrite', type: 'ipa' });
    await authReq(app).post('/api/affectations').send({ week_key: '2025-06-23', poste_id: 'emg', med_id: r2.body.id });
    // Copier depuis semaine vide : la semaine cible doit être effacée
    const res = await authReq(app).post('/api/planning/copy').send({
      from_week: '2020-01-06', to_week: '2025-06-23'
    });
    expect(res.status).toBe(200);
    const plan = await request(app).get('/api/planning/2025-06-23');
    expect(plan.body.affectations['emg']).toBeUndefined();
  });

  test('400 si from_week manquant', async () => {
    const res = await authReq(app).post('/api/planning/copy').send({ to_week: '2025-06-16' });
    expect(res.status).toBe(400);
  });

  test('400 si to_week manquant', async () => {
    const res = await authReq(app).post('/api/planning/copy').send({ from_week: '2025-05-26' });
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE : DB_READY
// ════════════════════════════════════════════════════════════════════════════

describe('Middleware DB_READY', () => {
  test('retourne 503 si DB non prête', async () => {
    jest.resetModules();
    const dbLib2 = require('../db_testable');
    // NE PAS appeler dbLib2.init() ni app2._setDbReady()
    const { createApp } = require('../index');
    const app2 = createApp(dbLib2);
    const res = await request(app2).get('/api/medecins');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/initialisation/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTS MÉTIER — Règles de planning gériatrique
// ════════════════════════════════════════════════════════════════════════════

describe('Règles métier planning gériatrique', () => {
  test('Un médecin ne peut pas être affecté à deux postes différents la même semaine (P1)', async () => {
    const r = await authReq(app).post('/api/medecins').send({ nom: 'Dr Multi', type: 'ph' });
    const id = r.body.id;
    const res1 = await authReq(app).post('/api/affectations').send({ week_key: '2025-07-07', poste_id: 'csg1a', med_id: id });
    expect(res1.status).toBe(200);
    const res2 = await authReq(app).post('/api/affectations').send({ week_key: '2025-07-07', poste_id: 'csg2a', med_id: id });
    // Le serveur rejette la double affectation sur un poste différent
    expect(res2.status).toBe(409);
  });

  test('Force-affectation (B1) : gestionnaire passe outre le blocage 409', async () => {
    const r = await authReq(app).post('/api/medecins').send({ nom: 'Dr Force', type: 'ph' });
    const id = r.body.id;
    await authReq(app).post('/api/affectations').send({ week_key: '2025-08-04', poste_id: 'csg1a', med_id: id });
    // Sans force → 409
    const blocked = await authReq(app).post('/api/affectations').send({ week_key: '2025-08-04', poste_id: 'csg2a', med_id: id });
    expect(blocked.status).toBe(409);
    // Avec force → 200, l'ancienne affectation est remplacée
    const forced = await authReq(app).post('/api/affectations').send({ week_key: '2025-08-04', poste_id: 'csg2a', med_id: id, force: true });
    expect(forced.status).toBe(200);
    const plan = await request(app).get('/api/planning/2025-08-04');
    expect((plan.body.affectations['csg1a']?.medecins || []).some(m => m.id === id)).toBe(false);
    expect((plan.body.affectations['csg2a']?.medecins || []).some(m => m.id === id)).toBe(true);
  });

  test('Un médecin peut être ré-affecté au même poste (idempotent)', async () => {
    const r = await authReq(app).post('/api/medecins').send({ nom: 'Dr Idem', type: 'ph' });
    const id = r.body.id;
    await authReq(app).post('/api/affectations').send({ week_key: '2025-07-07', poste_id: 'csg1a', med_id: id });
    const res2 = await authReq(app).post('/api/affectations').send({ week_key: '2025-07-07', poste_id: 'csg1a', med_id: id });
    expect(res2.status).toBe(200);
  });

  test('Les absences couvrant la semaine apparaissent dans le planning', async () => {
    const r = await authReq(app).post('/api/medecins').send({ nom: 'Dr AbsWeek', type: 'ph' });
    const id = r.body.id;
    // Absence du lundi au vendredi
    await authReq(app).post('/api/absences').send({
      med_id: id, date_debut: '2025-07-14', date_fin: '2025-07-18', type_abs: 'Congé annuel (CA)'
    });
    // Affecter à un poste cette semaine
    await authReq(app).post('/api/affectations').send({ week_key: '2025-07-14', poste_id: 'emg', med_id: id });

    const plan = await request(app).get('/api/planning/2025-07-14');
    // L'absence doit figurer dans le planning
    expect(plan.body.absences.some(a => a.med_id === id)).toBe(true);
  });

  test('Une exclusion n\'empêche pas d\'affecter à la semaine', async () => {
    const r = await authReq(app).post('/api/medecins').send({ nom: 'Dr ExclTest', type: 'ph' });
    const id = r.body.id;
    await authReq(app).post('/api/affectations').send({ week_key: '2025-07-21', poste_id: 'csg1a', med_id: id });
    await authReq(app).post('/api/exclusions').send({ week_key: '2025-07-21', poste_id: 'csg1a', med_id: id, jour: '2025-07-21' });

    const plan = await request(app).get('/api/planning/2025-07-21');
    // Médecin affecté mais exclu ce jour
    expect(plan.body.affectations['csg1a']?.medecins.some(m => m.id === id)).toBe(true);
    expect(plan.body.exclusions.some(e => e.med_id === id && e.jour === '2025-07-21')).toBe(true);
  });

  test('Les absences chevauchant partiellement la semaine sont incluses', async () => {
    const r = await authReq(app).post('/api/medecins').send({ nom: 'Dr AbsPartial', type: 'ph' });
    const id = r.body.id;
    // Absence qui commence avant et se termine en milieu de semaine
    await authReq(app).post('/api/absences').send({
      med_id: id, date_debut: '2025-07-21', date_fin: '2025-07-23', type_abs: 'RTT'
    });

    const plan = await request(app).get('/api/planning/2025-07-21');
    expect(plan.body.absences.some(a => a.med_id === id)).toBe(true);
  });

  test('Contrainte UNIQUE sur affectations empêche les doublons en base', async () => {
    // INSERT OR IGNORE doit gérer les doublons sans erreur
    const r = await authReq(app).post('/api/medecins').send({ nom: 'Dr Unique', type: 'ph' });
    const id = r.body.id;
    await authReq(app).post('/api/affectations').send({ week_key: '2025-08-04', poste_id: 'ssr4', med_id: id });
    await authReq(app).post('/api/affectations').send({ week_key: '2025-08-04', poste_id: 'ssr4', med_id: id });
    await authReq(app).post('/api/affectations').send({ week_key: '2025-08-04', poste_id: 'ssr4', med_id: id });

    const plan = await request(app).get('/api/planning/2025-08-04');
    const meds = plan.body.affectations['ssr4']?.medecins.filter(m => m.id === id) || [];
    expect(meds.length).toBe(1); // exactement 1, pas de doublon
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTS BASE DE DONNÉES
// ════════════════════════════════════════════════════════════════════════════

describe('Base de données — init et seed', () => {
  test('La DB contient les 34 praticiens du seed', async () => {
    const res = await request(app).get('/api/medecins');
    // Le seed contient 34 médecins (mais d'autres ont pu être créés dans les tests)
    expect(res.body.length).toBeGreaterThanOrEqual(34);
  });

  test('Le seed contient les types attendus', async () => {
    const res = await request(app).get('/api/medecins');
    const types = new Set(res.body.map(m => m.type));
    expect(types.has('ph')).toBe(true);
    expect(types.has('ipa')).toBe(true);
    expect(types.has('interne')).toBe(true);
    expect(types.has('externe')).toBe(true);
    expect(types.has('padhue')).toBe(true);
  });

  test('Les IDs du seed ne contiennent pas de caractères dangereux SQL', async () => {
    const res = await request(app).get('/api/medecins');
    res.body.forEach(m => {
      expect(m.id).toMatch(/^[a-zA-Z0-9_]+$/);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// RENFORTS
// ════════════════════════════════════════════════════════════════════════════

describe('Renforts CRUD', () => {
  let medId;

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Renfort', type: 'ph' });
    medId = res.body.id;
  });

  test('POST /api/renforts — happy path', async () => {
    const res = await authReq(app).post('/api/renforts').send({
      week_key: WEEK_KEY, poste_id: 'ssr1', med_id: medId, jour: '2025-06-02'
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST /api/renforts — idempotent', async () => {
    const res = await authReq(app).post('/api/renforts').send({
      week_key: WEEK_KEY, poste_id: 'ssr1', med_id: medId, jour: '2025-06-02'
    });
    expect(res.status).toBe(200);
  });

  test('POST /api/renforts — 400 si champs manquants', async () => {
    const res = await authReq(app).post('/api/renforts').send({ week_key: WEEK_KEY });
    expect(res.status).toBe(400);
  });

  test('Planning contient le renfort', async () => {
    const res = await request(app).get(`/api/planning/${WEEK_KEY}`);
    expect(Array.isArray(res.body.renforts)).toBe(true);
    expect(res.body.renforts.some(r => r.med_id === medId)).toBe(true);
  });

  test('DELETE /api/renforts — supprime', async () => {
    const res = await authReq(app).delete('/api/renforts').send({
      week_key: WEEK_KEY, poste_id: 'ssr1', med_id: medId, jour: '2025-06-02'
    });
    expect(res.status).toBe(200);
    const plan = await request(app).get(`/api/planning/${WEEK_KEY}`);
    expect(plan.body.renforts.some(r => r.med_id === medId)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ASTREINTES
// ════════════════════════════════════════════════════════════════════════════

describe('Astreintes CRUD', () => {
  let medId;

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Astreinte', type: 'ph' });
    medId = res.body.id;
  });

  test('GET /api/astreintes — 400 si month manquant', async () => {
    const res = await request(app).get('/api/astreintes');
    expect(res.status).toBe(400);
  });

  test('GET /api/astreintes — 400 si format invalide', async () => {
    const res = await request(app).get('/api/astreintes?month=2025/06');
    expect(res.status).toBe(400);
  });

  test('GET /api/astreintes — retourne tableau vide pour mois sans astreinte', async () => {
    const res = await request(app).get('/api/astreintes?month=2020-01');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  test('POST /api/astreintes — happy path', async () => {
    const res = await authReq(app).post('/api/astreintes').send({
      date_iso: '2025-08-11', type_ast: 'astreinte', med_id: medId
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.med_id).toBe(medId);
    expect(res.body.med_nom).toBe('Dr Astreinte');
  });

  test('POST /api/astreintes — remplace une astreinte existante sur même date+type', async () => {
    const r2 = await authReq(app).post('/api/medecins').send({ nom: 'Dr Remplace', type: 'ph' });
    const id2 = r2.body.id;
    const res = await authReq(app).post('/api/astreintes').send({
      date_iso: '2025-08-11', type_ast: 'astreinte', med_id: id2
    });
    expect(res.status).toBe(200);
    expect(res.body.med_id).toBe(id2);
  });

  test('POST /api/astreintes — 400 si champs manquants', async () => {
    const res = await authReq(app).post('/api/astreintes').send({ date_iso: '2025-08-12' });
    expect(res.status).toBe(400);
  });

  test('POST /api/astreintes — 400 si type_ast invalide', async () => {
    const res = await authReq(app).post('/api/astreintes').send({
      date_iso: '2025-08-12', type_ast: 'INCONNU', med_id: medId
    });
    expect(res.status).toBe(400);
  });

  test('GET /api/astreintes — contient l\'astreinte créée', async () => {
    // Réinitialiser : créer une astreinte connue
    await authReq(app).post('/api/astreintes').send({
      date_iso: '2025-09-15', type_ast: 'csg1', med_id: medId
    });
    const res = await request(app).get('/api/astreintes?month=2025-09');
    expect(res.status).toBe(200);
    const row = res.body.find(r => r.med_id === medId && r.type_ast === 'csg1');
    expect(row).toBeDefined();
    expect(row.med_nom).toBe('Dr Astreinte');
  });

  test('DELETE /api/astreintes/:id — supprime', async () => {
    const create = await authReq(app).post('/api/astreintes').send({
      date_iso: '2025-10-01', type_ast: 'pont_rouge', med_id: medId
    });
    const id = create.body.id;
    const del = await authReq(app).delete(`/api/astreintes/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
    const list = await request(app).get('/api/astreintes?month=2025-10');
    expect(list.body.find(r => r.id === id)).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// STATISTIQUES
// ════════════════════════════════════════════════════════════════════════════

describe('Statistiques', () => {
  let medId;

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Stats', type: 'ph' });
    medId = res.body.id;
    const year = new Date().getFullYear();
    await authReq(app).post('/api/affectations').send({
      week_key: `${year}-03-03`, poste_id: 'ssr1', med_id: medId
    });
    await authReq(app).post('/api/absences').send({
      med_id: medId, date_debut: `${year}-04-01`, date_fin: `${year}-04-05`, type_abs: 'RTT'
    });
  });

  test('GET /api/stats/medecin/:medId — retourne affectations et absences', async () => {
    const res = await request(app).get(`/api/stats/medecin/${medId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.affectations)).toBe(true);
    expect(Array.isArray(res.body.absences)).toBe(true);
    expect(res.body.affectations.some(a => a.poste_id === 'ssr1')).toBe(true);
    expect(res.body.absences.some(a => a.type_abs === 'RTT')).toBe(true);
  });

  test('GET /api/stats/medecin/:medId — médecin inexistant retourne des tableaux vides', async () => {
    const res = await request(app).get('/api/stats/medecin/id_fantome');
    expect(res.status).toBe(200);
    expect(res.body.affectations).toEqual([]);
    expect(res.body.absences).toEqual([]);
  });

  test('GET /api/stats/all — retourne un tableau avec au moins 34 entrées', async () => {
    const res = await request(app).get('/api/stats/all');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(34);
    // Chaque entrée a med_id, affectations, absences
    const entry = res.body[0];
    expect(entry).toHaveProperty('med_id');
    expect(Array.isArray(entry.affectations)).toBe(true);
    expect(Array.isArray(entry.absences)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CONGÉS SELF-SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('Congés self-service', () => {
  let medId, validToken;

  function insertToken(suffix = '') {
    const now = new Date();
    const token = 'test_token_' + Date.now() + suffix;
    const expires = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
    dbLib.run(
      'INSERT INTO conge_tokens (token,med_id,created_at,expires_at) VALUES (?,?,?,?)',
      [token, medId, now.toISOString(), expires]
    );
    return token;
  }

  beforeAll(async () => {
    const res = await authReq(app).post('/api/medecins').send({ nom: 'Dr Conge', type: 'ph' });
    medId = res.body.id;
    validToken = insertToken('_base');
  });

  test('GET /api/conge/token/:token — token valide → 200 avec infos médecin', async () => {
    const res = await request(app).get(`/api/conge/token/${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.med_id).toBe(medId);
    expect(res.body.nom).toBe('Dr Conge');
  });

  test('GET /api/conge/token/:token — token inconnu → 404', async () => {
    const res = await request(app).get('/api/conge/token/token_inexistant');
    expect(res.status).toBe(404);
  });

  test('GET /api/conge/token/:token — token déjà utilisé → 410', async () => {
    const token = insertToken('_usedget');
    dbLib.run('UPDATE conge_tokens SET used_at=? WHERE token=?', [new Date().toISOString(), token]);
    const res = await request(app).get(`/api/conge/token/${token}`);
    expect(res.status).toBe(410);
  });

  test('POST /api/conge/submit — happy path', async () => {
    const token = insertToken('_submit');
    const res = await authReq(app).post('/api/conge/submit').send({
      token,
      absences: [{ date_debut: '2025-09-01', date_fin: '2025-09-05', type_abs: 'Congé annuel (CA)' }]
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.count).toBe(1);
  });

  test('POST /api/conge/submit — token invalidé après usage (pas de double soumission)', async () => {
    const token = insertToken('_once');
    // Première soumission : ok
    await authReq(app).post('/api/conge/submit').send({
      token,
      absences: [{ date_debut: '2025-10-01', date_fin: '2025-10-01', type_abs: 'RTT' }]
    });
    // Deuxième soumission avec le même token : 410 (déjà utilisé)
    const res2 = await authReq(app).post('/api/conge/submit').send({
      token,
      absences: [{ date_debut: '2025-10-02', date_fin: '2025-10-02', type_abs: 'RTT' }]
    });
    expect(res2.status).toBe(410);
  });

  test('POST /api/conge/submit — 400 si token manquant', async () => {
    const res = await authReq(app).post('/api/conge/submit').send({
      absences: [{ date_debut: '2025-09-01', date_fin: '2025-09-05', type_abs: 'RTT' }]
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/conge/submit — 400 si absences vide', async () => {
    const token = insertToken('_empty');
    const res = await authReq(app).post('/api/conge/submit').send({
      token, absences: []
    });
    expect(res.status).toBe(400);
  });

  test('GET /api/conge/preview — retourne praticiens actifs du type sélectionné', async () => {
    const res = await request(app).get('/api/conge/preview?types=ph');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Dr Conge est actif et de type ph
    expect(res.body.some(r => r.id === medId)).toBe(true);
  });

  test('GET /api/conge/preview — types vide → tableau vide', async () => {
    const res = await request(app).get('/api/conge/preview');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // ── P32 — Suivi de campagne ──────────────────────────

  function insertCampaign(types = ['ph']) {
    const row = dbLib.run(
      'INSERT INTO conge_campaigns (created_at, created_by, types) VALUES (?,?,?)',
      [new Date().toISOString(), null, JSON.stringify(types)]
    );
    return row.lastInsertRowid;
  }

  function insertCampaignToken(campaignId, suffix = '') {
    const now = new Date();
    const token = 'camp_token_' + Date.now() + suffix;
    const expires = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
    dbLib.run(
      'INSERT INTO conge_tokens (token,med_id,created_at,expires_at,campaign_id) VALUES (?,?,?,?,?)',
      [token, medId, now.toISOString(), expires, campaignId]
    );
    return token;
  }

  function gestReq(app) {
    const token = app._makeToken('gestionnaire');
    return { get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`) };
  }

  test('GET /api/conge/campaign/latest — sans campagne → null ou objet', async () => {
    const res = await gestReq(app).get('/api/conge/campaign/latest');
    expect(res.status).toBe(200);
    expect(res.body === null || typeof res.body === 'object').toBe(true);
  });

  test('GET /api/conge/campaign/latest — retourne la campagne avec membres', async () => {
    const campId = insertCampaign(['ph']);
    insertCampaignToken(campId, '_status');
    const res = await gestReq(app).get('/api/conge/campaign/latest');
    expect(res.status).toBe(200);
    expect(res.body).not.toBeNull();
    expect(res.body.id).toBe(campId);
    expect(Array.isArray(res.body.members)).toBe(true);
    const member = res.body.members.find(m => m.med_id === medId);
    expect(member).toBeDefined();
    expect(member.status).toBe('pending');
    expect(typeof member.ms_left).toBe('number');
  });

  test('GET /api/conge/campaign/latest — token utilisé → statut responded', async () => {
    const campId = insertCampaign(['ph']);
    const token = insertCampaignToken(campId, '_used');
    dbLib.run('UPDATE conge_tokens SET used_at=? WHERE token=?', [new Date().toISOString(), token]);
    const res = await gestReq(app).get('/api/conge/campaign/latest');
    expect(res.status).toBe(200);
    const member = res.body.members.find(m => m.med_id === medId);
    expect(member.status).toBe('responded');
  });

  test('GET /api/conge/campaign/latest — 401 sans JWT', async () => {
    const res = await request(app).get('/api/conge/campaign/latest');
    expect(res.status).toBe(401);
  });

  test('PUT /api/conge/campaign/extend/:medId — prolonge le token', async () => {
    const campId = insertCampaign(['ph']);
    insertCampaignToken(campId, '_ext');
    const res = await authReq(app).put(`/api/conge/campaign/extend/${medId}`).send({ hours: 24 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.expires_at).toBe('string');
  });

  test('PUT /api/conge/campaign/extend/:medId — 404 si token déjà utilisé', async () => {
    const campId = insertCampaign(['ph']);
    const token = insertCampaignToken(campId, '_extused');
    dbLib.run('UPDATE conge_tokens SET used_at=? WHERE token=?', [new Date().toISOString(), token]);
    const res = await authReq(app).put(`/api/conge/campaign/extend/${medId}`).send({ hours: 24 });
    expect(res.status).toBe(404);
  });

  test('PUT /api/conge/campaign/extend/:medId — 400 si hours invalide', async () => {
    const campId = insertCampaign(['ph']);
    insertCampaignToken(campId, '_extbad');
    const res = await authReq(app).put(`/api/conge/campaign/extend/${medId}`).send({ hours: 999 });
    expect(res.status).toBe(400);
  });

  test('PUT /api/conge/campaign/extend/:medId — 403 si rôle médecin', async () => {
    const campId = insertCampaign(['ph']);
    insertCampaignToken(campId, '_extmed');
    const medToken = app._makeToken('medecin');
    const res = await request(app)
      .put(`/api/conge/campaign/extend/${medId}`)
      .set('Authorization', `Bearer ${medToken}`)
      .send({ hours: 24 });
    expect(res.status).toBe(403);
  });

  test('POST /api/conge/campaign/resend/:medId — 401 sans JWT', async () => {
    const res = await request(app).post(`/api/conge/campaign/resend/${medId}`);
    expect(res.status).toBe(401);
  });

  test('POST /api/conge/campaign/resend/:medId — 403 si rôle médecin', async () => {
    const medToken = app._makeToken('medecin');
    const res = await request(app)
      .post(`/api/conge/campaign/resend/${medId}`)
      .set('Authorization', `Bearer ${medToken}`);
    expect(res.status).toBe(403);
  });

  // ── P32 — confirm + edit-token ──────────────────────────

  function submitToken(token) {
    dbLib.run('UPDATE conge_tokens SET used_at=? WHERE token=?', [new Date().toISOString(), token]);
  }

  function insertAbsenceWithToken(tok) {
    const row = dbLib.run(
      'INSERT INTO absences (med_id,date_debut,date_fin,type_abs,source_token) VALUES (?,?,?,?,?)',
      [medId, '2026-08-01', '2026-08-05', 'CA', tok]
    );
    return row.lastInsertRowid;
  }

  test('POST /api/conge/campaign/confirm/:medId — valide les absences non confirmées', async () => {
    const campId = insertCampaign(['ph']);
    const tok = insertCampaignToken(campId, '_confirm');
    submitToken(tok);
    insertAbsenceWithToken(tok);
    insertAbsenceWithToken(tok);
    const res = await authReq(app).post(`/api/conge/campaign/confirm/${medId}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.count).toBe(2);
    // Vérifier que les absences sont bien confirmées
    const abs = dbLib.queryAll('SELECT confirmed FROM absences WHERE source_token=?', [tok]);
    expect(abs.every(a => a.confirmed === 1)).toBe(true);
  });

  test('POST /api/conge/campaign/confirm/:medId — 404 si aucune réponse', async () => {
    const campId = insertCampaign(['ph']);
    insertCampaignToken(campId, '_confno'); // token non utilisé
    const res = await authReq(app).post(`/api/conge/campaign/confirm/${medId}`);
    expect(res.status).toBe(404);
  });

  test('POST /api/conge/campaign/confirm/:medId — 403 si rôle médecin', async () => {
    const medToken = app._makeToken('medecin');
    const res = await request(app)
      .post(`/api/conge/campaign/confirm/${medId}`)
      .set('Authorization', `Bearer ${medToken}`);
    expect(res.status).toBe(403);
  });

  test('POST /api/conge/campaign/edit-token/:medId — crée un nouveau token et supprime absences non confirmées', async () => {
    const campId = insertCampaign(['ph']);
    const tok = insertCampaignToken(campId, '_edit');
    submitToken(tok);
    const absId = insertAbsenceWithToken(tok);
    const res = await authReq(app).post(`/api/conge/campaign/edit-token/${medId}`).send({ base_url: 'http://localhost' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.url).toMatch(/\/conge\//);
    // L'absence non confirmée doit avoir été supprimée
    const abs = dbLib.queryOne('SELECT id FROM absences WHERE id=?', [absId]);
    expect(abs).toBeNull();
  });

  test('POST /api/conge/campaign/edit-token/:medId — préserve les absences confirmées', async () => {
    const campId = insertCampaign(['ph']);
    const tok = insertCampaignToken(campId, '_editconf');
    submitToken(tok);
    const absId = insertAbsenceWithToken(tok);
    dbLib.run('UPDATE absences SET confirmed=1 WHERE id=?', [absId]);
    await authReq(app).post(`/api/conge/campaign/edit-token/${medId}`).send({ base_url: 'http://localhost' });
    // L'absence confirmée doit être préservée
    const abs = dbLib.queryOne('SELECT id FROM absences WHERE id=?', [absId]);
    expect(abs).not.toBeNull();
  });

  test('POST /api/conge/campaign/edit-token/:medId — 403 si rôle médecin', async () => {
    const medToken = app._makeToken('medecin');
    const res = await request(app)
      .post(`/api/conge/campaign/edit-token/${medId}`)
      .set('Authorization', `Bearer ${medToken}`);
    expect(res.status).toBe(403);
  });

  test('PATCH /api/absences/:id/confirm — confirme une absence individuelle', async () => {
    const row = dbLib.run(
      'INSERT INTO absences (med_id,date_debut,date_fin,type_abs) VALUES (?,?,?,?)',
      [medId, '2026-09-01', '2026-09-02', 'CA']
    );
    const id = row.lastInsertRowid;
    const res = await authReq(app).patch(`/api/absences/${id}/confirm`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const abs = dbLib.queryOne('SELECT confirmed FROM absences WHERE id=?', [id]);
    expect(abs.confirmed).toBe(1);
  });

  test('PATCH /api/absences/:id/confirm — 404 si absence inexistante', async () => {
    const res = await authReq(app).patch('/api/absences/99999/confirm');
    expect(res.status).toBe(404);
  });

  test('PATCH /api/absences/:id/confirm — 403 si rôle médecin', async () => {
    const row = dbLib.run(
      'INSERT INTO absences (med_id,date_debut,date_fin,type_abs) VALUES (?,?,?,?)',
      [medId, '2026-09-03', '2026-09-03', 'RTT']
    );
    const medToken = app._makeToken('medecin');
    const res = await request(app)
      .patch(`/api/absences/${row.lastInsertRowid}/confirm`)
      .set('Authorization', `Bearer ${medToken}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/conge/campaign/latest — responded member inclut absences + all_confirmed', async () => {
    const campId = insertCampaign(['ph']);
    const tok = insertCampaignToken(campId, '_latabs');
    submitToken(tok);
    insertAbsenceWithToken(tok);
    const res = await gestReq(app).get('/api/conge/campaign/latest');
    expect(res.status).toBe(200);
    const member = res.body.members.find(m => m.med_id === medId && m.status === 'responded');
    expect(member).toBeDefined();
    expect(Array.isArray(member.absences)).toBe(true);
    expect(member.absences.length).toBeGreaterThan(0);
    expect(typeof member.all_confirmed).toBe('boolean');
    expect(member.token).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// VALIDATION P1.3 — med_id inexistant
// ════════════════════════════════════════════════════════════════════════════

describe('Validation P1.3 — med_id inconnu', () => {
  const MED_ID_FANTOME = 'med_fantome_xyz';

  test('POST /api/absences — med_id inconnu → 400', async () => {
    const res = await authReq(app).post('/api/absences').send({
      med_id: MED_ID_FANTOME, date_debut: '2025-06-02', date_fin: '2025-06-06', type_abs: 'RTT'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/med_id inconnu/);
  });

  test('POST /api/affectations — med_id inconnu → 400', async () => {
    const res = await authReq(app).post('/api/affectations').send({
      week_key: WEEK_KEY, poste_id: 'ssr1', med_id: MED_ID_FANTOME
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/med_id inconnu/);
  });

  test('POST /api/astreintes — med_id inconnu → 400', async () => {
    const res = await authReq(app).post('/api/astreintes').send({
      date_iso: '2025-08-15', type_ast: 'astreinte', med_id: MED_ID_FANTOME
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/med_id inconnu/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// P31 — GESTIONNAIRES & AUDIT LOG
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/gestionnaires', () => {
  test('retourne un tableau', async () => {
    const res = await request(app).get('/api/gestionnaires')
      .set('Authorization', `Bearer ${app._makeToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('401 sans token', async () => {
    const res = await request(app).get('/api/gestionnaires');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/gestionnaires', () => {
  test('crée un gestionnaire et le retourne', async () => {
    const res = await authReq(app).post('/api/gestionnaires').send({
      nom: 'Alice Test', email: 'alice@test.fr', password: 'azerty123',
    });
    expect(res.status).toBe(201);
    expect(res.body.nom).toBe('Alice Test');
    expect(res.body.email).toBe('alice@test.fr');
    expect(res.body.password_hash).toBeUndefined();
  });

  test('409 si email déjà utilisé', async () => {
    await authReq(app).post('/api/gestionnaires').send({
      nom: 'Bob Test', email: 'bob@test.fr', password: 'azerty123',
    });
    const res = await authReq(app).post('/api/gestionnaires').send({
      nom: 'Bob Doublon', email: 'bob@test.fr', password: 'azerty123',
    });
    expect(res.status).toBe(409);
  });

  test('400 si mot de passe trop court', async () => {
    const res = await authReq(app).post('/api/gestionnaires').send({
      nom: 'Court', email: 'court@test.fr', password: '123',
    });
    expect(res.status).toBe(400);
  });

  test('400 si email invalide', async () => {
    const res = await authReq(app).post('/api/gestionnaires').send({
      nom: 'Invalid', email: 'pas-un-email', password: 'azerty123',
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/gestionnaires/:id', () => {
  let targetId;

  beforeAll(async () => {
    const r = await authReq(app).post('/api/gestionnaires').send({
      nom: 'Cible Update', email: 'cible.update@test.fr', password: 'azerty123',
    });
    targetId = r.body.id;
  });

  test('modifie nom et email', async () => {
    const res = await authReq(app).put(`/api/gestionnaires/${targetId}`).send({
      nom: 'Cible Modifiée', email: 'cible.modifiee@test.fr',
    });
    expect(res.status).toBe(200);
    expect(res.body.nom).toBe('Cible Modifiée');
  });

  test('404 si id inconnu', async () => {
    const res = await authReq(app).put('/api/gestionnaires/99999').send({
      nom: 'Fantôme', email: 'fantome@test.fr',
    });
    expect(res.status).toBe(404);
  });

  test('403 si on tente de modifier son propre compte', async () => {
    const r = await authReq(app).post('/api/gestionnaires').send({
      nom: 'Self Edit', email: 'self.edit@test.fr', password: 'azerty123',
    });
    const selfId = r.body.id;
    const token = app._makeToken('gestionnaire', selfId);
    const res = await request(app).put(`/api/gestionnaires/${selfId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nom: 'Self Modifié', email: 'self.modifie@test.fr' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/gestionnaires/:id', () => {
  test('supprime un gestionnaire existant', async () => {
    const r = await authReq(app).post('/api/gestionnaires').send({
      nom: 'À Supprimer', email: 'del@test.fr', password: 'azerty123',
    });
    const id = r.body.id;
    const res = await authReq(app).delete(`/api/gestionnaires/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const check = await request(app).get('/api/gestionnaires')
      .set('Authorization', `Bearer ${app._makeToken()}`);
    expect(check.body.some(g => g.id === id)).toBe(false);
  });

  test('403 si on tente de supprimer son propre compte', async () => {
    const r = await authReq(app).post('/api/gestionnaires').send({
      nom: 'Self Del', email: 'self.del@test.fr', password: 'azerty123',
    });
    const selfId = r.body.id;
    const token = app._makeToken('gestionnaire', selfId);
    const res = await request(app).delete(`/api/gestionnaires/${selfId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('404 si id inconnu', async () => {
    const res = await authReq(app).delete('/api/gestionnaires/99999');
    expect(res.status).toBe(404);
  });

  test('409 si tentative de supprimer le dernier gestionnaire', async () => {
    const Database = require('better-sqlite3');
    const { applySchema } = require('../db_schema');
    const { createApp } = require('../index');
    const bcrypt = require('bcryptjs');

    const dbIso = new Database(':memory:');
    dbIso.pragma('foreign_keys = ON');
    applySchema(dbIso);

    const dbLibIso = {
      queryOne: (sql, p = []) => dbIso.prepare(sql).get(...p) || null,
      queryAll: (sql, p = []) => dbIso.prepare(sql).all(...p),
      run:      (sql, p = []) => {
        const info = dbIso.prepare(sql).run(...p);
        return { lastInsertRowid: info.lastInsertRowid };
      },
      transaction: (fn) => dbIso.transaction(fn)(),
    };

    const hash = await bcrypt.hash('testpwd', 10);
    dbIso.prepare('INSERT INTO users (nom, email, password_hash) VALUES (?,?,?)')
      .run('Unique Admin', 'unique@test.fr', hash);

    const isoApp = createApp(dbLibIso);
    isoApp._setDbReady();

    // id=1 (le seul compte) ; token d'un user différent (id=999) pour éviter le 403 auto-delete
    const token = isoApp._makeToken('gestionnaire', 999);
    const res = await request(isoApp).delete('/api/gestionnaires/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/dernier/);
  });
});

describe('PUT /api/auth/change-password', () => {
  let userId;
  const EMAIL = 'chpwd@test.fr';
  const OLD_PWD = 'ancien123';
  const NEW_PWD = 'nouveau456';

  beforeAll(async () => {
    const r = await authReq(app).post('/api/gestionnaires').send({
      nom: 'Change Pwd', email: EMAIL, password: OLD_PWD,
    });
    userId = r.body.id;
  });

  test('change le mot de passe avec un bon ancien mdp', async () => {
    const token = app._makeToken('gestionnaire', userId);
    const res = await request(app).put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: OLD_PWD, newPassword: NEW_PWD });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('401 si ancien mot de passe incorrect', async () => {
    const token = app._makeToken('gestionnaire', userId);
    const res = await request(app).put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'mauvais', newPassword: 'nouveau789' });
    expect(res.status).toBe(401);
  });

  test('400 si nouveau mot de passe trop court', async () => {
    const token = app._makeToken('gestionnaire', userId);
    const res = await request(app).put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: NEW_PWD, newPassword: '123' });
    expect(res.status).toBe(400);
  });

  test('404 si userId absent du token', async () => {
    const token = app._makeToken('gestionnaire'); // pas de userId
    const res = await request(app).put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: OLD_PWD, newPassword: 'nouveau789' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/audit-log', () => {
  test('retourne la structure paginée', async () => {
    const res = await request(app).get('/api/audit-log')
      .set('Authorization', `Bearer ${app._makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('totalPages');
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  test('filtre par action', async () => {
    const res = await request(app).get('/api/audit-log?action=CREATE')
      .set('Authorization', `Bearer ${app._makeToken()}`);
    expect(res.status).toBe(200);
    res.body.rows.forEach(r => expect(r.action.toUpperCase()).toBe('CREATE'));
  });

  test('400 si page invalide', async () => {
    const res = await request(app).get('/api/audit-log?page=0')
      .set('Authorization', `Bearer ${app._makeToken()}`);
    expect(res.status).toBe(400);
  });

  test('400 si from invalide', async () => {
    const res = await request(app).get('/api/audit-log?from=pas-une-date')
      .set('Authorization', `Bearer ${app._makeToken()}`);
    expect(res.status).toBe(400);
  });

  test('401 sans token', async () => {
    const res = await request(app).get('/api/audit-log');
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FERMETURES DE SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('Fermetures de service', () => {
  test('GET /api/fermetures — 401 sans token', async () => {
    const res = await request(app).get('/api/fermetures');
    expect(res.status).toBe(401);
  });

  test('GET /api/fermetures — 200 avec token médecin (lecture seule)', async () => {
    const res = await request(app).get('/api/fermetures')
      .set('Authorization', `Bearer ${app._makeToken('medecin')}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/fermetures — 403 avec token médecin', async () => {
    const res = await request(app).post('/api/fermetures')
      .set('Authorization', `Bearer ${app._makeToken('medecin')}`)
      .send({ poste_id: 'hdj', date_debut: '2026-07-15', date_fin: '2026-08-15', label: 'Test' });
    expect(res.status).toBe(403);
  });

  test('POST /api/fermetures — 400 si date non-ISO', async () => {
    const res = await authReq(app).post('/api/fermetures')
      .send({ poste_id: 'hdj', date_debut: 'pas-une-date', date_fin: '2026-08-15' });
    expect(res.status).toBe(400);
  });

  test('POST /api/fermetures — 400 si date_fin avant date_debut', async () => {
    const res = await authReq(app).post('/api/fermetures')
      .send({ poste_id: 'hdj', date_debut: '2026-08-15', date_fin: '2026-07-01' });
    expect(res.status).toBe(400);
  });

  test('POST + GET + DELETE fermeture — cycle complet', async () => {
    const createRes = await authReq(app).post('/api/fermetures')
      .send({ poste_id: 'hdj', date_debut: '2026-07-15', date_fin: '2026-08-15', label: 'Fermeture estivale' });
    expect(createRes.status).toBe(200);
    const id = createRes.body.id;
    expect(id).toBeGreaterThan(0);

    const listRes = await request(app).get('/api/fermetures')
      .set('Authorization', `Bearer ${app._makeToken()}`);
    expect(listRes.body.some(f => f.id === id)).toBe(true);

    const delRes = await authReq(app).delete(`/api/fermetures/${id}`);
    expect(delRes.status).toBe(200);

    const afterDel = await request(app).get('/api/fermetures')
      .set('Authorization', `Bearer ${app._makeToken()}`);
    expect(afterDel.body.some(f => f.id === id)).toBe(false);
  });

  test('DELETE /api/fermetures/:id — 404 si ID inexistant', async () => {
    const res = await authReq(app).delete('/api/fermetures/99999');
    expect(res.status).toBe(404);
  });
});
