// components/MonthView.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { POSTES, toIso, getMonday, addDays, weekDays, worksDay, getFrenchHolidays } from '../utils';
import * as api from '../api';
import DoctorSearch from './DoctorSearch';

const MONTHS_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

// ── Popover sélection rapide de mois ────────────────────────
function MonthPickerPopover({ current, onSelect, onClose }) {
  const [year, setYear] = useState(current.getFullYear());
  const ref = useRef(null);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  useEffect(() => {
    function h(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const curM = current.getMonth();
  const curY = current.getFullYear();

  return (
    <div ref={ref} style={{
      position:'absolute', top:'calc(100% + 6px)', left:'50%', transform:'translateX(-50%)',
      zIndex:600, background:'var(--surface)', border:'1px solid var(--border2)',
      borderRadius:'var(--rl)', boxShadow:'0 8px 28px rgba(0,0,0,.18)',
      padding:'12px', width:220,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:10 }}>
        <button className="wn-btn" onClick={() => setYear(y => y - 1)}>‹</button>
        <span style={{ flex:1, textAlign:'center', fontSize:13, fontFamily:'system-ui,sans-serif', fontWeight:700 }}>
          {year}
        </span>
        <button className="wn-btn" onClick={() => setYear(y => y + 1)}>›</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4 }}>
        {MONTHS_FR.map((m, i) => {
          const isSel = i === curM && year === curY;
          return (
            <button key={i}
              onClick={() => { onSelect(new Date(year, i, 1)); onClose(); }}
              style={{
                padding:'5px 2px', fontSize:11, fontFamily:'system-ui,sans-serif',
                fontWeight: isSel ? 700 : 400, borderRadius:'var(--r)',
                border: isSel ? '1.5px solid var(--accent)' : '1px solid transparent',
                background: isSel ? 'var(--accent-light)' : 'transparent',
                color: isSel ? 'var(--accent)' : 'var(--text)',
                cursor:'pointer', textAlign:'center', transition:'background .08s',
              }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
            >
              {m.slice(0,3)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TYPE_RANK  = { ph:0, padhue:1, interne:2, externe:2, ipa:3 };

const ABS_COLORS = {
  'Congé annuel (CA)':              '#2272f0',
  'Formation / DPC':                '#059669',
  'Congé maladie':                  '#e11d48',
  'Temps non clinique':             '#9333ea',
  'RTT':                            '#4f46e5',
  'Récupération de garde':          '#ea580c',
  'Congé formation (CF)':           '#0891b2',
  'Activité externe (CM2R / MTG…)': '#d97706',
};
function absColor(type) { return ABS_COLORS[type] ?? '#6A6A66'; }

// Même définition que PlanningGrid (sans "Tout afficher")
const FILTERS = [
  { id: 'cs',      label: 'Court séjour',  color: '#2272f0', grps: ['Court séjour 1', 'Court séjour 2'] },
  { id: 'ssr',     label: 'SSR',           color: '#1D9E75', grps: ['SSR'] },
  { id: 'hdj',     label: 'HDJ',           color: '#ea580c', grps: ['Hôpital de jour'] },
  { id: 'ucc',     label: 'UCC/EMCC',      color: '#e11d48', grps: ['UCC / EMCC'] },
  { id: 'extra',   label: 'Extra-hosp.',   color: '#0891b2', grps: ['Extra-hospitalier'] },
  { id: 'tnc',     label: 'Tps non clin.', color: '#9333ea', grps: ['Temps non clinique'] },
  { id: 'ehpad',   label: 'EHPAD',         color: '#d97706', grps: ['EHPAD'] },
  { id: 'consult', label: 'Consultations', color: '#7c3aed', grps: ['Consultations'] },
];

// Rang de chaque groupe de services (suit l'ordre des filtres)
const GRP_ORDER = {};
FILTERS.forEach((f, fi) => f.grps.forEach(g => { GRP_ORDER[g] = fi; }));

export default function MonthView({ medecins, absences }) {
  const [monthDate,    setMonthDate]    = useState(new Date());
  const [weekData,     setWeekData]     = useState({});
  const [filter,       setFilter]       = useState(null);
  const [doctorFilter, setDoctorFilter] = useState('');
  const [pickerOpen,   setPickerOpen]   = useState(false);

  const y  = monthDate.getFullYear();
  const mo = monthDate.getMonth();

  // Calculer les semaines du mois
  const weeks = [];
  let cur = getMonday(new Date(y, mo, 1));
  const endOfMonth = new Date(y, mo + 1, 0);
  while (cur <= endOfMonth) {
    weeks.push(new Date(cur));
    cur = addDays(cur, 7);
  }

  useEffect(() => {
    async function load() {
      const results = {};
      await Promise.all(weeks.map(async w => {
        const k = toIso(w);
        results[k] = await api.getPlanning(k);
      }));
      setWeekData(results);
    }
    load();
  }, [y, mo]);

  const activeFilter  = FILTERS.find(f => f.id === filter) ?? null;
  // Postes visibles selon le filtre (null = tous)
  const visiblePostes = activeFilter
    ? POSTES.filter(p => activeFilter.grps.includes(p.grp))
    : POSTES;

  return (
    <div>
      {/* ── Titre impression ── */}
      <div className="print-only print-title">
        Vue mensuelle — {new Date(y, mo, 1).toLocaleDateString('fr-FR', { month:'long', year:'numeric' })}
      </div>

      {/* ── Navigation ── */}
      <div className="wn print-hide">
        <button className="wn-btn" title="Reculer de 6 mois"
          onClick={() => setMonthDate(new Date(y, mo - 6, 1))}>«</button>
        <button className="wn-btn" title="Mois précédent"
          onClick={() => setMonthDate(new Date(y, mo - 1, 1))}>‹</button>

        {/* Label cliquable → MonthPicker */}
        <div style={{ position:'relative' }}>
          <span
            className="wn-lbl"
            onClick={() => setPickerOpen(v => !v)}
            title="Cliquer pour choisir un mois"
            style={{ cursor:'pointer', userSelect:'none', display:'inline-flex', alignItems:'center', gap:5 }}
          >
            {new Date(y, mo, 1).toLocaleDateString('fr-FR', { month:'long', year:'numeric' })}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ opacity:.45, flexShrink:0 }}>
              <path d="M2 3.5 5 6.5 8 3.5"/>
            </svg>
          </span>
          {pickerOpen && (
            <MonthPickerPopover
              current={monthDate}
              onSelect={d => { setMonthDate(d); setPickerOpen(false); }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>

        <button className="wn-btn" title="Mois suivant"
          onClick={() => setMonthDate(new Date(y, mo + 1, 1))}>›</button>
        <button className="wn-btn" title="Avancer de 6 mois"
          onClick={() => setMonthDate(new Date(y, mo + 6, 1))}>»</button>

        <button className="wn-chip" onClick={() => setMonthDate(new Date())}>Mois actuel</button>

        {medecins.length > 0 && (
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:10, fontFamily:'Trebuchet MS,sans-serif', fontWeight:700, color:'var(--text2)', letterSpacing:'.04em', whiteSpace:'nowrap' }}>
              Vue médecin :
            </span>
            <DoctorSearch
              medecins={medecins}
              value={doctorFilter}
              onChange={setDoctorFilter}
            />
          </div>
        )}
      </div>

      {/* ── Filtres + bouton Imprimer ── */}
      <div className="print-hide" style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:14, alignItems:'center' }}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(active ? null : f.id)}
              title={active ? 'Cliquer pour tout réafficher' : ''}
              style={{
                display:'inline-flex', alignItems:'center', gap:5,
                padding:'4px 11px',
                border:`1.5px solid ${f.color}`,
                borderRadius:20,
                fontSize:10,
                fontFamily:'system-ui,-apple-system,sans-serif',
                fontWeight:700,
                letterSpacing:'.04em',
                cursor:'pointer',
                transition:'background .12s, color .12s',
                background: active ? f.color : 'transparent',
                color:      active ? '#fff'   : f.color,
                outline:'none',
              }}
            >
              <span style={{
                width:7, height:7, borderRadius:'50%', flexShrink:0,
                background: active ? 'rgba(255,255,255,.75)' : f.color,
              }} />
              {f.label}
            </button>
          );
        })}
        {/* Bouton Imprimer aligné avec les pills */}
        <button
          onClick={() => window.print()}
          style={{
            marginLeft:'auto', fontSize:10, padding:'4px 11px',
            borderRadius:20, fontFamily:'system-ui,-apple-system,sans-serif',
            fontWeight:700, letterSpacing:'.04em', cursor:'pointer',
            border:'1.5px solid var(--border2)', background:'transparent',
            color:'var(--text2)', display:'inline-flex', alignItems:'center', gap:5,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 4V1.5h7V4"/>
            <rect x="1" y="4" width="12" height="6" rx="1.5"/>
            <path d="M3.5 10v2.5h7V10"/>
            <path d="M3.5 7.5h1M10 7.5h.5"/>
          </svg>
          Imprimer
        </button>
      </div>

      {/* ── Grille mensuelle ── */}
      {weeks.map(monday => {
        const wk   = toIso(monday);
        const data = weekData[wk];
        const days = weekDays(monday);

        // ── Ordre stable par poste pour la semaine ──────────────
        // Pour chaque poste, on détermine le rang de chaque praticien
        // en fonction du 1er jour de la semaine où il travaille réellement.
        // Si Dr A est seul lundi et Dr B arrive mardi, A garde le rang 0
        // même si B précède A alphabétiquement ou en base.
        const stableOrderByPoste = {};
        if (data) {
          const byPosteAll = data.affectations || {};
          visiblePostes.forEach(p => {
            const assigned = byPosteAll[p.id]?.medecins || [];
            const order    = {};
            let   rank     = 0;
            days.forEach(d => {
              const dIso = toIso(d);
              assigned.forEach(m => {
                if (order[m.id] !== undefined) return; // déjà classé
                if (worksDay(m, dIso, absences)) order[m.id] = rank++;
              });
            });
            stableOrderByPoste[p.id] = order;
          });
        }
        // ────────────────────────────────────────────────────────

        return (
          <div key={wk}>
            <div className="month-week-lbl">
              Semaine du {monday.toLocaleDateString('fr-FR', { day:'numeric', month:'long' })}
            </div>
            <div className="monthly-grid">
              {days.map(day => {
                const di = toIso(day);
                const isThisMonth = day.getMonth() === mo;
                const isToday     = di === toIso(new Date());
                const byPoste     = data?.affectations || {};
                const extras      = (data?.extras      || []).filter(e => e.jour === di);
                const excls       = (data?.exclusions  || []).map(e => e.med_id);
                const holidayName = getFrenchHolidays(day.getFullYear()).get(di);

                // Chips selon les postes visibles (filtrés + vue médecin)
                // Aucune vacation affichée sur les jours fériés
                const chips = [];
                if (!holidayName) {
                  visiblePostes.forEach((p, pi) => {
                    const assigned   = byPoste[p.id]?.medecins || [];
                    const grpRank    = GRP_ORDER[p.grp] ?? 99;
                    const posteOrder = stableOrderByPoste[p.id] ?? {};
                    assigned.forEach(m => {
                      if (!worksDay(m, di, absences)) return;
                      if (excls.includes(m.id)) return;
                      if (doctorFilter && m.id !== doctorFilter) return;
                      chips.push({ nom: m.nom, short: p.short, c: p.c, key: p.id + m.id,
                                   type: m.type, grpRank, posteIdx: pi,
                                   assignIdx: posteOrder[m.id] ?? 9999, isExtra: false });
                    });
                    extras.filter(e => e.poste_id === p.id).forEach((e, ei) => {
                      if (doctorFilter && e.med_id !== doctorFilter) return;
                      chips.push({ nom: e.nom, short: p.short, c: p.c, key: p.id + e.med_id + 'x',
                                   type: e.type, grpRank, posteIdx: pi,
                                   assignIdx: 9999 + ei, isExtra: true });
                    });
                  });
                }

                // Tri : service → poste → séniorité → régulier avant remplaçant → ordre d'arrivée (congés en dernier)
                chips.sort((a, b) => {
                  if (!a.nom && b.nom) return 1;
                  if (a.nom && !b.nom) return -1;
                  if (a.grpRank   !== b.grpRank)   return a.grpRank   - b.grpRank;
                  if (a.posteIdx  !== b.posteIdx)   return a.posteIdx  - b.posteIdx;
                  const ra = TYPE_RANK[a.type] ?? 99, rb = TYPE_RANK[b.type] ?? 99;
                  if (ra !== rb) return ra - rb;
                  if (a.isExtra !== b.isExtra) return a.isExtra ? 1 : -1;
                  return a.assignIdx - b.assignIdx;
                });

                // Congés — uniquement en vue par médecin
                if (doctorFilter) {
                  const med = medecins.find(m => m.id === doctorFilter);
                  absences
                    .filter(a => a.med_id === doctorFilter && a.date_debut <= di && a.date_fin >= di)
                    .forEach(a => {
                      chips.push({
                        nom:   '',
                        short: a.type_abs,
                        c:     absColor(a.type_abs),
                        key:   'abs-' + a.id + '-' + di,
                      });
                    });
                }

                return (
                  <div key={di} className="month-day"
                    style={{ ...((!isThisMonth) ? { opacity:.4 } : {}), ...(holidayName ? { background:'var(--holiday-stripe)' } : {}) }}>
                    <div className={`month-day-hdr${isToday ? ' today' : ''}`}
                      style={holidayName && !isToday ? { color:'#d97706', borderBottomColor:'#fcd34d' } : undefined}>
                      {day.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric' })}
                      {holidayName && (
                        <span style={{ display:'block', fontSize:8, fontStyle:'italic', fontWeight:500, marginTop:1, color:'#d97706', lineHeight:1.2 }}>
                          {holidayName}
                        </span>
                      )}
                    </div>
                    {chips.slice(0, 8).map(ch => (
                      <div key={ch.key} className="month-chip"
                        style={{ background: ch.c+'22', color: ch.c, border:`1px solid ${ch.c}44` }}>
                        {ch.nom
                          ? <span style={{ fontWeight: ch.type === 'ph' ? 700 : 400, fontStyle: ch.type === 'ph' ? 'normal' : 'italic' }}>
                              {ch.nom}
                              {ch.short && <em style={{ fontStyle:'italic', fontWeight:400, opacity:0.75 }}> — {ch.short}</em>}
                            </span>
                          : <em style={{ fontStyle:'italic' }}>{ch.short}</em>
                        }
                      </div>
                    ))}
                    {chips.length > 8 && (
                      <div style={{ fontSize:9, color:'var(--text3)', fontFamily:'sans-serif' }}>
                        +{chips.length - 8} autres
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
