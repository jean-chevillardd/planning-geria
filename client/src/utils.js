// utils.js — PATCHED: refreshed service position colors
// Only POSTES colors changed; all other logic is unchanged.

// dispensable:true = service ouvert uniquement si >12 PH (ou >11 le mercredi)
// → ces postes n'entrent PAS dans le compteur PH/jour
// Ordre : CSG 1 → CSG 2 → SSR → EOPS → UCC → HDJ → HDJ NP → EHPAD → dispensables
export const POSTES = [
  // ── Indispensables ──────────────────────────────────────────
  { id:'csg1a',  lbl:'CSG 1 — Sénior',           short:'CSG 1',    c:'#2272f0', min:1, minPH:2, grp:'Court séjour',        intern:false },
  { id:'csg1i1', lbl:'CSG 1 — Interne',            short:'CSG 1',    c:'#60a5fa', min:1,          grp:'Court séjour',        intern:true  },
  { id:'csg2a',  lbl:'CSG 2 — Sénior',             short:'CSG 2',    c:'#4f46e5', min:1, minPH:2, grp:'Court séjour',        intern:false },
  { id:'csg2i1', lbl:'CSG 2 — Interne',             short:'CSG 2',    c:'#818cf8', min:1,          grp:'Court séjour',        intern:true  },
  { id:'ssr3',   lbl:'SSR 3ème',                    short:'SSR 3',    c:'#0d9488', min:1, grp:'SSR',                 intern:false },
  { id:'ssr4',   lbl:'SSR 4ème',                    short:'SSR 4',    c:'#1D9E75', min:1, grp:'SSR',                 intern:false },
  { id:'ssr5',   lbl:'SSR 5ème',                    short:'SSR 5',    c:'#047857', min:1, grp:'SSR',                 intern:false },
  { id:'eops',   lbl:"EOPS / Ligne d'avis",         short:'EOPS',     c:'#0891b2', min:1, grp:'Extra-hospitalier',   intern:false },
  { id:'ucc',    lbl:'UCC',                         short:'UCC',      c:'#e11d48', min:1, grp:'UCC / EMCC',          intern:false },
  { id:'hdj',    lbl:'HDJ programmé',               short:'HDJ',      c:'#ea580c', min:1, grp:'Hôpital de jour',     intern:false },
  { id:'hdjnp',  lbl:'HDJ non programmé',           short:'HDJ NP',   c:'#b91c1c', min:1, grp:'Hôpital de jour',     intern:false },
  { id:'ehpad',  lbl:'EHPAD / SLD',                 short:'EHPAD',    c:'#d97706', min:1, grp:'EHPAD',               intern:false },
  // ── Dispensables ────────────────────────────────────────────
  { id:'emg',    lbl:'EMG (équipe mobile)',          short:'EMG',      c:'#6366f1', min:1, grp:'Activités dispensables', intern:false, dispensable:true },
  { id:'emcc',   lbl:'EMCC',                        short:'EMCC',     c:'#db2777', min:0, grp:'Activités dispensables', intern:false, dispensable:true },
  { id:'tnc',    lbl:'Temps non clinique',           short:'TNC',      c:'#9333ea', min:0, grp:'Activités dispensables', intern:false, dispensable:true },
  { id:'hdjog',  lbl:'HDJ oncoGéria',               short:'HDJ OG',   c:'#f97316', min:0, grp:'Activités dispensables', intern:false, dispensable:true },
  { id:'ehpadl', lbl:'EHPAD Luçon',                 short:'EHPAD L',  c:'#92400e', min:0, grp:'Activités dispensables', intern:false, dispensable:true },
  { id:'cstmem', lbl:'CST Mémoire',                 short:'Mémoire',  c:'#7c3aed', min:0, grp:'Activités dispensables', intern:false, dispensable:true },
];

export const TYPE_LBL = {
  ph:'Praticien hosp.', ipa:'IPA', interne:'Interne', externe:'Externe', padhue:'PADHUE'
};

export const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

// ── Date helpers ─────────────────────────────────────────

export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
export function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function weekDays(monday) {
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
}

