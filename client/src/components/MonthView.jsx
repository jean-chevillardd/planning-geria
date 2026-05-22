// components/MonthView.jsx
import { useState, useEffect } from 'react';
import { POSTES, toIso, getMonday, addDays, weekDays, worksDay, getFrenchHolidays } from '../utils';
import * as api from '../api';
import DoctorSearch from './DoctorSearch';

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

export default function MonthView({ medecins, absences }) {
  const [monthDate,    setMonthDate]    = useState(new Date());
  const [weekData,     setWeekData]     = useState({});
  const [filter,       setFilter]       = useState(null);
  const [doctorFilter, setDoctorFilter] = useState('');

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
        <button className="wn-btn" onClick={() => setMonthDate(new Date(y, mo-1, 1))}>‹</button>
        <button className="wn-btn" onClick={() => setMonthDate(new Date(y, mo+1, 1))}>›</button>
        <span className="wn-lbl">
          {new Date(y, mo, 1).toLocaleDateString('fr-FR', { month:'long', year:'numeric' })}
        </span>
        <button className="wn-chip" onClick={() => setMonthDate(new Date())}>Mois actuel</button>
        <button
          onClick={() => window.print()}
          style={{
            fontSize:10, padding:'4px 11px', borderRadius:20,
            fontFamily:'system-ui,-apple-system,sans-serif', fontWeight:700,
            letterSpacing:'.04em', cursor:'pointer',
            border:'1.5px solid var(--border2)',
            background:'transparent', color:'var(--text2)',
            display:'inline-flex', alignItems:'center', gap:5,
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

      {/* ── Filtres (cliquer à nouveau pour tout réafficher) ── */}
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
      </div>

      {/* ── Grille mensuelle ── */}
      {weeks.map(monday => {
        const wk   = toIso(monday);
        const data = weekData[wk];
        const days = weekDays(monday);

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
                  visiblePostes.forEach(p => {
                    const assigned = byPoste[p.id]?.medecins || [];
                    assigned.forEach(m => {
                      if (!worksDay(m, di, absences)) return;
                      if (excls.includes(m.id)) return;
                      if (doctorFilter && m.id !== doctorFilter) return;
                      chips.push({ nom: m.nom, short: p.short, c: p.c, key: p.id + m.id });
                    });
                    extras.filter(e => e.poste_id === p.id).forEach(e => {
                      if (doctorFilter && e.med_id !== doctorFilter) return;
                      chips.push({ nom: e.nom, short: p.short, c: p.c, key: p.id + e.med_id + 'x' });
                    });
                  });
                }

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
                          ? <>{ch.nom}{ch.short && <em style={{ fontStyle:'italic', opacity:0.75 }}> — {ch.short}</em>}</>
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
