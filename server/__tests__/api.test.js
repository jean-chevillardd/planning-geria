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
    const res = await request(app).post('/api/medecins').send(TEST_MED);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.nom).toBe(TEST_MED.nom);
    expect(res.body.type).toBe(TEST_MED.type);
    expect(Array.isArray(res.body.sched)).toBe(true);
    createdId = res.body.id;
  });

  test('sched par défaut = 10 x 1 si non fourni', async () => {
    const res = await request(app).post('/api/medecins').send({ nom: 'Dr Sched', type: 'interne' });
    expect(res.status).toBe(200);
    expect(res.body.sched).toEqual([1,1,1,1,1,1,1,1,1,1]);
  });

  test('sched personnalisé accepté', async () => {
    const customSched = [1,0,1,0,1,0,1,0,1,0];
    const res = await request(app).post('/api/medecins').send({ nom: 'Dr Mi-temps', type: 'ph', sched: customSched });
    expect(res.status).toBe(200);
    expect(res.body.sched).toEqual(customSched);
  });

  test('400 si nom manquant', async () => {
    const res = await request(app).post('/api/medecins').send({ type: 'ph' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400 si type manquant', async () => {
    const res = await request(app).post('/api/medecins').send({ nom: 'Dr X' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400 si body vide', async () => {
    const res = await request(app).post('/api/medecins').send({});
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/medecins/:id', () => {
  let medId;

  beforeAll(async () => {
    const res = await request(app).post('/api/medecins').send({ nom: 'Dr Edit', type: 'ipa' });
    medId = res.body.id;
  });

  test('met à jour le nom', async () => {
    const res = await request(app).put(`/api/medecins/${medId}`).send({ nom: 'Dr Edité' });
    expect(res.status).toBe(200);
    expect(res.body.nom).toBe('Dr Edité');
  });

  test('met à jour le type', async () => {
    const res = await request(app).put(`/api/medecins/${medId}`).send({ type: 'padhue' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('padhue');
  });

  test('met à jour le sched (tableau)', async () => {
    const newSched = [1,0,1,0,0,0,1,0,1,0];
    const res = await request(app).put(`/api/medecins/${medId}`).send({ sched: newSched });
    expect(res.status).toBe(200);
    expect(res.body.sched).toEqual(newSched);
  });

  test('met à jour le sched (chaîne)', async () => {
    const res = await request(app).put(`/api/medecins/${medId}`).send({ sched: '1111000000' });
    expect(res.status).toBe(200);
    expect(res.body.sched).toEqual([1,1,1,1,0,0,0,0,0,0]);
  });

  test('ID inexistant — retourne 404', async () => {
    const res = await request(app).put('/api/medecins/id_qui_nexiste_pas').send({ nom: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/medecins/:id', () => {
  test('supprime un médecin existant', async () => {
    const create = await request(app).post('/api/medecins').send({ nom: 'Dr ToDelete', type: 'externe' });
    const id = create.body.id;
    const del = await request(app).delete(`/api/medecins/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    // Vérifier qu'il n'est plus dans la liste
    const list = await request(app).get('/api/medecins');
    expect(list.body.find(m => m.id === id)).toBeUndefined();
  });

  test('supprime aussi les données associées (cascade manuelle)', async () => {
    // Créer un médecin
    const cr = await request(app).post('/api/medecins').send({ nom: 'Dr Cascade', type: 'ph' });
    const id = cr.body.id;
    // Lui affecter une absence
    await request(app).post('/api/absences').send({
      med_id: id, date_debut: '2025-06-02', date_fin: '2025-06-06', type_abs: 'Congé annuel (CA)'
    });
    // Supprimer
    await request(app).delete(`/api/medecins/${id}`);
    // Vérifier qu'aucune absence orpheline ne subsiste
    const abs = await request(app).get('/api/absences');
    expect(abs.body.find(a => a.med_id === id)).toBeUndefined();
  });

  test('ID inexistant — retourne quand même ok:true (idempotent)', async () => {
    const res = await request(app).delete('/api/medecins/id_fantome');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ABSENCES
// ════════════════════════════════════════════════════════════════════════════

describe('Absences CRUD', () => {
  let medId, absId;

  beforeAll(async () => {
    const res = await request(app).post('/api/medecins').send({ nom: 'Dr Abs', type: 'ph' });
    medId = res.body.id;
  });

  test('GET /api/absences — retourne tableau', async () => {
    const res = await request(app).get('/api/absences');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/absences — happy path', async () => {
    const res = await request(app).post('/api/absences').send({
      med_id: medId, date_debut: '2025-06-02', date_fin: '2025-06-06', type_abs: 'Congé annuel (CA)'
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.med_id).toBe(medId);
    absId = res.body.id;
  });

  test('POST /api/absences — absence d\'un seul jour', async () => {
    const res = await request(app).post('/api/absences').send({
      med_id: medId, date_debut: '2025-06-10', date_fin: '2025-06-10', type_abs: 'RTT'
    });
    expect(res.status).toBe(200);
  });

  test('POST /api/absences — 400 si champ manquant', async () => {
    const res = await request(app).post('/api/absences').send({
      med_id: medId, date_debut: '2025-06-02'
      // date_fin et type_abs manquants
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/absences — 400 si date_fin < date_debut', async () => {
    const res = await request(app).post('/api/absences').send({
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
    const res = await request(app).delete(`/api/absences/${absId}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const list = await request(app).get('/api/absences');
    expect(list.body.find(a => a.id === absId)).toBeUndefined();
  });

  test('DELETE /api/absences/:id inexistant — idempotent', async () => {
    const res = await request(app).delete('/api/absences/999999');
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
    const res = await request(app).post('/api/medecins').send({ nom: 'Dr Affecté', type: 'ph' });
    medId = res.body.id;
  });

  test('POST /api/affectations — happy path', async () => {
    const res = await request(app).post('/api/affectations').send({
      week_key: WEEK_KEY, poste_id: 'csg1a', med_id: medId
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST /api/affectations — idempotent (double insertion ignorée)', async () => {
    const res = await request(app).post('/api/affectations').send({
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
    const res = await request(app).post('/api/affectations').send({ week_key: WEEK_KEY });
    expect(res.status).toBe(400);
  });

  test('DELETE /api/affectations — supprime', async () => {
    const res = await request(app).delete('/api/affectations').send({
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
    await request(app).post('/api/affectations').send({ week_key: WEEK_KEY, poste_id: 'csg1b', med_id: medId });
    await request(app).post('/api/exclusions').send({ week_key: WEEK_KEY, poste_id: 'csg1b', med_id: medId, jour: '2025-06-03' });

    let plan = await request(app).get(`/api/planning/${WEEK_KEY}`);
    expect(plan.body.exclusions.some(e => e.med_id === medId)).toBe(true);

    // Retirer l'affectation
    await request(app).delete('/api/affectations').send({ week_key: WEEK_KEY, poste_id: 'csg1b', med_id: medId });

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
    const res = await request(app).post('/api/medecins').send({ nom: 'Dr Exclu', type: 'ph' });
    medId = res.body.id;
    await request(app).post('/api/affectations').send({ week_key: WEEK_KEY, poste_id: 'hdj', med_id: medId });
  });

  test('POST /api/exclusions — happy path', async () => {
    const res = await request(app).post('/api/exclusions').send({
      week_key: WEEK_KEY, poste_id: 'hdj', med_id: medId, jour: '2025-06-04'
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST /api/exclusions — idempotent', async () => {
    const res = await request(app).post('/api/exclusions').send({
      week_key: WEEK_KEY, poste_id: 'hdj', med_id: medId, jour: '2025-06-04'
    });
    expect(res.status).toBe(200);
  });

  test('Planning contient l\'exclusion', async () => {
    const res = await request(app).get(`/api/planning/${WEEK_KEY}`);
    expect(res.body.exclusions.some(e => e.med_id === medId && e.jour === '2025-06-04')).toBe(true);
  });

  test('DELETE /api/exclusions — supprime', async () => {
    const res = await request(app).delete('/api/exclusions').send({
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
    const res = await request(app).post('/api/medecins').send({ nom: 'Dr Extra', type: 'ph' });
    medId = res.body.id;
  });

  test('POST /api/extras — happy path', async () => {
    const res = await request(app).post('/api/extras').send({
      week_key: WEEK_KEY, poste_id: 'ssr3', med_id: medId, jour: '2025-06-02'
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST /api/extras — idempotent', async () => {
    const res = await request(app).post('/api/extras').send({
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
    const res = await request(app).delete('/api/extras').send({
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
    const res = await request(app).post('/api/medecins').send({ nom: 'Dr Copy', type: 'ph' });
    medId = res.body.id;
    // Setup semaine source
    await request(app).post('/api/affectations').send({ week_key: '2025-05-26', poste_id: 'ucc', med_id: medId });
    await request(app).post('/api/exclusions').send({ week_key: '2025-05-26', poste_id: 'ucc', med_id: medId, jour: '2025-05-27' });
  });

  test('happy path — copie affectations + exclusions de la semaine source', async () => {
    const res = await request(app).post('/api/planning/copy').send({
      from_week: '2025-05-26', to_week: '2025-06-16'
    });
    expect(res.status).toBe(200);
    const plan = await request(app).get('/api/planning/2025-06-16');
    expect(plan.body.affectations['ucc']?.medecins.some(m => m.id === medId)).toBe(true);
  });

  test('écrase les affectations existantes de la semaine cible', async () => {
    const r2 = await request(app).post('/api/medecins').send({ nom: 'Dr ToOverwrite', type: 'ipa' });
    await request(app).post('/api/affectations').send({ week_key: '2025-06-23', poste_id: 'emg', med_id: r2.body.id });
    // Copier depuis semaine vide : la semaine cible doit être effacée
    const res = await request(app).post('/api/planning/copy').send({
      from_week: '2020-01-06', to_week: '2025-06-23'
    });
    expect(res.status).toBe(200);
    const plan = await request(app).get('/api/planning/2025-06-23');
    expect(plan.body.affectations['emg']).toBeUndefined();
  });

  test('400 si from_week manquant', async () => {
    const res = await request(app).post('/api/planning/copy').send({ to_week: '2025-06-16' });
    expect(res.status).toBe(400);
  });

  test('400 si to_week manquant', async () => {
    const res = await request(app).post('/api/planning/copy').send({ from_week: '2025-05-26' });
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
  test('Un médecin peut être affecter à plusieurs postes différents la même semaine', async () => {
    // NOTE : la logique de "un médecin = un poste max" est côté CLIENT (AssignModal),
    // pas côté serveur. Le serveur accepte des affectations multiples.
    const r = await request(app).post('/api/medecins').send({ nom: 'Dr Multi', type: 'ph' });
    const id = r.body.id;
    await request(app).post('/api/affectations').send({ week_key: '2025-07-07', poste_id: 'csg1a', med_id: id });
    const res2 = await request(app).post('/api/affectations').send({ week_key: '2025-07-07', poste_id: 'csg2a', med_id: id });
    // Le serveur l'accepte (la contrainte unique est (week_key, poste_id, med_id))
    expect(res2.status).toBe(200);
  });

  test('Les absences couvrant la semaine apparaissent dans le planning', async () => {
    const r = await request(app).post('/api/medecins').send({ nom: 'Dr AbsWeek', type: 'ph' });
    const id = r.body.id;
    // Absence du lundi au vendredi
    await request(app).post('/api/absences').send({
      med_id: id, date_debut: '2025-07-14', date_fin: '2025-07-18', type_abs: 'Congé annuel (CA)'
    });
    // Affecter à un poste cette semaine
    await request(app).post('/api/affectations').send({ week_key: '2025-07-14', poste_id: 'emg', med_id: id });

    const plan = await request(app).get('/api/planning/2025-07-14');
    // L'absence doit figurer dans le planning
    expect(plan.body.absences.some(a => a.med_id === id)).toBe(true);
  });

  test('Une exclusion n\'empêche pas d\'affecter à la semaine', async () => {
    const r = await request(app).post('/api/medecins').send({ nom: 'Dr ExclTest', type: 'ph' });
    const id = r.body.id;
    await request(app).post('/api/affectations').send({ week_key: '2025-07-21', poste_id: 'csg1a', med_id: id });
    await request(app).post('/api/exclusions').send({ week_key: '2025-07-21', poste_id: 'csg1a', med_id: id, jour: '2025-07-21' });

    const plan = await request(app).get('/api/planning/2025-07-21');
    // Médecin affecté mais exclu ce jour
    expect(plan.body.affectations['csg1a']?.medecins.some(m => m.id === id)).toBe(true);
    expect(plan.body.exclusions.some(e => e.med_id === id && e.jour === '2025-07-21')).toBe(true);
  });

  test('Les absences chevauchant partiellement la semaine sont incluses', async () => {
    const r = await request(app).post('/api/medecins').send({ nom: 'Dr AbsPartial', type: 'ph' });
    const id = r.body.id;
    // Absence qui commence avant et se termine en milieu de semaine
    await request(app).post('/api/absences').send({
      med_id: id, date_debut: '2025-07-21', date_fin: '2025-07-23', type_abs: 'RTT'
    });

    const plan = await request(app).get('/api/planning/2025-07-21');
    expect(plan.body.absences.some(a => a.med_id === id)).toBe(true);
  });

  test('Contrainte UNIQUE sur affectations empêche les doublons en base', async () => {
    // INSERT OR IGNORE doit gérer les doublons sans erreur
    const r = await request(app).post('/api/medecins').send({ nom: 'Dr Unique', type: 'ph' });
    const id = r.body.id;
    await request(app).post('/api/affectations').send({ week_key: '2025-08-04', poste_id: 'ssr4', med_id: id });
    await request(app).post('/api/affectations').send({ week_key: '2025-08-04', poste_id: 'ssr4', med_id: id });
    await request(app).post('/api/affectations').send({ week_key: '2025-08-04', poste_id: 'ssr4', med_id: id });

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
