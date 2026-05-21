// components/MonthView.jsx
import { useState, useEffect } from 'react';
import { POSTES, toIso, getMonday, addDays, weekDays, worksDay } from '../utils';
import * as api from '../api';

// Même définition que PlanningGrid (sans "Tout afficher")
const FILTERS = [
  { id: 'cs',      label: 'Court séjour',  color: '#185FA5', grps: ['Court séjour 1', 'Court séjour 2'] },
  { id: 'ssr',     label: 'SSR',           color: '#0F6E56', grps: ['SSR'] },
  { id: 'hdj',     label: 'HDJ',           color: '#C94A20', grps: ['Hôpital de jour'] },
  { id: 'ucc',     label: 'UCC/EMCC',      color: '#C44070', grps: ['UCC / EMCC'] },
  { id: 'extra',   label: 'Extra-hosp.',   color: '#4A4A47', grps: ['Extra-hospitalier'] },
  { id: 'tnc',     label: 'Tps non clin.', color: '#7B3FA0', grps: ['Temps non clinique'] },
  { id: 'ehpad',   label: 'EHPAD',         color: '#8A5C0A', grps: ['EHPAD'] },
  { id: 'consult', label: 'Consultations', color: '#6A6A66', grps: ['Consultations'] },
];

export default function MonthView({ medecins, absences }) {
  const [monthDate, setMonthDate] = useState(new Date());
  const [weekData,  setWeekData]  = useState({});
  const [filter,    setFilter]    = useState(null); // id du filtre actif, ou null = tout

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
      {/* ── Navigation ── */}
      <div className="wn">
        <button className="wn-btn" onClick={() => setMonthDate(new Date(y, mo-1, 1))}>‹</button>
        <button className="wn-btn" onClick={() => setMonthDate(new Date(y, mo+1, 1))}>›</button>
        <span className="wn-lbl">
          {new Date(y, mo, 1).toLocaleDateString('fr-FR', { month:'long', year:'numeric' })}
        </span>
        <button className="wn-chip" onClick={() => setMonthDate(new Date())}>Mois actuel</button>
      </div>

      {/* ── Filtres (cliquer à nouveau pour tout réafficher) ── */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:14, alignItems:'center' }}>
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
                fontFamily:'Trebuchet MS,sans-serif',
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

                // Chips selon les postes visibles (filtrés)
                const chips = [];
                visiblePostes.forEach(p => {
                  const assigned = byPoste[p.id]?.medecins || [];
                  assigned.forEach(m => {
                    if (!worksDay(m, di, absences)) return;
                    if (excls.includes(m.id)) return;
                    chips.push({ nom: m.nom, c: p.c, key: p.id + m.id });
                  });
                  extras.filter(e => e.poste_id === p.id).forEach(e => {
                    chips.push({ nom: e.nom, c: p.c, key: p.id + e.med_id + 'x' });
                  });
                });

                return (
                  <div key={di} className="month-day" style={!isThisMonth ? { opacity:.4 } : {}}>
                    <div className={`month-day-hdr${isToday ? ' today' : ''}`}>
                      {day.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric' })}
                    </div>
                    {chips.slice(0, 8).map(ch => (
                      <div key={ch.key} className="month-chip"
                        style={{ background: ch.c+'22', color: ch.c, border:`1px solid ${ch.c}44` }}>
                        {ch.nom}
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
