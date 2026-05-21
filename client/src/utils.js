// utils.js — PATCHED: refreshed service position colors
// Only POSTES colors changed; all other logic is unchanged.

export const POSTES = [
  { id:'csg1a',  lbl:'CSG 1 — Sénior',           c:'#2272f0', min:1, grp:'Court séjour 1',      intern:false },
  { id:'csg1i1', lbl:'CSG 1 — Interne',            c:'#60a5fa', min:1, grp:'Court séjour 1',      intern:true  },
  { id:'csg2a',  lbl:'CSG 2 — Sénior',             c:'#4f46e5', min:1, grp:'Court séjour 2',      intern:false },
  { id:'csg2i1', lbl:'CSG 2 — Interne',             c:'#818cf8', min:1, grp:'Court séjour 2',      intern:true  },
  { id:'hdj',    lbl:'HDJ programmé',               c:'#ea580c', min:1, grp:'Hôpital de jour',     intern:false },
  { id:'hdjnp',  lbl:'HDJ non programmé',           c:'#b91c1c', min:1, grp:'Hôpital de jour',     intern:false },
  { id:'hdjog',  lbl:'HDJ oncoGéria',               c:'#f97316', min:0, grp:'Hôpital de jour',     intern:false },
  { id:'eops',   lbl:"EOPS / Ligne d'avis",         c:'#0891b2', min:1, grp:'Extra-hospitalier',   intern:false },
  { id:'emg',    lbl:'EMG (équipe mobile)',          c:'#6366f1', min:1, grp:'Extra-hospitalier',   intern:false },
  { id:'tnc',    lbl:'Temps non clinique',           c:'#9333ea', min:0, grp:'Temps non clinique',  intern:false },
  { id:'ssr3',   lbl:'SSR 3ème',                    c:'#0d9488', min:1, grp:'SSR',                 intern:false },
  { id:'ssr4',   lbl:'SSR 4ème',                    c:'#1D9E75', min:1, grp:'SSR',                 intern:false },
  { id:'ssr5',   lbl:'SSR 5ème',                    c:'#047857', min:1, grp:'SSR',                 intern:false },
  { id:'ucc',    lbl:'UCC',                         c:'#e11d48', min:1, grp:'UCC / EMCC',          intern:false },
  { id:'emcc',   lbl:'EMCC',                        c:'#db2777', min:0, grp:'UCC / EMCC',          intern:false },
  { id:'ehpad',  lbl:'EHPAD / SLD',                 c:'#d97706', min:1, grp:'EHPAD',               intern:false },
  { id:'ehpadl', lbl:'EHPAD Luçon',                 c:'#92400e', min:0, grp:'EHPAD',               intern:false },
  { id:'cstmem', lbl:'CST Mémoire',                 c:'#7c3aed', min:0, grp:'Consultations',       intern:false },
];

export const TYPE_LBL = {
  ph:'Praticien hosp.', ipa:'IPA', interne:'Interne', externe:'Externe', padhue:'PADHUE'
};

export const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

// ── Date helpers ─────────────────────────────────────────
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

export function worksDay(med, dayIso, absences = []) {
  if (isAbsent(med.id, dayIso, absences)) return false;
  const dow = new Date(dayIso + 'T12:00:00').getDay();
  if (dow === 0 || dow === 6) return false;
  const i = schedIdx(dow);
  return !!(med.sched[i] || med.sched[i + 1]);
}

export function isAbsent(medId, dayIso, absences = []) {
  return absences.some(a => a.med_id === medId && a.date_debut <= dayIso && a.date_fin >= dayIso);
}

export function countDemiJournees(med) {
  return med.sched.reduce((a, b) => a + b, 0);
}

export function worksWeekAny(med, monday, absences = []) {
  return weekDays(monday).some(d => worksDay(med, toIso(d), absences));
}
