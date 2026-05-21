// utils.js — utilitaires partagés

export const POSTES = [
  { id:'csg1a',  lbl:'CSG 1 — Sénior',           c:'#185FA5', min:1, grp:'Court séjour 1',      intern:false },
  { id:'csg1i1', lbl:'CSG 1 — Interne',            c:'#4A88C8', min:1, grp:'Court séjour 1',      intern:true  },
  { id:'csg2a',  lbl:'CSG 2 — Sénior',             c:'#0C447C', min:1, grp:'Court séjour 2',      intern:false },
  { id:'csg2i1', lbl:'CSG 2 — Interne',             c:'#4A88C8', min:1, grp:'Court séjour 2',      intern:true  },
  { id:'hdj',    lbl:'HDJ programmé',               c:'#C94A20', min:1, grp:'Hôpital de jour',     intern:false },
  { id:'hdjnp',  lbl:'HDJ non programmé',           c:'#8B3010', min:1, grp:'Hôpital de jour',     intern:false },
  { id:'hdjog',  lbl:'HDJ oncoGéria',               c:'#C94A20', min:0, grp:'Hôpital de jour',     intern:false },
  { id:'eops',   lbl:"EOPS / Ligne d'avis",         c:'#4A4A47', min:1, grp:'Extra-hospitalier',   intern:false },
  { id:'emg',    lbl:'EMG (équipe mobile)',          c:'#777775', min:1, grp:'Extra-hospitalier',   intern:false },
  { id:'tnc',    lbl:'Temps non clinique',           c:'#7B3FA0', min:0, grp:'Temps non clinique',  intern:false },
  { id:'ssr3',   lbl:'SSR 3ème',                    c:'#0F6E56', min:1, grp:'SSR',                 intern:false },
  { id:'ssr4',   lbl:'SSR 4ème',                    c:'#1D9E75', min:1, grp:'SSR',                 intern:false },
  { id:'ssr5',   lbl:'SSR 5ème',                    c:'#085041', min:1, grp:'SSR',                 intern:false },
  { id:'ucc',    lbl:'UCC',                         c:'#C44070', min:1, grp:'UCC / EMCC',          intern:false },
  { id:'emcc',   lbl:'EMCC',                        c:'#8B2C52', min:0, grp:'UCC / EMCC',          intern:false },
  { id:'ehpad',  lbl:'EHPAD / SLD',                 c:'#8A5C0A', min:1, grp:'EHPAD',               intern:false },
  { id:'ehpadl', lbl:'EHPAD Luçon',                 c:'#5A3C05', min:0, grp:'EHPAD',               intern:false },
  { id:'cstmem', lbl:'CST Mémoire',                 c:'#4A4A47', min:0, grp:'Consultations',       intern:false },
];

export const TYPE_LBL = {
  ph:'Praticien hosp.', ipa:'IPA', interne:'Interne', externe:'Externe', padhue:'PADHUE'
};

export const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

// ── Date helpers ─────────────────────────────────────────
/** Retourne la date du lundi de la semaine contenant d */
export function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/** Format ISO date YYYY-MM-DD sans conversion UTC */
export function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Ajoute n jours à une date */
export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Les 5 jours ouvrés d'une semaine à partir du lundi */
export function weekDays(monday) {
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
}

/** Format court lisible : "lun. 2 juin" */
export function fmtDay(d) {
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Format long : "lundi 2 juin 2025" */
export function fmtDayLong(d) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Schedule helpers ──────────────────────────────────────
// sched = array 10 éléments : [lunM, lunAM, marM, marAM, merM, merAM, jeuM, jeuAM, venM, venAM]

/** Index dans sched pour un jour de la semaine (1=lun..5=ven) */
export function schedIdx(dow) { return (dow - 1) * 2; }

/** Praticien travaille-t-il ce jour (hors congés) ? */
export function worksDay(med, dayIso, absences = []) {
  if (isAbsent(med.id, dayIso, absences)) return false;
  const dow = new Date(dayIso + 'T12:00:00').getDay();
  if (dow === 0 || dow === 6) return false;
  const i = schedIdx(dow);
  return !!(med.sched[i] || med.sched[i + 1]);
}

/** Praticien absent ce jour (congé) ? */
export function isAbsent(medId, dayIso, absences = []) {
  return absences.some(a => a.med_id === medId && a.date_debut <= dayIso && a.date_fin >= dayIso);
}

/** Nombre de demi-journées travaillées par semaine */
export function countDemiJournees(med) {
  return med.sched.reduce((a, b) => a + b, 0);
}

/** Praticien travaille-t-il au moins un jour dans la semaine ? */
export function worksWeekAny(med, monday, absences = []) {
  return weekDays(monday).some(d => worksDay(med, toIso(d), absences));
}
