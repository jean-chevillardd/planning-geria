// components/MonthView.jsx
import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { POSTES, toIso, getMonday, addDays, weekDays, worksDay, getSchedHalfDay, getFrenchHolidays, getISOWeek } from '../utils';
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
        <span style={{ flex:1, textAlign:'center', fontSize:13, fontFamily:'inherit', fontWeight:700 }}>
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
                padding:'5px 2px', fontSize:11, fontFamily:'inherit',
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
  'Congé annuel (CA)':     '#2563eb',
  'Congé maladie':         '#e11d48',
  'Congé maternité':       '#db2777',
  'RTT':                   '#4f46e5',
  'Récupération de garde': '#ea580c',
  'Formation':             '#059669',
  'Activité hors site':    '#d97706',
};
function absColor(type) { return ABS_COLORS[type] ?? '#6A6A66'; }

// Même définition que PlanningGrid (sans "Tout afficher")
const FILTERS = [
  { id: 'cs',      label: 'Court séjour',  color: '#2563eb', grps: ['Court séjour'] },
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

const AST_TYPES = {
  astreinte:  { label:'Astreinte 18h30→8h30', c:'#d97706' },
  pont_rouge: { label:'Pont Rouge 8h30→13h30', c:'#e11d48' },
  csg1:       { label:'CSG 1 8h30→13h30',      c:'#2563eb' },
};

const TYPE_ABS_SHORT = {
  'Congé annuel (CA)': 'CA', 'Congé maladie': 'CM', 'Congé maternité': 'C. Mat.',
  'RTT': 'RTT', 'Récupération de garde': 'Récup.', 'Formation': 'Form.',
  'Activité hors site': 'Hors site',
};

// ── Fusion CSG 1+2 pour la vue Rotation (idem PlanningGrid) ──
const POSTES_DISPLAY = POSTES.reduce((acc, p) => {
  if (p.id === 'csg1i1' || p.id === 'csg2i1') return acc;
  if (p.id === 'csg1a') return [...acc, { ...p, lbl:'CSG 1', short:'CSG 1', combineWith:'csg1i1' }];
  if (p.id === 'csg2a') return [...acc, { ...p, lbl:'CSG 2', short:'CSG 2', combineWith:'csg2i1' }];
  return [...acc, p];
}, []);

const TYPE_LBL = { interne:'Interne', padhue:'PADHUE', ipa:'IPA' };

export default function MonthView({ medecins, absences, isSecretary = false, rotationMode = false, reloadKey = 0, onMonthAssign, onMonthRemove, onMonthModify, onNavigateWeek }) {
  const [monthDate,    setMonthDate]    = useState(new Date());
  const [weekData,     setWeekData]     = useState({});
  const [astrData,     setAstrData]     = useState([]);
  const [filter,       setFilter]       = useState(null);
  const [subFilter,    setSubFilter]    = useState(null);
  const [doctorFilter, setDoctorFilter] = useState('');
  const [pickerOpen,   setPickerOpen]   = useState(false);
  // ── Mode Rotation (état local pour D&D dialogs) ──
  const [panelDragMed,  setPanelDragMed]  = useState(null);
  const [pendingDrop,   setPendingDrop]   = useState(null);   // { med, poste, weekKey }
  const [pendingAssign, setPendingAssign] = useState(null);   // { poste, weekKey }
  const [durMode,       setDurMode]       = useState('week');
  const [durN,          setDurN]          = useState(2);
  const [assignSearch,  setAssignSearch]  = useState('');
  const [assignMed,     setAssignMed]     = useState(null);
  const [removingMed,   setRemovingMed]   = useState(null);
  const [removeDurMode, setRemoveDurMode] = useState('week');
  const [removeDurN,    setRemoveDurN]    = useState(2);
  const [modifyingMed,  setModifyingMed]  = useState(null);
  const [modifyDurMode, setModifyDurMode] = useState('week');
  const [modifyDurN,    setModifyDurN]    = useState(2);

  const y  = monthDate.getFullYear();
  const mo = monthDate.getMonth();

  // Semaines du mois
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
  }, [y, mo, reloadKey]);

  useEffect(() => {
    if (!doctorFilter) { setAstrData([]); return; }
    const mk = `${y}-${String(mo + 1).padStart(2, '0')}`;
    api.getAstreintes(mk)
      .then(data => setAstrData(data.filter(a => a.med_id === doctorFilter)))
      .catch(() => {});
  }, [y, mo, doctorFilter]);

  // Ferme les dialogs rotation sur Escape
  useEffect(() => {
    function h(e) {
      if (e.key !== 'Escape') return;
      if (pendingDrop)   { setPendingDrop(null); return; }
      if (modifyingMed)  { setModifyingMed(null); return; }
      if (removingMed)   { setRemovingMed(null); return; }
      if (pendingAssign) { setPendingAssign(null); setAssignMed(null); setAssignSearch(''); setRemovingMed(null); setModifyingMed(null); }
    }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [pendingDrop, pendingAssign]);

  const activeFilter  = FILTERS.find(f => f.id === filter) ?? null;
  const visiblePostes = activeFilter
    ? POSTES.filter(p => activeFilter.grps.includes(p.grp) && (!subFilter || p.short === subFilter))
    : POSTES;

  // ── Postes + groupes pour la vue Rotation ──
  const rotationPostes = activeFilter
    ? POSTES_DISPLAY.filter(p => activeFilter.grps.includes(p.grp) && (!subFilter || p.short === subFilter))
    : POSTES_DISPLAY;
  const rotationGroups = (() => {
    const map = {};
    const order = [];
    rotationPostes.forEach(p => {
      if (!map[p.grp]) { map[p.grp] = []; order.push(p.grp); }
      map[p.grp].push(p);
    });
    return order.map(g => [g, map[g]]);
  })();

  // P13 — Panel PH disponibles pour le mois
  const monthPhDisponibles = useMemo(() => {
    if (!isSecretary) return { full: [], partial: [] };
    const monthStart = `${y}-${String(mo + 1).padStart(2,'0')}-01`;
    const lastDay    = new Date(y, mo + 1, 0).getDate();
    const monthEnd   = `${y}-${String(mo + 1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    const full = [], partial = [];
    for (const m of medecins) {
      if (!m.actif || m.type !== 'ph' || m.service !== 'geriatrie') continue;
      const monthAbsences = absences.filter(a =>
        a.med_id === m.id && a.date_debut <= monthEnd && a.date_fin >= monthStart
      );
      if (monthAbsences.length === 0) { full.push(m); continue; }
      // Compter les jours ouvrés couverts : ≥ 5 → "Présent partiellement"
      let absenceDays = 0;
      for (let d = 1; d <= lastDay; d++) {
        const dStr = `${y}-${String(mo + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dow = new Date(dStr + 'T12:00:00').getDay();
        if (dow === 0 || dow === 6) continue;
        const idx = (dow - 1) * 2;
        if (!(m.sched[idx] || m.sched[idx + 1])) continue;
        if (monthAbsences.some(a => a.date_debut <= dStr && a.date_fin >= dStr)) absenceDays++;
      }
      if (absenceDays >= 5) {
        partial.push({ ...m, _monthAbsences: monthAbsences });
      } else {
        full.push(m);
      }
    }
    full.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    partial.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return { full, partial };
  }, [isSecretary, medecins, absences, y, mo]);

  // ── PH en congés ce mois ──────────────────────────────────
  const enCongesMois = useMemo(() => {
    if (!isSecretary) return [];
    const monthStart = `${y}-${String(mo + 1).padStart(2,'0')}-01`;
    const lastDay    = new Date(y, mo + 1, 0).getDate();
    const monthEnd   = `${y}-${String(mo + 1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    const result = [];
    for (const m of medecins) {
      if (!m.actif || m.type !== 'ph' || m.service !== 'geriatrie') continue;
      const moisAbs = absences.filter(a =>
        a.med_id === m.id && a.date_debut <= monthEnd && a.date_fin >= monthStart
      );
      if (moisAbs.length === 0) continue;
      const absItems = moisAbs.map(a => {
        const debut = a.date_debut < monthStart ? monthStart : a.date_debut;
        const fin   = a.date_fin   > monthEnd   ? monthEnd   : a.date_fin;
        const d1 = parseInt(debut.split('-')[2], 10);
        const d2 = parseInt(fin.split('-')[2], 10);
        const typeShort = TYPE_ABS_SHORT[a.type_abs] ?? a.type_abs;
        const label = d1 === d2 ? `le ${d1}` : `du ${d1} au ${d2}`;
        return { typeShort, label };
      });
      result.push({ ...m, absItems });
    }
    result.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return result;
  }, [isSecretary, medecins, absences, y, mo]);

  // ── Candidats pour la dialog click-to-assign (vide sans recherche) ─────────────
  const assignCandidates = useMemo(() => {
    if (!pendingAssign || !assignSearch.trim()) return [];
    const { poste, weekKey } = pendingAssign;
    const allIds = [poste.id, ...(poste.combineWith ? [poste.combineWith] : [])];
    const alreadyAssigned = new Set(
      allIds.flatMap(pid => weekData[weekKey]?.affectations?.[pid]?.medecins?.map(m => m.id) || [])
    );
    const q = assignSearch.toLowerCase();
    return medecins
      .filter(m => m.actif && m.service === 'geriatrie' && !alreadyAssigned.has(m.id))
      .filter(m =>
        m.nom.toLowerCase().includes(q) ||
        (m.prenom || '').toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q) ||
        (TYPE_LBL[m.type] || '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const rank = { ph:0, padhue:1, interne:2, ipa:2, externe:3 };
        const ra = rank[a.type] ?? 4;
        const rb = rank[b.type] ?? 4;
        return ra !== rb ? ra - rb : a.nom.localeCompare(b.nom, 'fr');
      });
  }, [pendingAssign, weekData, medecins, assignSearch]);

  // ── Helper : label durée ─────────────────────────────────
  const monthLbl = new Date(y, mo, 1).toLocaleDateString('fr-FR', { month:'long' });

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
              medecins={medecins.filter(m => m.type !== 'externe')}
              value={doctorFilter}
              onChange={setDoctorFilter}
            />
          </div>
        )}
      </div>

      {/* ── Filtres + bouton Imprimer ── */}
      <div className="print-hide" style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:14, alignItems:'flex-start' }}>
        {FILTERS.map(f => {
          const active     = filter === f.id;
          const subShorts  = [...new Set(
            POSTES.filter(p => f.grps.includes(p.grp)).map(p => p.short).filter(Boolean)
          )];
          const hasSubPills = subShorts.length > 1;

          return (
            <div key={f.id} style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:4 }}>
              <button
                onClick={() => { setFilter(active ? null : f.id); setSubFilter(null); }}
                title={active ? 'Cliquer pour tout réafficher' : ''}
                style={{
                  display:'inline-flex', alignItems:'center', gap:5,
                  padding:'4px 11px',
                  border:`1.5px solid ${f.color}`,
                  borderRadius:20,
                  fontSize:10,
                  fontFamily:'inherit',
                  fontWeight:700,
                  letterSpacing:'.04em',
                  cursor:'pointer',
                  transition:'background .12s, color .12s',
                  background: active ? f.color : 'transparent',
                  color:      active ? '#fff'  : f.color,
                  outline:'none',
                }}
              >
                <span style={{
                  width:7, height:7, borderRadius:'50%', flexShrink:0,
                  background: active ? 'rgba(255,255,255,.75)' : f.color,
                }} />
                {f.label}
                {hasSubPills && (
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ opacity: active ? .85 : .5, marginLeft:1, flexShrink:0,
                             transform: active ? 'rotate(180deg)' : 'none', transition:'transform .15s' }}>
                    <path d="M2 3.5 5 6.5 8 3.5"/>
                  </svg>
                )}
              </button>

              {active && hasSubPills && (
                <div style={{
                  display:'flex', flexWrap:'wrap', gap:3,
                  paddingLeft:10,
                  borderLeft:`2px solid ${f.color}55`,
                  marginLeft:7,
                }}>
                  {subShorts.map(short => {
                    const isSub = subFilter === short;
                    return (
                      <button
                        key={short}
                        onClick={() => setSubFilter(isSub ? null : short)}
                        style={{
                          padding:'2px 9px',
                          borderRadius:14,
                          fontSize:9,
                          fontFamily:'inherit',
                          fontWeight: isSub ? 700 : 500,
                          letterSpacing:'.03em',
                          cursor:'pointer',
                          outline:'none',
                          transition:'background .1s, color .1s',
                          border:`1.5px solid ${f.color}${isSub ? 'cc' : '66'}`,
                          background: isSub ? f.color + '22' : 'transparent',
                          color: f.color,
                        }}
                      >
                        {short}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <button
          onClick={() => { document.body.dataset.date = new Date().toLocaleDateString('fr-FR'); window.print(); }}
          style={{
            marginLeft:'auto', fontSize:10, padding:'4px 11px',
            borderRadius:20, fontFamily:'inherit',
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

      {/* ── Grille + panneaux latéraux ── */}
      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>

        {/* ── Zone grille (calendaire ou rotation) ── */}
        <div style={{ flex:1, minWidth:0, overflowX: rotationMode ? 'auto' : undefined }}>

          {rotationMode ? (
            /* ── Vue Rotation : postes × semaines ── */
            <div className="grid-wrap" style={{ overflow:'auto' }}>
            <table className={`rotation-grid${panelDragMed ? ' has-drag' : ''}`}>
              <thead>
                <tr>
                  <th className="rotation-poste-lbl">Poste</th>
                  {weeks.map(w => {
                    const wk = toIso(w);
                    return (
                      <th key={wk} className="rotation-week-hdr"
                        onClick={() => onNavigateWeek?.(wk)}
                        title="Aller à cette semaine en vue Semaine"
                      >
                        <span className="rotation-week-num">S{getISOWeek(w)}</span>
                        <span className="rotation-week-dates">
                          {w.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rotationGroups.map(([grp, postes]) => (
                  <Fragment key={grp}>
                    <tr>
                      <td className="rotation-grp-hdr" colSpan={weeks.length + 1}>{grp}</td>
                    </tr>
                    {postes.map(poste => (
                      <tr key={poste.id}>
                        <td className="rotation-poste-lbl">
                          <span style={{ fontWeight:600, color: poste.c, fontSize:11 }}>{poste.lbl}</span>
                        </td>
                        {weeks.map(w => {
                          const wk   = toIso(w);
                          const data = weekData[wk];
                          const allIds = [poste.id, ...(poste.combineWith ? [poste.combineWith] : [])];
                          const seen = new Set();
                          const assigned = allIds
                            .flatMap(pid => data?.affectations?.[pid]?.medecins || [])
                            .filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
                          return (
                            <td key={wk} className="rotation-cell"
                              onClick={isSecretary ? () => {
                                setDurMode('week'); setAssignMed(null); setAssignSearch('');
                                setPendingAssign({ poste, weekKey: wk });
                              } : undefined}
                              onDragOver={isSecretary && panelDragMed ? e => e.preventDefault() : undefined}
                              onDrop={isSecretary && panelDragMed ? () => {
                                setDurMode('week');
                                setPendingDrop({ med: panelDragMed, poste, weekKey: wk });
                                setPanelDragMed(null);
                              } : undefined}
                            >
                              {assigned.map(m => (
                                <div key={m.id} className="rotation-chip"
                                  style={{ background: poste.c + '18', borderColor: poste.c + '55', color: poste.c }}>
                                  <span style={{ fontWeight: m.type === 'ph' ? 700 : 400, fontStyle: m.type === 'ph' ? 'normal' : 'italic' }}>
                                    {m.nom}
                                  </span>
                                  {m.type !== 'ph' && TYPE_LBL[m.type] && (
                                    <em style={{ fontStyle:'italic', opacity:.7, fontSize:9 }}> {TYPE_LBL[m.type]}</em>
                                  )}
                                </div>
                              ))}
                              {isSecretary && <span className="add-lnk print-hide">+ affecter</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            /* ── Vue Calendrier (défaut) ── */
            weeks.map(monday => {
              const wk   = toIso(monday);
              const data = weekData[wk];
              const days = weekDays(monday);

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
                      if (order[m.id] !== undefined) return;
                      if (worksDay(m, dIso, absences)) order[m.id] = rank++;
                    });
                  });
                  stableOrderByPoste[p.id] = order;
                });
              }

              return (
                <div key={wk}>
                  <div className="monthly-grid">
                    {days.map((day, dayIdx) => {
                      const di = toIso(day);
                      const isThisMonth = day.getMonth() === mo;
                      const isToday     = di === toIso(new Date());
                      const byPoste     = data?.affectations || {};
                      const extras      = (data?.extras      || []).filter(e => e.jour === di);
                      const renforts    = (data?.renforts    || []).filter(r => r.jour === di);
                      const excls       = (data?.exclusions  || []).map(e => e.med_id);
                      const holidayName = getFrenchHolidays(day.getFullYear()).get(di);

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
                                         assignIdx: posteOrder[m.id] ?? 9999, isExtra: false,
                                         halfDay: getSchedHalfDay(m, di) });
                          });
                          extras.filter(e => e.poste_id === p.id).forEach((e, ei) => {
                            if (doctorFilter && e.med_id !== doctorFilter) return;
                            chips.push({ nom: e.nom, short: p.short, c: p.c, key: p.id + e.med_id + 'x',
                                         type: e.type, grpRank, posteIdx: pi,
                                         assignIdx: 9999 + ei, isExtra: true, isRenfort: false });
                          });
                          renforts.filter(r => r.poste_id === p.id).forEach((r, ri) => {
                            if (doctorFilter && r.med_id !== doctorFilter) return;
                            chips.push({ nom: r.nom, short: p.short, c: '#d97706', key: p.id + r.med_id + 'r',
                                         type: r.type, grpRank, posteIdx: pi,
                                         assignIdx: 99999 + ri, isExtra: false, isRenfort: true });
                          });
                        });
                      }

                      chips.sort((a, b) => {
                        if (!a.nom && b.nom) return 1;
                        if (a.nom && !b.nom) return -1;
                        if (a.grpRank  !== b.grpRank)  return a.grpRank  - b.grpRank;
                        if (a.posteIdx !== b.posteIdx) return a.posteIdx - b.posteIdx;
                        const ra = TYPE_RANK[a.type] ?? 99, rb = TYPE_RANK[b.type] ?? 99;
                        if (ra !== rb) return ra - rb;
                        if (a.isExtra !== b.isExtra) return a.isExtra ? 1 : -1;
                        return a.assignIdx - b.assignIdx;
                      });

                      if (doctorFilter) {
                        absences
                          .filter(a => a.med_id === doctorFilter && a.date_debut <= di && a.date_fin >= di)
                          .forEach(a => {
                            chips.push({ nom:'', short:a.type_abs, c:absColor(a.type_abs), key:'abs-' + a.id + '-' + di });
                          });
                        astrData
                          .filter(a => a.date_iso === di)
                          .forEach(a => {
                            const st = AST_TYPES[a.type_ast];
                            chips.push({ nom:'', short: st ? st.label : a.type_ast, c: st ? st.c : '#d97706', key:'ast-' + a.id });
                          });
                      }

                      return (
                        <div key={di} className="month-day"
                          style={{ ...((!isThisMonth) ? { opacity:.4 } : {}), position:'relative', overflow:'hidden' }}>
                          {holidayName && (
                            <div style={{position:'absolute', inset:0, pointerEvents:'none', borderRadius:'inherit', backgroundImage:'var(--holiday-stripe)'}}/>
                          )}
                          <div className={`month-day-hdr${isToday ? ' today' : ''}`}
                            style={{
                              position:'relative', display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                              ...(holidayName && !isToday ? { color:'#d97706', borderBottomColor:'#fcd34d' } : {}),
                            }}>
                            <div>
                              {day.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric' })}
                              {holidayName && (
                                <span style={{ display:'block', fontSize:8, fontWeight:600, marginTop:1, color:'#b45309', lineHeight:1.2 }}>
                                  {holidayName}
                                </span>
                              )}
                            </div>
                            {dayIdx === 0 && (
                              <span className="week-num">S{getISOWeek(monday)}</span>
                            )}
                          </div>
                          {chips.slice(0, 8).map(ch => (
                            <div key={ch.key} className="month-chip"
                              style={{
                                background: ch.isRenfort ? '#d9770610' : ch.c+'22',
                                color:      ch.isRenfort ? '#b45309'   : ch.c,
                                border:     ch.isRenfort ? '1px dashed #d9770655' : `1px solid ${ch.c}44`,
                              }}>
                              {ch.nom
                                ? <span style={{ fontWeight: ch.type === 'ph' ? 700 : 400, fontStyle: ch.type === 'ph' ? 'normal' : 'italic', display:'inline-flex', alignItems:'center', gap:3 }}>
                                    {ch.nom}
                                    {ch.short && <em style={{ fontStyle:'italic', fontWeight:400, opacity:0.75 }}> — {ch.short}</em>}
                                    {ch.isRenfort && (
                                      <span style={{
                                        fontSize:7, borderRadius:3, padding:'0 3px',
                                        background:'#d9770618', border:'1px solid #d9770644',
                                        color:'#b45309', fontWeight:700, fontStyle:'normal', flexShrink:0,
                                      }}>renfort</span>
                                    )}
                                    {ch.halfDay && (
                                      <span style={{
                                        fontSize:7, borderRadius:3, padding:'0 3px',
                                        background:'#d9770618', border:'1px solid #d9770644',
                                        color:'#b45309', fontWeight:700, fontStyle:'normal', flexShrink:0,
                                      }}>
                                        {ch.halfDay === 'matin' ? 'matin' : 'après-midi'}
                                      </span>
                                    )}
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
            })
          )}
        </div>{/* fin zone grille */}

        {/* ── Panneaux latéraux (Mode Rotation uniquement, à gauche) ── */}
        {isSecretary && rotationMode && (
          <div className="print-hide" style={{ position:'sticky', top:60, alignSelf:'flex-start', display:'flex', flexDirection:'column', gap:10, width:188, flexShrink:0, order:-1 }}>

            {/* PH disponibles ce mois (P13) */}
            <div className="available-panel" style={{ marginTop:0, maxHeight:'55vh', overflowY:'auto' }}>
              <div className="available-panel-header">
                PH — {new Date(y, mo, 1).toLocaleDateString('fr-FR', { month:'long' })}
                <span className="available-count"
                  aria-label={`${monthPhDisponibles.full.length + monthPhDisponibles.partial.length} PH ce mois`}>
                  {monthPhDisponibles.full.length + monthPhDisponibles.partial.length}
                </span>
              </div>
              {!rotationMode && (
                <p className="panel-info-note">Vue semaine pour glisser-déposer</p>
              )}
              {rotationMode && (
                <div className="panel-drag-hint" aria-label="Glisser vers un poste pour affecter">
                  <svg width="9" height="13" viewBox="0 0 9 13" fill="currentColor" aria-hidden="true" style={{ flexShrink:0 }}>
                    <circle cx="2" cy="2"  r="1.3"/><circle cx="7" cy="2"  r="1.3"/>
                    <circle cx="2" cy="6.5" r="1.3"/><circle cx="7" cy="6.5" r="1.3"/>
                    <circle cx="2" cy="11" r="1.3"/><circle cx="7" cy="11" r="1.3"/>
                  </svg>
                  Glisser vers un poste pour affecter
                </div>
              )}
              {monthPhDisponibles.full.length > 0 && (
                <>
                  <div className="available-group-label">Présents tout le mois</div>
                  <ul className="available-list">
                    {monthPhDisponibles.full.map(m => (
                      <li key={m.id} className="available-item"
                        draggable={rotationMode}
                        onDragStart={rotationMode ? () => setPanelDragMed(m) : undefined}
                        onDragEnd={rotationMode   ? () => setPanelDragMed(null) : undefined}
                        style={{ cursor: rotationMode ? 'grab' : 'default' }}
                      >
                        {rotationMode && (
                          <span className="drag-handle" aria-hidden="true">
                            <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
                              <circle cx="1.5" cy="1.5" r="1.2"/><circle cx="4.5" cy="1.5" r="1.2"/>
                              <circle cx="1.5" cy="5"   r="1.2"/><circle cx="4.5" cy="5"   r="1.2"/>
                              <circle cx="1.5" cy="8.5" r="1.2"/><circle cx="4.5" cy="8.5" r="1.2"/>
                            </svg>
                          </span>
                        )}
                        <span className="available-dot" style={{ background: '#16a34a' }} />
                        <span>{m.prenom} {m.nom}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {monthPhDisponibles.partial.length > 0 && (
                <>
                  <div className="available-group-label" style={{ marginTop: monthPhDisponibles.full.length ? 10 : 0 }}>
                    Présents partiellement
                  </div>
                  <ul className="available-list">
                    {monthPhDisponibles.partial.map(m => (
                      <li key={m.id} className="available-item"
                        draggable={rotationMode}
                        onDragStart={rotationMode ? () => setPanelDragMed(m) : undefined}
                        onDragEnd={rotationMode   ? () => setPanelDragMed(null) : undefined}
                        style={{ cursor: rotationMode ? 'grab' : 'default' }}
                      >
                        {rotationMode && (
                          <span className="drag-handle" aria-hidden="true">
                            <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
                              <circle cx="1.5" cy="1.5" r="1.2"/><circle cx="4.5" cy="1.5" r="1.2"/>
                              <circle cx="1.5" cy="5"   r="1.2"/><circle cx="4.5" cy="5"   r="1.2"/>
                              <circle cx="1.5" cy="8.5" r="1.2"/><circle cx="4.5" cy="8.5" r="1.2"/>
                            </svg>
                          </span>
                        )}
                        <span className="available-dot" style={{ background: '#f59e0b' }} />
                        <span>{m.prenom} {m.nom}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {monthPhDisponibles.full.length === 0 && monthPhDisponibles.partial.length === 0 && (
                <p className="available-empty">Aucun PH actif</p>
              )}
            </div>

            {/* En congés ce mois */}
            {enCongesMois.length > 0 && (
              <div className="available-panel" style={{ maxHeight:'40vh', overflowY:'auto' }}>
                <div className="available-panel-header">
                  En congés ce mois
                  <span className="available-count" style={{ background:'var(--text3)' }}>
                    {enCongesMois.length}
                  </span>
                </div>
                <ul className="available-list">
                  {enCongesMois.map(m => (
                    <li key={m.id} className="available-item" style={{ cursor:'default' }}>
                      <span className="available-dot" style={{ background: m.couleur || 'var(--text3)' }} />
                      <span>
                        {m.prenom} {m.nom}
                        {m.absItems.map((a, i) => (
                          <span key={i} className="available-days">
                            {a.typeShort} {a.label}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        )}
      </div>{/* fin flex-layout */}

      {/* ── Dialog D&D : durée uniquement (PH connu) ── */}
      {pendingDrop && (() => {
        const { med, poste, weekKey } = pendingDrop;
        const wNum = getISOWeek(new Date(weekKey + 'T12:00:00'));
        function confirm() {
          onMonthAssign?.({ medId: med.id, posteId: poste.id, weekKey, mode: durMode, nWeeks: durN, monthY: y, monthM: mo });
          setPendingDrop(null);
        }
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.38)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={e => { if (e.target === e.currentTarget) setPendingDrop(null); }}>
            <div style={{ background:'var(--surface)', borderRadius:'var(--rl)', border:'1px solid var(--border2)', padding:'1.5rem', width:360, boxShadow:'0 8px 32px rgba(0,0,0,.18)', fontFamily:'inherit' }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>
                Affecter {med.prenom} {med.nom}
              </div>
              <div style={{ fontSize:12, color:'var(--text2)', marginBottom:18 }}>
                → <strong style={{ color: poste.c }}>{poste.lbl}</strong> · S{wNum}
              </div>
              <DurationPicker durMode={durMode} setDurMode={setDurMode} durN={durN} setDurN={setDurN} wNum={wNum} monthLbl={monthLbl} />
              <div style={{ display:'flex', gap:8, marginTop:16 }}>
                <button onClick={confirm} style={{ flex:1, padding:'8px', borderRadius:'var(--r)', border:'none', background:'var(--accent)', color:'#fff', cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight:700 }}>
                  Confirmer
                </button>
                <button onClick={() => setPendingDrop(null)} style={{ padding:'8px 16px', borderRadius:'var(--r)', border:'1px solid var(--border2)', background:'transparent', cursor:'pointer', fontSize:11, color:'var(--text3)', fontFamily:'inherit' }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Dialog click-to-assign : affectés cette semaine + recherche ── */}
      {pendingAssign && (() => {
        const { poste, weekKey } = pendingAssign;
        const wNum = getISOWeek(new Date(weekKey + 'T12:00:00'));

        // Praticiens déjà affectés cette semaine sur ce poste
        const allPids = [poste.id, ...(poste.combineWith ? [poste.combineWith] : [])];
        const seenIds = new Set();
        const assignedHere = allPids
          .flatMap(pid =>
            (weekData[weekKey]?.affectations?.[pid]?.medecins || []).map(m => ({ ...m, _pid: pid }))
          )
          .filter(m => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true; });

        function closeDialog() {
          setPendingAssign(null); setAssignMed(null); setAssignSearch('');
          setRemovingMed(null); setModifyingMed(null);
        }
        function confirmAssign() {
          if (!assignMed) return;
          onMonthAssign?.({ medId: assignMed.id, posteId: poste.id, weekKey, mode: durMode, nWeeks: durN, monthY: y, monthM: mo });
          closeDialog();
        }
        function confirmRemove(m) {
          onMonthRemove?.({ medId: m.id, posteId: m._pid, weekKey, mode: removeDurMode, nWeeks: removeDurN, monthY: y, monthM: mo });
          closeDialog();
        }
        function confirmModify(m) {
          const weeksToRemove = weeks
            .map(w => toIso(w))
            .filter(wk =>
              (weekData[wk]?.affectations?.[m._pid]?.medecins || []).some(med => med.id === m.id)
            );
          onMonthModify?.({
            medId: m.id, posteId: m._pid, weeksToRemove,
            mode: modifyDurMode, nWeeks: modifyDurN, monthY: y, monthM: mo, weekKey,
          });
          closeDialog();
        }

        return (
          <div
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.38)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={e => { if (e.target === e.currentTarget) closeDialog(); }}
          >
            <div style={{
              background:'var(--surface)', borderRadius:'var(--rl)',
              border:'1px solid var(--border2)', padding:'1.5rem',
              width:440, maxHeight:'88vh', overflowY:'auto',
              boxShadow:'0 8px 32px rgba(0,0,0,.18)', fontFamily:'inherit',
            }}>

              {/* ── En-tête ── */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:700 }}>
                    Affecter → <span style={{ color: poste.c }}>{poste.lbl}</span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:3 }}>
                    S{wNum} — {new Date(weekKey + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'long' })}
                  </div>
                </div>
                <button onClick={closeDialog} style={{
                  background:'none', border:'none', cursor:'pointer',
                  color:'var(--text3)', fontSize:20, lineHeight:1, padding:'0 4px',
                }}>×</button>
              </div>

              {/* ── Affectés cette semaine ── */}
              {assignedHere.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{
                    fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
                    color:'var(--text2)', paddingBottom:6, marginBottom:6,
                    borderBottom:'1px solid var(--border)',
                  }}>
                    Affectés cette semaine
                  </div>
                  {assignedHere.map(m => (
                    <div key={m.id}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0' }}>
                        <span style={{
                          flex:1, fontSize:12,
                          fontWeight: m.type === 'ph' ? 700 : 400,
                          fontStyle:  m.type === 'ph' ? 'normal' : 'italic',
                        }}>
                          {m.prenom} {m.nom}
                          {TYPE_LBL[m.type] && (
                            <em style={{ fontSize:10, opacity:.65, fontStyle:'italic', marginLeft:5 }}>{TYPE_LBL[m.type]}</em>
                          )}
                        </span>
                        <span style={{ fontSize:11, color:'#16a34a', fontWeight:600, whiteSpace:'nowrap' }}>✓ présent</span>
                        <button
                          onClick={() => {
                            const next = modifyingMed === m.id ? null : m.id;
                            setModifyingMed(next);
                            setRemovingMed(null);
                            setAssignMed(null);
                          }}
                          style={{
                            fontSize:11, padding:'3px 10px', borderRadius:20,
                            border:'1.5px solid var(--accent)', cursor:'pointer',
                            fontFamily:'inherit', fontWeight:600, whiteSpace:'nowrap',
                            background: modifyingMed === m.id ? 'var(--accent)' : 'transparent',
                            color:      modifyingMed === m.id ? '#fff' : 'var(--accent)',
                            transition:'background .1s, color .1s',
                          }}
                        >
                          Modifier {modifyingMed === m.id ? '▲' : '▾'}
                        </button>
                        <button
                          onClick={() => {
                            const next = removingMed === m.id ? null : m.id;
                            setRemovingMed(next);
                            setModifyingMed(null);
                            setAssignMed(null);
                          }}
                          style={{
                            fontSize:11, padding:'3px 10px', borderRadius:20,
                            border:'1.5px solid var(--danger)', cursor:'pointer',
                            fontFamily:'inherit', fontWeight:600, whiteSpace:'nowrap',
                            background: removingMed === m.id ? 'var(--danger)' : 'transparent',
                            color:      removingMed === m.id ? '#fff' : 'var(--danger)',
                            transition:'background .1s, color .1s',
                          }}
                        >
                          Retirer {removingMed === m.id ? '▲' : '▾'}
                        </button>
                      </div>
                      {/* ── Panneau de modification inline ── */}
                      {modifyingMed === m.id && (
                        <div style={{
                          margin:'2px 0 8px 8px', padding:'10px 12px',
                          background:'var(--accent-light)', borderRadius:'var(--r)',
                          border:'1px solid rgba(37,99,235,.2)',
                        }}>
                          <div style={{ fontSize:10, fontWeight:600, color:'var(--text2)', marginBottom:8 }}>
                            Nouvelle durée depuis S{wNum} :
                          </div>
                          <DurationPicker
                            durMode={modifyDurMode} setDurMode={setModifyDurMode}
                            durN={modifyDurN} setDurN={setModifyDurN}
                            wNum={wNum} monthLbl={monthLbl}
                          />
                          <div style={{ display:'flex', gap:6, marginTop:10 }}>
                            <button onClick={() => confirmModify(m)} style={{
                              flex:1, padding:'7px', borderRadius:'var(--r)',
                              border:'none', background:'var(--accent)', color:'#fff',
                              cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight:700,
                            }}>
                              Confirmer la modification
                            </button>
                            <button onClick={() => setModifyingMed(null)} style={{
                              padding:'7px 12px', borderRadius:'var(--r)',
                              border:'1px solid var(--border2)', background:'transparent',
                              cursor:'pointer', fontSize:11, color:'var(--text3)', fontFamily:'inherit',
                            }}>
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                      {/* ── Panneau de retrait inline ── */}
                      {removingMed === m.id && (
                        <div style={{
                          margin:'2px 0 8px 8px', padding:'10px 12px',
                          background:'var(--surface2)', borderRadius:'var(--r)',
                          border:'1px solid var(--border2)',
                        }}>
                          <div style={{ fontSize:10, fontWeight:600, color:'var(--text2)', marginBottom:8 }}>Retirer de :</div>
                          <DurationPicker
                            durMode={removeDurMode} setDurMode={setRemoveDurMode}
                            durN={removeDurN} setDurN={setRemoveDurN}
                            wNum={wNum} monthLbl={monthLbl}
                          />
                          <div style={{ display:'flex', gap:6, marginTop:10 }}>
                            <button onClick={() => confirmRemove(m)} style={{
                              flex:1, padding:'7px', borderRadius:'var(--r)',
                              border:'none', background:'var(--danger)', color:'#fff',
                              cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight:700,
                            }}>
                              Confirmer le retrait
                            </button>
                            <button onClick={() => setRemovingMed(null)} style={{
                              padding:'7px 12px', borderRadius:'var(--r)',
                              border:'1px solid var(--border2)', background:'transparent',
                              cursor:'pointer', fontSize:11, color:'var(--text3)', fontFamily:'inherit',
                            }}>
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Ajouter un praticien ── */}
              <div style={{ borderTop: assignedHere.length > 0 ? '1px solid var(--border)' : 'none', paddingTop: assignedHere.length > 0 ? 14 : 0 }}>
                <div style={{
                  fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
                  color:'var(--text2)', marginBottom:8,
                }}>
                  Ajouter un praticien
                </div>
                <input
                  autoFocus={assignedHere.length === 0}
                  type="text"
                  placeholder="Nom, ou type : ph · interne · padhue · ipa…"
                  value={assignSearch}
                  onChange={e => { setAssignSearch(e.target.value); setAssignMed(null); setRemovingMed(null); setModifyingMed(null); }}
                  style={{
                    width:'100%', padding:'7px 10px',
                    border:'1px solid var(--border2)', borderRadius:'var(--r)',
                    fontFamily:'inherit', fontSize:12, marginBottom:6, boxSizing:'border-box',
                  }}
                />

                {/* Résultats de recherche */}
                {assignSearch.trim() ? (
                  <ul style={{
                    listStyle:'none', padding:0, margin:'0 0 10px',
                    maxHeight:180, overflowY:'auto',
                    border:'1px solid var(--border2)', borderRadius:'var(--r)',
                  }}>
                    {assignCandidates.length === 0 ? (
                      <li style={{ padding:'8px 12px', fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>
                        Aucun praticien trouvé
                      </li>
                    ) : assignCandidates.map(m => {
                      const sel = assignMed?.id === m.id;
                      return (
                        <li key={m.id}
                          onClick={() => { setAssignMed(sel ? null : m); setRemovingMed(null); }}
                          style={{
                            padding:'6px 12px', cursor:'pointer', fontSize:12,
                            display:'flex', alignItems:'center', gap:8,
                            background: sel ? 'var(--accent-light)' : 'transparent',
                            borderLeft: sel ? '3px solid var(--accent)' : '3px solid transparent',
                            fontWeight: m.type === 'ph' ? 700 : 400,
                            fontStyle:  m.type === 'ph' ? 'normal' : 'italic',
                            transition:'background .08s',
                          }}>
                          <span style={{ flex:1 }}>{m.prenom} {m.nom}</span>
                          {TYPE_LBL[m.type] && (
                            <span style={{ fontSize:10, color:'var(--text3)' }}>{TYPE_LBL[m.type]}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--text3)', fontStyle:'italic', margin:'2px 0 8px' }}>
                    Tapez un nom ou un type pour rechercher un praticien.
                  </p>
                )}

                {/* DurationPicker + Confirmer (visible quand un candidat est sélectionné) */}
                {assignMed && (
                  <div style={{
                    padding:'10px 12px', marginTop:4,
                    background:'var(--accent-light)',
                    borderRadius:'var(--r)', border:'1px solid rgba(37,99,235,.2)',
                  }}>
                    <div style={{ fontSize:11, color:'var(--text2)', marginBottom:8 }}>
                      Affecter <strong style={{ color:'var(--accent)' }}>{assignMed.prenom} {assignMed.nom}</strong> pour :
                    </div>
                    <DurationPicker
                      durMode={durMode} setDurMode={setDurMode}
                      durN={durN} setDurN={setDurN}
                      wNum={wNum} monthLbl={monthLbl}
                    />
                    <div style={{ display:'flex', gap:8, marginTop:10 }}>
                      <button onClick={confirmAssign} style={{
                        flex:1, padding:'8px', borderRadius:'var(--r)',
                        border:'none', background:'var(--accent)', color:'#fff',
                        cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight:700,
                      }}>
                        Confirmer
                      </button>
                      <button onClick={() => setAssignMed(null)} style={{
                        padding:'8px 16px', borderRadius:'var(--r)',
                        border:'1px solid var(--border2)', background:'transparent',
                        cursor:'pointer', fontSize:11, color:'var(--text3)', fontFamily:'inherit',
                      }}>
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Sélecteur de durée partagé par les deux dialogs ──────────
function DurationPicker({ durMode, setDurMode, durN, setDurN, wNum, monthLbl }) {
  const options = [
    { key:'week',   label:'Cette semaine',  desc:`S${wNum} uniquement` },
    { key:'month',  label:'Ce mois entier', desc:monthLbl },
    { key:'nweeks', label:'N semaines',     desc:'' },
  ];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {options.map(opt => {
        const active = durMode === opt.key;
        return (
          <label key={opt.key} style={{
            display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
            borderRadius:'var(--r)', cursor:'pointer',
            border: active ? '1.5px solid var(--accent)' : '1.5px solid var(--border2)',
            background: active ? 'var(--accent-light)' : 'var(--surface2)',
            fontSize:12, userSelect:'none',
          }}>
            <input type="radio" name="rot-dur" checked={active} onChange={() => setDurMode(opt.key)}
              style={{ accentColor:'var(--accent)', flexShrink:0 }} />
            <span style={{ fontWeight:700, flex:1 }}>{opt.label}</span>
            {opt.key === 'nweeks' ? (
              <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                <input type="number" min={1} max={12} value={durN}
                  onChange={e => setDurN(Math.max(1, Math.min(12, +e.target.value)))}
                  onClick={e => { e.stopPropagation(); setDurMode('nweeks'); }}
                  style={{ width:44, padding:'2px 4px', border:'1px solid var(--border2)', borderRadius:4, fontFamily:'inherit', fontSize:12 }}
                />
                <span style={{ fontSize:10, color:'var(--text2)' }}>sem.</span>
              </span>
            ) : (
              <span style={{ fontSize:10, color:'var(--text2)' }}>{opt.desc}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
