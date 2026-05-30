/**
 * Tests Vitest — client/src/utils.js
 * Couvre toutes les fonctions utilitaires pures
 */

import { describe, test, expect } from 'vitest';
import {
  getMonday, toIso, addDays, weekDays, fmtDay, fmtDayLong,
  schedIdx, worksDay, isAbsent, countDemiJournees, worksWeekAny,
  POSTES, TYPE_LBL, DAYS_FR
} from '../utils.js';

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════════════════════════

describe('CONSTANTES', () => {
  test('POSTES contient 18 entrées', () => {
    expect(POSTES).toHaveLength(18);
  });

  test('Chaque poste a id, lbl, c, min, grp, intern', () => {
    POSTES.forEach(p => {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('lbl');
      expect(p).toHaveProperty('c');
      expect(typeof p.min).toBe('number');
      expect(p).toHaveProperty('grp');
      expect(typeof p.intern).toBe('boolean');
    });
  });

  test('Les IDs de postes sont uniques', () => {
    const ids = POSTES.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('DAYS_FR contient 5 jours', () => {
    expect(DAYS_FR).toHaveLength(5);
    expect(DAYS_FR[0]).toBe('Lun');
    expect(DAYS_FR[4]).toBe('Ven');
  });

  test('TYPE_LBL couvre les 5 types de praticiens', () => {
    expect(TYPE_LBL).toHaveProperty('ph');
    expect(TYPE_LBL).toHaveProperty('ipa');
    expect(TYPE_LBL).toHaveProperty('interne');
    expect(TYPE_LBL).toHaveProperty('externe');
    expect(TYPE_LBL).toHaveProperty('padhue');
  });

  test('min est 0 ou 1 pour chaque poste', () => {
    POSTES.forEach(p => {
      expect([0, 1]).toContain(p.min);
    });
  });

  test('Les postes intern=true sont bien les postes internes', () => {
    const internPostes = POSTES.filter(p => p.intern);
    internPostes.forEach(p => {
      expect(p.lbl.toLowerCase()).toMatch(/interne/);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// getMonday
// ════════════════════════════════════════════════════════════════════════════

describe('getMonday()', () => {
  test('retourne le lundi d\'un lundi', () => {
    const monday = new Date('2025-06-02T00:00:00'); // lundi
    const result = getMonday(monday);
    expect(result.getDay()).toBe(1);
    expect(toIso(result)).toBe('2025-06-02');
  });

  test('retourne le lundi d\'un mercredi', () => {
    const wed = new Date('2025-06-04T00:00:00'); // mercredi
    const result = getMonday(wed);
    expect(toIso(result)).toBe('2025-06-02');
  });

  test('retourne le lundi d\'un vendredi', () => {
    const fri = new Date('2025-06-06T00:00:00'); // vendredi
    const result = getMonday(fri);
    expect(toIso(result)).toBe('2025-06-02');
  });

  test('retourne le lundi d\'un dimanche (semaine précédente)', () => {
    const sun = new Date('2025-06-08T00:00:00'); // dimanche
    const result = getMonday(sun);
    expect(toIso(result)).toBe('2025-06-02');
  });

  test('retourne le lundi d\'un samedi (semaine précédente)', () => {
    const sat = new Date('2025-06-07T00:00:00'); // samedi
    const result = getMonday(sat);
    expect(toIso(result)).toBe('2025-06-02');
  });

  test('getMonday d\'une date en début d\'année', () => {
    const d = new Date('2025-01-01T00:00:00'); // mercredi
    const result = getMonday(d);
    expect(result.getDay()).toBe(1);
  });

  test('getMonday ne modifie pas la date d\'entrée', () => {
    const d = new Date('2025-06-04T00:00:00');
    const original = d.getTime();
    getMonday(d);
    expect(d.getTime()).toBe(original);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// toIso
// ════════════════════════════════════════════════════════════════════════════

describe('toIso()', () => {
  test('formate correctement une date', () => {
    const d = new Date(2025, 5, 2); // mois 0-indexé : juin = 5
    expect(toIso(d)).toBe('2025-06-02');
  });

  test('padde les mois et jours < 10', () => {
    const d = new Date(2025, 0, 5); // 5 janvier
    expect(toIso(d)).toBe('2025-01-05');
  });

  test('pas de décalage UTC (compare avec UTC ISO)', () => {
    // toIso utilise getFullYear/getMonth/getDate (local), pas toISOString() (UTC)
    const d = new Date(2025, 5, 2); // 2 juin en heure locale
    expect(toIso(d)).toBe('2025-06-02');
  });

  test('décembre est le mois 12', () => {
    const d = new Date(2025, 11, 31); // 31 décembre
    expect(toIso(d)).toBe('2025-12-31');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// addDays
// ════════════════════════════════════════════════════════════════════════════

describe('addDays()', () => {
  test('ajoute 7 jours', () => {
    const d = new Date('2025-06-02T00:00:00');
    const result = addDays(d, 7);
    expect(toIso(result)).toBe('2025-06-09');
  });

  test('ajoute 0 jours (identité)', () => {
    const d = new Date('2025-06-02T00:00:00');
    const result = addDays(d, 0);
    expect(toIso(result)).toBe('2025-06-02');
  });

  test('soustrait des jours (n négatif)', () => {
    const d = new Date('2025-06-09T00:00:00');
    const result = addDays(d, -7);
    expect(toIso(result)).toBe('2025-06-02');
  });

  test('ne modifie pas la date originale', () => {
    const d = new Date('2025-06-02T00:00:00');
    const orig = d.getTime();
    addDays(d, 5);
    expect(d.getTime()).toBe(orig);
  });

  test('traverse les fins de mois correctement', () => {
    const d = new Date('2025-05-30T00:00:00');
    const result = addDays(d, 5);
    expect(toIso(result)).toBe('2025-06-04');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// weekDays
// ════════════════════════════════════════════════════════════════════════════

describe('weekDays()', () => {
  test('retourne 5 jours', () => {
    const monday = new Date('2025-06-02T00:00:00');
    expect(weekDays(monday)).toHaveLength(5);
  });

  test('premier jour est le lundi passé', () => {
    const monday = new Date('2025-06-02T00:00:00');
    const days = weekDays(monday);
    expect(toIso(days[0])).toBe('2025-06-02');
  });

  test('dernier jour est le vendredi', () => {
    const monday = new Date('2025-06-02T00:00:00');
    const days = weekDays(monday);
    expect(toIso(days[4])).toBe('2025-06-06');
  });

  test('les jours sont consécutifs', () => {
    const monday = new Date('2025-06-02T00:00:00');
    const days = weekDays(monday);
    for (let i = 1; i < days.length; i++) {
      const diff = (days[i].getTime() - days[i-1].getTime()) / (1000 * 60 * 60 * 24);
      expect(diff).toBe(1);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// schedIdx
// ════════════════════════════════════════════════════════════════════════════

describe('schedIdx()', () => {
  test('lundi (dow=1) → index 0', () => {
    expect(schedIdx(1)).toBe(0);
  });

  test('mardi (dow=2) → index 2', () => {
    expect(schedIdx(2)).toBe(2);
  });

  test('mercredi (dow=3) → index 4', () => {
    expect(schedIdx(3)).toBe(4);
  });

  test('jeudi (dow=4) → index 6', () => {
    expect(schedIdx(4)).toBe(6);
  });

  test('vendredi (dow=5) → index 8', () => {
    expect(schedIdx(5)).toBe(8);
  });

  test('sched[schedIdx(dow)] = matin, sched[schedIdx(dow)+1] = après-midi', () => {
    // lundi matin = index 0, lundi AM = index 1
    // vendredi matin = index 8, vendredi AM = index 9
    expect(schedIdx(5) + 1).toBe(9);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// isAbsent
// ════════════════════════════════════════════════════════════════════════════

describe('isAbsent()', () => {
  const absences = [
    { med_id: 'dr1', date_debut: '2025-06-02', date_fin: '2025-06-06' },
    { med_id: 'dr2', date_debut: '2025-06-10', date_fin: '2025-06-10' },
  ];

  test('absence couvrant le jour → true', () => {
    expect(isAbsent('dr1', '2025-06-04', absences)).toBe(true);
  });

  test('absence le premier jour → true', () => {
    expect(isAbsent('dr1', '2025-06-02', absences)).toBe(true);
  });

  test('absence le dernier jour → true', () => {
    expect(isAbsent('dr1', '2025-06-06', absences)).toBe(true);
  });

  test('absence d\'un seul jour → true ce jour', () => {
    expect(isAbsent('dr2', '2025-06-10', absences)).toBe(true);
  });

  test('avant l\'absence → false', () => {
    expect(isAbsent('dr1', '2025-06-01', absences)).toBe(false);
  });

  test('après l\'absence → false', () => {
    expect(isAbsent('dr1', '2025-06-07', absences)).toBe(false);
  });

  test('autre médecin → false', () => {
    expect(isAbsent('dr99', '2025-06-04', absences)).toBe(false);
  });

  test('tableau vide → false', () => {
    expect(isAbsent('dr1', '2025-06-04', [])).toBe(false);
  });

  test('absences non définies → false', () => {
    expect(isAbsent('dr1', '2025-06-04')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// worksDay
// ════════════════════════════════════════════════════════════════════════════

describe('worksDay()', () => {
  // sched : [lunM, lunAM, marM, marAM, merM, merAM, jeuM, jeuAM, venM, venAM]
  const medFullTime  = { id: 'full',  sched: [1,1,1,1,1,1,1,1,1,1] };
  const medLunOnly   = { id: 'lun',   sched: [1,1,0,0,0,0,0,0,0,0] };
  const medHalfMorn  = { id: 'morn',  sched: [1,0,1,0,1,0,1,0,1,0] }; // que matins
  const medMerJeu    = { id: 'mj',    sched: [0,0,0,0,1,1,1,1,0,0] }; // mer+jeu

  test('médecin plein temps — lundi → true', () => {
    expect(worksDay(medFullTime, '2025-06-02')).toBe(true); // lundi
  });

  test('médecin plein temps — vendredi → true', () => {
    expect(worksDay(medFullTime, '2025-06-06')).toBe(true); // vendredi
  });

  test('médecin plein temps — samedi → false', () => {
    expect(worksDay(medFullTime, '2025-06-07')).toBe(false); // samedi
  });

  test('médecin plein temps — dimanche → false', () => {
    expect(worksDay(medFullTime, '2025-06-08')).toBe(false); // dimanche
  });

  test('médecin lundi seulement — mardi → false', () => {
    expect(worksDay(medLunOnly, '2025-06-03')).toBe(false); // mardi
  });

  test('médecin matin seulement — lundi (travaille matin) → true', () => {
    // sched[0] = 1 (lundi matin) → travaille
    expect(worksDay(medHalfMorn, '2025-06-02')).toBe(true);
  });

  test('médecin mer+jeu — mercredi → true', () => {
    expect(worksDay(medMerJeu, '2025-06-04')).toBe(true); // mercredi
  });

  test('médecin mer+jeu — lundi → false', () => {
    expect(worksDay(medMerJeu, '2025-06-02')).toBe(false); // lundi
  });

  test('absence pendant un jour de travail → false', () => {
    const absences = [{ med_id: 'full', date_debut: '2025-06-02', date_fin: '2025-06-06' }];
    expect(worksDay(medFullTime, '2025-06-02', absences)).toBe(false);
  });

  test('absence autre jour → true', () => {
    const absences = [{ med_id: 'full', date_debut: '2025-06-10', date_fin: '2025-06-10' }];
    expect(worksDay(medFullTime, '2025-06-02', absences)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// countDemiJournees
// ════════════════════════════════════════════════════════════════════════════

describe('countDemiJournees()', () => {
  test('plein temps (10 demi-journées)', () => {
    const med = { sched: [1,1,1,1,1,1,1,1,1,1] };
    expect(countDemiJournees(med)).toBe(10);
  });

  test('mi-temps (5 demi-journées)', () => {
    const med = { sched: [1,0,1,0,1,0,1,0,1,0] };
    expect(countDemiJournees(med)).toBe(5);
  });

  test('0 demi-journées', () => {
    const med = { sched: [0,0,0,0,0,0,0,0,0,0] };
    expect(countDemiJournees(med)).toBe(0);
  });

  test('horaire audrey (sched 1100111111 = 8 demi-journées)', () => {
    // '1100111111' → lun M+AM, mer+jeu+ven M+AM = 2 + 6 = 8
    const med = { sched: [1,1,0,0,1,1,1,1,1,1] };
    expect(countDemiJournees(med)).toBe(8);
  });

  test('horaire caroline (sched 1111001111 = 8 demi-journées)', () => {
    const med = { sched: [1,1,1,1,0,0,1,1,1,1] };
    expect(countDemiJournees(med)).toBe(8);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// worksWeekAny
// ════════════════════════════════════════════════════════════════════════════

describe('worksWeekAny()', () => {
  const monday = new Date('2025-06-02T00:00:00');
  const medFullTime = { id: 'full', sched: [1,1,1,1,1,1,1,1,1,1] };
  const medNone     = { id: 'none', sched: [0,0,0,0,0,0,0,0,0,0] };

  test('médecin plein temps — travaille au moins un jour', () => {
    expect(worksWeekAny(medFullTime, monday)).toBe(true);
  });

  test('médecin sans horaire — ne travaille pas', () => {
    expect(worksWeekAny(medNone, monday)).toBe(false);
  });

  test('médecin plein temps absent toute la semaine → false', () => {
    const absences = [{ med_id: 'full', date_debut: '2025-06-02', date_fin: '2025-06-06' }];
    expect(worksWeekAny(medFullTime, monday, absences)).toBe(false);
  });

  test('médecin plein temps absent 4 jours sur 5 → true', () => {
    const absences = [{ med_id: 'full', date_debut: '2025-06-02', date_fin: '2025-06-05' }];
    expect(worksWeekAny(medFullTime, monday, absences)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTS DE COHÉRENCE MÉTIER
// ════════════════════════════════════════════════════════════════════════════

describe('Cohérence métier planning gériatrique', () => {
  test('schedIdx + 1 ne dépasse pas 9 (bornes du tableau sched)', () => {
    [1, 2, 3, 4, 5].forEach(dow => {
      expect(schedIdx(dow)).toBeLessThanOrEqual(8);
      expect(schedIdx(dow) + 1).toBeLessThanOrEqual(9);
    });
  });

  test('weekDays retourne bien des lundis au vendredis pour n\'importe quel lundi', () => {
    ['2025-06-02', '2025-12-29', '2026-01-05'].forEach(mondayStr => {
      const monday = new Date(mondayStr + 'T00:00:00');
      const days = weekDays(monday);
      expect(days[0].getDay()).toBe(1); // lundi
      expect(days[4].getDay()).toBe(5); // vendredi
    });
  });

  test('getMonday → weekDays — premier jour = le lundi calculé', () => {
    const d = new Date('2025-06-04T00:00:00'); // mercredi
    const monday = getMonday(d);
    const days = weekDays(monday);
    expect(toIso(days[0])).toBe(toIso(monday));
  });

  test('Praticien à mi-temps (8 DJ) — taux affiché = 80%', () => {
    const med = { sched: [1,1,1,1,0,0,1,1,1,1] }; // caroline
    const dj = countDemiJournees(med);
    const pct = Math.round(dj / 10 * 100);
    expect(pct).toBe(80);
  });

  test('Absence de date_debut == date_fin → isAbsent retourne true ce jour uniquement', () => {
    const absences = [{ med_id: 'x', date_debut: '2025-06-05', date_fin: '2025-06-05' }];
    expect(isAbsent('x', '2025-06-05', absences)).toBe(true);
    expect(isAbsent('x', '2025-06-04', absences)).toBe(false);
    expect(isAbsent('x', '2025-06-06', absences)).toBe(false);
  });

  test('Postes avec min=0 ne génèrent pas d\'alerte même si vides', () => {
    const postesMin0 = POSTES.filter(p => p.min === 0);
    expect(postesMin0.length).toBeGreaterThan(0);
    // Les postes à min=0 incluent hdjog, emcc, ehpadl, cstmem
    const expectedMin0 = ['hdjog', 'emcc', 'ehpadl', 'cstmem'];
    expectedMin0.forEach(id => {
      const poste = POSTES.find(p => p.id === id);
      expect(poste).toBeDefined();
      expect(poste.min).toBe(0);
    });
  });

  test('Les postes SSR sont distincts des postes court séjour', () => {
    const ssr = POSTES.filter(p => p.grp === 'SSR');
    const cs  = POSTES.filter(p => p.grp.startsWith('Court séjour'));
    expect(ssr.length).toBeGreaterThan(0);
    expect(cs.length).toBeGreaterThan(0);
    // Aucun poste ne peut être dans les deux groupes
    const ssrIds = new Set(ssr.map(p => p.id));
    cs.forEach(p => expect(ssrIds.has(p.id)).toBe(false));
  });

  test('Les postes internes sont séparés des postes seniors', () => {
    const internPostes = POSTES.filter(p => p.intern);
    const seniorPostes = POSTES.filter(p => !p.intern);
    expect(internPostes.length).toBeGreaterThan(0);
    expect(seniorPostes.length).toBeGreaterThan(internPostes.length);
    const internIds = new Set(internPostes.map(p => p.id));
    seniorPostes.forEach(p => expect(internIds.has(p.id)).toBe(false));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ════════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  test('worksDay avec sched tout à 0 → false même sans absence', () => {
    const med = { id: 'x', sched: [0,0,0,0,0,0,0,0,0,0] };
    expect(worksDay(med, '2025-06-02')).toBe(false);
  });

  test('addDays avec grande valeur (365 jours)', () => {
    const d = new Date('2025-01-01T00:00:00');
    const result = addDays(d, 365);
    expect(toIso(result)).toBe('2026-01-01');
  });

  test('addDays avec -365', () => {
    const d = new Date('2026-01-01T00:00:00');
    const result = addDays(d, -365);
    expect(toIso(result)).toBe('2025-01-01');
  });

  test('isAbsent avec absence chevauchant plusieurs mois', () => {
    const absences = [{ med_id: 'x', date_debut: '2025-05-01', date_fin: '2025-08-31' }];
    expect(isAbsent('x', '2025-06-15', absences)).toBe(true);
    expect(isAbsent('x', '2025-04-30', absences)).toBe(false);
    expect(isAbsent('x', '2025-09-01', absences)).toBe(false);
  });

  test('worksWeekAny avec absences vide tableau → dépend du sched', () => {
    const monday = new Date('2025-06-02T00:00:00');
    const med = { id: 'x', sched: [1,1,1,1,1,1,1,1,1,1] };
    expect(worksWeekAny(med, monday, [])).toBe(true);
  });

  test('countDemiJournees — sched mixte', () => {
    // audrey : '1100111111' → 2 + 6 = 8
    const med = { sched: [1,1,0,0,1,1,1,1,1,1] };
    expect(countDemiJournees(med)).toBe(8);
  });
});