export function fmtDay(d) {
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtDayLong(d) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Schedule helpers ──────────────────────────────────────
export function schedIdx(dow) { return (dow - 1) * 2; }

export function isAbsent(medId, dayIso, absences = []) {
  return absences.some(a => a.med_id === medId && a.date_debut <= dayIso && a.date_fin >= dayIso);
}

export function worksDay(med, dayIso, absences = []) {
  if (isAbsent(med.id, dayIso, absences)) return false;
  const dow = new Date(dayIso + 'T12:00:00').getDay();
  if (dow === 0 || dow === 6) return false;
  const i = schedIdx(dow);
  return !!(med.sched[i] || med.sched[i + 1]);
}

/**
 * Retourne 'matin' si le médecin ne travaille que le matin ce jour-là,
 * 'apm' si seulement l'après-midi, null s'il travaille les deux.
 * Basé sur le sched défini dans l'onglet Équipe.
 */
export function getSchedHalfDay(med, dayIso) {
  const dow = new Date(dayIso + 'T12:00:00').getDay();
  if (dow === 0 || dow === 6) return null;
  const i = schedIdx(dow);
  const am = !!(med.sched[i]);
  const pm = !!(med.sched[i + 1]);
  if (am && !pm) return 'matin';
  if (!am && pm) return 'apm';
  return null;
}

export function countDemiJournees(med) {
  return med.sched.reduce((a, b) => a + b, 0);
}

export function worksWeekAny(med, monday, absences = []) {
  return weekDays(monday).some(d => worksDay(med, toIso(d), absences));
}

/**
 * Retourne les PH disponibles pour la semaine, groupés en deux catégories :
 * - full : présents les 5 jours (selon sched, hors absences)
 * - partial : présents seulement certains jours, avec liste des jours
 *
 * Ne retourne que les praticiens de type 'ph' (Praticien Hospitalier).
 * SQLite stocke actif comme INTEGER — utiliser !!m.actif, pas m.actif === true.
 */
export function getDisponiblesPH(medecins, absences, days, byPoste = {}, exclusions = [], extras = []) {
  if (!medecins || !absences || !days?.length) return { full: [], partial: [] };
  const dayIsos = days.map(d => toIso(d));

  // medId → Set des posteIds (Map préserve le type des clés)
  const medPosteMap = new Map();
  for (const [posteId, posteData] of Object.entries(byPoste)) {
    for (const m of (posteData.medecins || [])) {
      if (!medPosteMap.has(m.id)) medPosteMap.set(m.id, new Set());
      medPosteMap.get(m.id).add(posteId);
    }
  }

  const DAY_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.'];

  // Note sur les demi-journées absentes selon le sched (ex: "(abs le mer. a-m)")
  function buildSchedNote(m) {
    const parts = [];
    dayIsos.forEach((iso, i) => {
      const dow = new Date(iso + 'T12:00:00').getDay();
      const idx = schedIdx(dow);
      const am = m.sched[idx], pm = m.sched[idx + 1];
      if (!am && !pm) parts.push(`abs le ${DAY_SHORT[i]}`);
      else if (am && !pm) parts.push(`abs le ${DAY_SHORT[i]} a-m`);
      else if (!am && pm) parts.push(`abs le ${DAY_SHORT[i]} mat.`);
    });
    return parts.length ? `(${parts.join(', ')})` : null;
  }

  const full = [];
  const partial = [];

  for (const m of medecins) {
    if (!m.actif || m.type !== 'ph') continue;

    if (!medPosteMap.has(m.id)) {
      // Non assigné : distinguer absence posée vs planning de travail
      // Jours normalement travaillés cette semaine où une absence est posée
      const absentWorkDays = dayIsos.filter(iso => {
        if (!isAbsent(m.id, iso, absences)) return false;
        const dow = new Date(iso + 'T12:00:00').getDay();
        const idx = schedIdx(dow);
        return !!(m.sched[idx] || m.sched[idx + 1]);
      });

      if (absentWorkDays.length > 0) {
        // A posé un congé/absence → "Présents partiellement" si encore présent ≥1 jour
        const encorePresent = dayIsos.some(iso => {
          if (isAbsent(m.id, iso, absences)) return false;
          const dow = new Date(iso + 'T12:00:00').getDay();
          const idx = schedIdx(dow);
          return !!(m.sched[idx] || m.sched[idx + 1]);
        });
        if (encorePresent) {
          const absentSet = new Set(absentWorkDays);
          const firstIso  = absentWorkDays[0];
          const lastIso   = absentWorkDays[absentWorkDays.length - 1];
          // Tous les jours travaillés entre le premier et le dernier jour absent
          const workDaysBetween = dayIsos.filter(iso => {
            if (iso < firstIso || iso > lastIso) return false;
            const dow = new Date(iso + 'T12:00:00').getDay();
            const idx = schedIdx(dow);
            return !!(m.sched[idx] || m.sched[idx + 1]);
          });
          const isContiguous = workDaysBetween.every(d => absentSet.has(d));
          const nums = absentWorkDays.map(d => parseInt(d.split('-')[2], 10));
          let label;
          if (nums.length === 1) {
            label = `abs le ${nums[0]}`;
          } else if (isContiguous) {
            label = `abs du ${nums[0]} au ${nums[nums.length - 1]}`;
          } else {
            label = `abs les ${nums.slice(0, -1).join(', ')} et ${nums[nums.length - 1]}`;
          }
          partial.push({ ...m, joursPresents: [`(${label})`] });
        }
      } else {
        // Aucun congé posé → full si travaille tous les jours, partial sinon
        const joursActifs = dayIsos.filter(iso => {
          const dow = new Date(iso + 'T12:00:00').getDay();
          const idx = schedIdx(dow);
          return !!(m.sched[idx] || m.sched[idx + 1]);
        });
        if (joursActifs.length === 0) continue;
        // Sched partiel (ex : 80%) = présent selon son planning, pas une absence → full
        full.push({ ...m, schedNote: buildSchedNote(m) });
      }
    } else {
      // Assigné : libre uniquement les jours où exclu de TOUS ses postes
      const myPostes = [...medPosteMap.get(m.id)];
      const joursLibres = dayIsos
        .map((iso, i) => {
          if (!worksDay(m, iso, absences)) return null;
          const excluDeTous = myPostes.every(pid =>
            exclusions.some(e => e.med_id === m.id && e.poste_id === pid && e.jour === iso)
          );
          if (!excluDeTous) return null;
          // Pas libre si déjà remplaçant (extra) dans un autre poste ce jour
          if (extras.some(e => e.med_id === m.id && e.jour === iso)) return null;
          return DAYS_FR[i];
        })
        .filter(Boolean);
      if (joursLibres.length > 0) partial.push({ ...m, joursPresents: joursLibres });
    }
  }

  full.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  partial.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return { full, partial };
}

// ── Jours fériés français ─────────────────────────────────
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

const _holCache   = {};
const _bridgeCache = {};

export function getFrenchBridgeDays(year) {
  if (_bridgeCache[year]) return _bridgeCache[year];
  const holidays = getFrenchHolidays(year);
  const bridges  = new Map();
  for (const [isoDate] of holidays) {
    const d   = new Date(isoDate + 'T12:00:00');
    const dow = d.getDay();
    if (dow === 2) { // mardi → pont le lundi
      const mon = new Date(d); mon.setDate(d.getDate() - 1);
      const monIso = toIso(mon);
      if (!holidays.has(monIso)) bridges.set(monIso, 'Pont');
    } else if (dow === 4) { // jeudi → pont le vendredi
      const fri = new Date(d); fri.setDate(d.getDate() + 1);
      const friIso = toIso(fri);
      if (!holidays.has(friIso)) bridges.set(friIso, 'Pont');
    }
  }
  _bridgeCache[year] = bridges;
  return bridges;
}

export function getFrenchHolidays(year) {
  if (_holCache[year]) return _holCache[year];
  const add = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const easter = easterSunday(year);
  const map = new Map([
    [fmt(new Date(year, 0,  1)),  "Jour de l'An"],
    [fmt(add(easter, 1)),          'Lundi de Pâques'],
    [fmt(new Date(year, 4,  1)),  'Fête du Travail'],
    [fmt(new Date(year, 4,  8)),  'Victoire 1945'],
    [fmt(add(easter, 39)),         'Ascension'],
    [fmt(add(easter, 50)),         'Lundi de Pentecôte'],
    [fmt(new Date(year, 6, 14)),  'Fête Nationale'],
    [fmt(new Date(year, 7, 15)),  'Assomption'],
    [fmt(new Date(year, 10,  1)), 'Toussaint'],
    [fmt(new Date(year, 10, 11)), 'Armistice'],
    [fmt(new Date(year, 11, 25)), 'Noël'],
  ]);
  _holCache[year] = map;
  return map;
}
