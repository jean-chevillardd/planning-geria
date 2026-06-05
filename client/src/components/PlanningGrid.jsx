// components/PlanningGrid.jsx
import { useMemo, useState, useRef } from 'react';
import { POSTES, DAYS_FR, toIso, weekDays, worksDay, isAbsent, getSchedHalfDay, getFrenchHolidays, getDisponiblesPH } from '../utils';

function fmtWeek(monday, days) {
  const opts = { day: 'numeric', month: 'long', year: 'numeric' };
  return `${days[0].toLocaleDateString('fr-FR', { day:'numeric', month:'long' })} au ${days[4].toLocaleDateString('fr-FR', opts)}`;
}

// ── Fusion CSG 1 (Sénior + Interne) et CSG 2 pour l'affichage ──
const POSTES_MAP = Object.fromEntries(POSTES.map(p => [p.id, p]));

const POSTES_DISPLAY = POSTES.reduce((acc, p) => {
  if (p.id === 'csg1i1' || p.id === 'csg2i1') return acc;
  if (p.id === 'csg1a') return [...acc, { ...p, lbl: 'CSG 1', short: 'CSG 1', combineWith: 'csg1i1' }];
  if (p.id === 'csg2a') return [...acc, { ...p, lbl: 'CSG 2', short: 'CSG 2', combineWith: 'csg2i1' }];
  return [...acc, p];
}, []);

function typeRank(type) {
  if (type === 'ph')     return 0;
  if (type === 'padhue') return 1;
  if (type === 'interne' || type === 'externe') return 2;
  return 3;
}
function isSenior(type) { return type === 'ph'; }

const TYPE_LABEL = { interne: 'Interne', externe: 'Externe', padhue: 'PADHUE', ipa: 'IPA' };

// P16 — « Tout afficher » supprimé ; sous-groupes identiques à la vue mensuelle
const FILTERS = [
  { id: 'cs',      label: 'Court séjour',     color: '#2563eb', grps: ['Court séjour'] },
  { id: 'ssr',     label: 'SSR',              color: '#1D9E75', grps: ['SSR'] },
  { id: 'hdj',     label: 'HDJ',              color: '#ea580c', grps: ['Hôpital de jour'] },
  { id: 'ucc',     label: 'UCC/EMCC',         color: '#e11d48', grps: ['UCC / EMCC'] },
  { id: 'extra',   label: 'Extra-hosp.',      color: '#0891b2', grps: ['Extra-hospitalier'] },
  { id: 'tnc',     label: 'Tps non clin.',    color: '#9333ea', grps: ['Temps non clinique'] },
  { id: 'ehpad',   label: 'EHPAD',            color: '#d97706', grps: ['EHPAD'] },
  { id: 'consult', label: 'Consultations',    color: '#7c3aed', grps: ['Consultations'] },
];

// ── Composant principal ────────────────────────────────────

export default function PlanningGrid({ monday, planningData, absences, medecins = [], isSecretary, onCellClick, doctorFilter = '', onOpenAstreintes, onMove, onAssign, showAvailablePanel = false }) {
  const [filter,             setFilterState]       = useState(null);
  const [subFilter,          setSubFilter]         = useState(null);
  const [dragInfo,           setDragInfo]          = useState(null);   // chip en cours de drag (déplacement)
  const [pendingMove,        setPendingMove]       = useState(null);   // déplacement en attente de confirmation
  const [panelDragMed,       setPanelDragMed]      = useState(null);   // PH glissé depuis le panneau dispo
  const [pendingPanelAssign, setPendingPanelAssign] = useState(null);  // affectation depuis panneau en attente

  function setFilter(id) { setFilterState(id); setSubFilter(null); }

  const days     = weekDays(monday);
  const todayIso = toIso(new Date());
  const weekKey  = toIso(monday);

  const holidays = useMemo(() => {
    const map = new Map();
    days.forEach(d => {
      const iso  = toIso(d);
      const name = getFrenchHolidays(d.getFullYear()).get(iso);
      if (name) map.set(iso, name);
    });
    return map;
  }, [monday]);

  const byPoste    = planningData?.affectations || {};
  const exclusions = planningData?.exclusions   || [];
  const extras     = planningData?.extras       || [];
  const renforts   = planningData?.renforts     || [];

  // ── Disponibles PH cette semaine (groupés 5j / partiels) ──
  const disponibles = useMemo(() => {
    if (!showAvailablePanel) return { full: [], partial: [] };
    return getDisponiblesPH(medecins, absences, days, byPoste, exclusions, extras);
  }, [showAvailablePanel, medecins, absences, monday, byPoste, exclusions, extras]);

  // ── PH en congés cette semaine (panel informatif, toujours affiché si mode édition) ──
  const TYPE_ABS_SHORT = {
    'Congé annuel (CA)': 'CA', 'Congé maladie': 'CM', 'Congé maternité': 'C. Mat.',
    'RTT': 'RTT', 'Récupération de garde': 'Récup.', 'Formation': 'Form.',
    'Activité hors site': 'Hors site',
  };
  const enCongesSemaine = useMemo(() => {
    if (!showAvailablePanel) return [];
    const dayIsos  = days.map(d => toIso(d));
    const firstIso = dayIsos[0];
    const lastIso  = dayIsos[dayIsos.length - 1];
    const result   = [];
    for (const m of medecins) {
      if (!m.actif || m.type !== 'ph') continue;
      const semAbs = absences.filter(a =>
        a.med_id === m.id && a.date_debut <= lastIso && a.date_fin >= firstIso
      );
      if (semAbs.length === 0) continue;
      const absItems = [];
      for (const a of semAbs) {
        const coveredDays = dayIsos.filter(iso => {
          if (iso < a.date_debut || iso > a.date_fin) return false;
          const dow = new Date(iso + 'T12:00:00').getDay();
          if (dow === 0 || dow === 6) return false;
          const idx = (dow - 1) * 2;
          return !!(m.sched[idx] || m.sched[idx + 1]);
        });
        if (coveredDays.length === 0) continue;
        const nums         = coveredDays.map(d => parseInt(d.split('-')[2], 10));
        const coveredSet   = new Set(coveredDays);
        const workBetween  = dayIsos.filter(iso => {
          if (iso < coveredDays[0] || iso > coveredDays[coveredDays.length - 1]) return false;
          const dow = new Date(iso + 'T12:00:00').getDay();
          if (dow === 0 || dow === 6) return false;
          const idx = (dow - 1) * 2;
          return !!(m.sched[idx] || m.sched[idx + 1]);
        });
        const isContiguous = workBetween.every(d => coveredSet.has(d));
        let label;
        if (nums.length === 1)      label = `le ${nums[0]}`;
        else if (isContiguous)      label = `du ${nums[0]} au ${nums[nums.length - 1]}`;
        else                        label = `les ${nums.slice(0, -1).join(', ')} et ${nums[nums.length - 1]}`;
        absItems.push({ typeShort: TYPE_ABS_SHORT[a.type_abs] ?? a.type_abs, label });
      }
      if (absItems.length > 0) result.push({ ...m, absItems });
    }
    result.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return result;
  }, [showAvailablePanel, medecins, absences, monday]);

  // ── Compteur PH présents par jour ──
  // Restreint aux services indispensables (dispensable:false).
  // Les demi-journées (sched am OU pm uniquement) comptent 0,5.
  // Pas de plafond : au-delà du quota le compteur continue d'augmenter.
  const phPerDay = useMemo(() => {
    const result = {};
    days.forEach(d => {
      const di = toIso(d);
      if (holidays.has(di)) { result[di] = null; return; }
      // medId → contribution max (0.5 demi-journée, 1 journée complète)
      const phContrib = new Map();
      const addContrib = (medId, contrib) =>
        phContrib.set(medId, Math.max(phContrib.get(medId) ?? 0, contrib));

      POSTES_DISPLAY.filter(p => !p.dispensable).forEach(p => {
        const allIds = [p.id, ...(p.combineWith ? [p.combineWith] : [])];
        const excl = exclusions
          .filter(e => allIds.includes(e.poste_id) && e.jour === di)
          .map(e => e.med_id);
        allIds.forEach(pid => {
          (byPoste[pid]?.medecins || [])
            .filter(m => m.type === 'ph' && worksDay(m, di, absences) && !excl.includes(m.id))
            .forEach(m => addContrib(m.id, getSchedHalfDay(m, di) ? 0.5 : 1));
        });
        extras
          .filter(e => allIds.includes(e.poste_id) && e.jour === di && e.type === 'ph')
          .forEach(e => addContrib(e.med_id, 1));
      });
      const total = [...phContrib.values()].reduce((a, b) => a + b, 0);
      // Arrondi au 0,5 le plus proche pour éviter les erreurs float
      result[di] = Math.round(total * 2) / 2;
    });
    return result;
  }, [planningData, absences, monday, holidays]);

  // ── Alertes ──────────────────────────────────────────────
  const alerts = useMemo(() => {
    const warns = [];
    const alertSet = new Set();
    days.forEach(d => {
      const di = toIso(d);
      if (holidays.has(di)) return;
      POSTES_DISPLAY.filter(p => p.min > 0 || p.minPH > 0).forEach(p => {
        if (p.id === 'hdj' && new Date(di + 'T12:00:00').getDay() === 3) return;
        const allIds   = [p.id, ...(p.combineWith ? [p.combineWith] : [])];
        const assigned = allIds.flatMap(pid => byPoste[pid]?.medecins || []);
        const excl     = exclusions.filter(e => allIds.includes(e.poste_id) && e.jour === di).map(e => e.med_id);
        const ext      = extras.filter(e => allIds.includes(e.poste_id) && e.jour === di);
        if (p.minPH) {
          const phTotal =
            assigned
              .filter(m => m.type === 'ph' && worksDay(m, di, absences) && !excl.includes(m.id))
              .reduce((sum, m) => sum + (getSchedHalfDay(m, di) ? 0.5 : 1), 0)
            + ext.filter(e => e.type === 'ph').length;
          if (phTotal < p.minPH) {
            warns.push(`${p.lbl} (${DAYS_FR[d.getDay() - 1]})`);
            alertSet.add(`${p.id}:${di}`);
          }
        } else {
          const presentTotal =
            assigned
              .filter(m => worksDay(m, di, absences) && !excl.includes(m.id))
              .reduce((sum, m) => sum + (getSchedHalfDay(m, di) ? 0.5 : 1), 0)
            + ext.length;
          if (presentTotal < p.min) {
            warns.push(`${p.lbl} (${DAYS_FR[d.getDay() - 1]})`);
            alertSet.add(`${p.id}:${di}`);
          }
        }
      });
    });
    return { warns, alertSet };
  }, [planningData, absences, monday, holidays]);

  const allGroups = useMemo(() => {
    const map = {};
    POSTES_DISPLAY.forEach(p => { if (!map[p.grp]) map[p.grp] = []; map[p.grp].push(p); });
    return map;
  }, []);

  const activeFilter = FILTERS.find(f => f.id === filter) ?? null;

  const doctorPostes = useMemo(() => {
    if (!doctorFilter) return null;
    const ids = new Set();
    POSTES_DISPLAY.forEach(p => {
      const allIds   = [p.id, ...(p.combineWith ? [p.combineWith] : [])];
      const assigned = allIds.flatMap(pid => byPoste[pid]?.medecins || []);
      if (assigned.some(m => m.id === doctorFilter)) { ids.add(p.id); return; }
      if (allIds.some(pid => days.some(d =>
        extras.some(e => e.poste_id === pid && e.jour === toIso(d) && e.med_id === doctorFilter)
      ))) ids.add(p.id);
    });
    return ids;
  }, [doctorFilter, byPoste, extras, days]);

  // P16 — filtrage par groupe + sous-filtre
  let baseGroups = filter === null
    ? Object.entries(allGroups)
    : Object.entries(allGroups).filter(([grp]) => activeFilter?.grps?.includes(grp));

  if (subFilter) {
    baseGroups = baseGroups
      .map(([grp, postes]) => [grp, postes.filter(p => p.short === subFilter)])
      .filter(([, postes]) => postes.length > 0);
  }

  const visibleGroups = doctorPostes
    ? baseGroups
        .map(([grp, postes]) => [grp, postes.filter(p => doctorPostes.has(p.id))])
        .filter(([, postes]) => postes.length > 0)
    : baseGroups;

  // ── Drag & Drop chip (déplacement entre postes) ──────────

  function handleChipDragStart(info) { setDragInfo(info); }
  function handleChipDragEnd()       { setDragInfo(null); }

  function handleCellDrop(targetPoste) {
    if (!dragInfo) return;
    if (targetPoste.id === dragInfo.sourcePid) { setDragInfo(null); return; }
    if (targetPoste.intern && dragInfo.medType !== 'interne') { setDragInfo(null); return; }
    if (!targetPoste.intern && dragInfo.medType === 'interne') { setDragInfo(null); return; }
    setPendingMove({ ...dragInfo, targetPoste });
    setDragInfo(null);
  }

  async function confirmMove(mode) {
    if (!pendingMove || !onMove) return;
    await onMove({
      mode,
      weekKey,
      sourcePid: pendingMove.sourcePid,
      targetPid: pendingMove.targetPoste.id,
      medId:     pendingMove.medId,
      dayIso:    pendingMove.dayIso,
      isExtra:   pendingMove.isExtra,
    });
    setPendingMove(null);
  }

  // ── Drag & Drop panneau → cellule (P14) ──────────────────

  function handlePanelDragStart(m) { setPanelDragMed(m); }
  function handlePanelDragEnd()    { setPanelDragMed(null); }

  function handlePanelCellDrop(targetPoste, dayIso) {
    if (!panelDragMed) return;
    setPendingPanelAssign({ med: panelDragMed, targetPoste, dayIso });
    setPanelDragMed(null);
  }

  async function confirmPanelAssign(mode, autoExcludeDays = []) {
    if (!pendingPanelAssign || !onAssign) return;
    await onAssign({
      mode,
      medId:          pendingPanelAssign.med.id,
      targetPid:      pendingPanelAssign.targetPoste.id,
      dayIso:         pendingPanelAssign.dayIso,
      weekKey,
      autoExcludeDays,
    });
    setPendingPanelAssign(null);
  }

  // Labels dialog déplacement
  const moveDayLabel = pendingMove
    ? new Date(pendingMove.dayIso + 'T12:00:00')
        .toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
    : '';
  const moveSrcName = pendingMove ? (POSTES_MAP[pendingMove.sourcePid]?.lbl ?? pendingMove.sourcePid) : '';
  const moveTgtName = pendingMove ? pendingMove.targetPoste.lbl : '';

  // Labels dialog affectation depuis panneau
  const panelAssignDayLabel = pendingPanelAssign
    ? new Date(pendingPanelAssign.dayIso + 'T12:00:00')
        .toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
    : '';

  return (
    <div>
      {/* ── Titre impression ── */}
      <div className="print-only print-title">
        Planning — Semaine du {fmtWeek(monday, days)}
      </div>

      {/* ── Alerte couverture ── */}
      <div className={`alert print-hide ${alerts.warns.length === 0 ? 'alert-ok' : 'alert-warn'}`} style={{ marginBottom: 10, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {alerts.warns.length === 0 ? (
          <span>✓ Tous les postes obligatoires sont couverts.</span>
        ) : (
          <>
            <span style={{ fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
              ⚠ {alerts.warns.length} créneau{alerts.warns.length > 1 ? 'x' : ''} non couvert{alerts.warns.length > 1 ? 's' : ''}
            </span>
            <span style={{ width:1, height:14, background:'currentColor', opacity:0.3, flexShrink:0 }}/>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {alerts.warns.slice(0, 8).map((w, i) => (
                <span key={i} style={{
                  background:'rgba(0,0,0,.08)', borderRadius:4,
                  padding:'2px 7px', fontSize:11, fontWeight:600, whiteSpace:'nowrap',
                }}>
                  {w}
                </span>
              ))}
              {alerts.warns.length > 8 && (
                <span style={{ fontSize:11, opacity:0.7, alignSelf:'center' }}>
                  +{alerts.warns.length - 8} autres
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Filtres / légende (P16) ── */}
      <div className="print-hide" style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:12, alignItems:'flex-start' }}>
        {FILTERS.map(f => {
          const active     = filter === f.id;
          const subShorts  = [...new Set(
            POSTES_DISPLAY.filter(p => f.grps.includes(p.grp)).map(p => p.short).filter(Boolean)
          )];
          const hasSubPills = subShorts.length > 1;
          return (
            <div key={f.id} style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:4 }}>
              <button
                onClick={() => { setFilter(active ? null : f.id); }}
                title={active ? 'Cliquer pour tout réafficher' : ''}
                style={{
                  display:'inline-flex', alignItems:'center', gap:5,
                  padding:'4px 11px', border:`1.5px solid ${f.color}`, borderRadius:20,
                  fontSize:10, fontFamily:'inherit',
                  fontWeight:700, letterSpacing:'.04em', cursor:'pointer',
                  transition:'background .12s, color .12s',
                  background: active ? f.color : 'transparent',
                  color:      active ? '#fff'  : f.color, outline:'none',
                }}
              >
                <span style={{ width:7, height:7, borderRadius:'50%', flexShrink:0,
                  background: active ? 'rgba(255,255,255,.75)' : f.color }} />
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
                <div style={{ display:'flex', flexWrap:'wrap', gap:3, paddingLeft:10,
                  borderLeft:`2px solid ${f.color}55`, marginLeft:7 }}>
                  {subShorts.map(short => {
                    const isSub = subFilter === short;
                    return (
                      <button key={short}
                        onClick={() => setSubFilter(isSub ? null : short)}
                        style={{
                          padding:'2px 9px', borderRadius:14, fontSize:9, fontFamily:'inherit',
                          fontWeight: isSub ? 700 : 500, letterSpacing:'.03em',
                          cursor:'pointer', outline:'none',
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
        <span style={{ width:1, height:16, background:'var(--border2)', margin:'0 3px', alignSelf:'center' }} />
        <div className="li" style={{ alignSelf:'center' }}>
          <div className="l-hatch" />
          <span style={{ fontSize:10, fontFamily:'sans-serif', color:'var(--text2)' }}>Jour non travaillé</span>
        </div>
        {isSecretary && (
          <>
            <span style={{ width:1, height:16, background:'var(--border2)', margin:'0 3px', alignSelf:'center' }} />
            <div className="li" style={{ alignSelf:'center' }}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ opacity:.5 }}>
                <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M3.5 5.5h4M5.5 3.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize:10, fontFamily:'sans-serif', color:'var(--text2)' }}>Glisser pour déplacer</span>
            </div>
          </>
        )}
        <button
          onClick={() => { document.body.dataset.date = new Date().toLocaleDateString('fr-FR'); window.print(); }}
          style={{
            marginLeft:'auto', fontSize:10, padding:'4px 11px', borderRadius:20,
            fontFamily:'inherit', fontWeight:700,
            letterSpacing:'.04em', cursor:'pointer',
            border:'1.5px solid var(--border2)', background:'transparent', color:'var(--text2)',
            display:'inline-flex', alignItems:'center', gap:5, alignSelf:'center',
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

      {/* ── Grille + panneau disponibilités ── */}
      <div className="planning-layout">
      <div className="grid-wrap">
        <div className="pgrid">
          {/* En-tête colonnes */}
          <div className="gh">
            <div className="ghc" style={{ textAlign:'left', paddingLeft:10 }}>Poste</div>
            {days.map((d, i) => {
              const di          = toIso(d);
              const isToday     = di === todayIso;
              const holidayName = holidays.get(di);
              return (
                <div key={i} className={`ghc${isToday ? ' today' : ''}`}
                  style={{ ...((!isToday && holidayName) ? { background:'var(--holiday-stripe)', color:'#d97706' } : {}), display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                  <span>{d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })}</span>
                  {holidayName && (
                    <>
                      <div style={{ fontSize:8, fontWeight:600, marginTop:2, lineHeight:1.2, color: isToday ? 'inherit' : '#b45309' }}>
                        {holidayName}
                      </div>
                      {onOpenAstreintes && (
                        <button
                          onClick={e => { e.stopPropagation(); onOpenAstreintes(di); }}
                          style={{
                            marginTop:4, cursor:'pointer', padding:'2px 7px', borderRadius:20,
                            fontSize:9, fontFamily:'inherit',
                            fontWeight:700, letterSpacing:'.03em',
                            border: isToday ? '1.5px solid rgba(255,255,255,.55)' : '1.5px solid #f6c05c',
                            background: isToday ? 'rgba(255,255,255,.15)' : '#fffbeb',
                            color: isToday ? 'inherit' : '#b45309',
                            display:'inline-block', transition:'background .1s, color .1s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = isToday ? 'rgba(255,255,255,.28)' : '#fef3c7'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = isToday ? 'rgba(255,255,255,.15)' : '#fffbeb'; }}
                        >
                          Astreintes
                        </button>
                      )}
                    </>
                  )}
                  {phPerDay[di] != null && (() => {
                    const count = phPerDay[di];
                    const quota = new Date(di + 'T12:00:00').getDay() === 3 ? 11 : 12;
                    const ratio = count / quota;
                    const [col, bg] = ratio >= 1
                      ? ['#16a34a', '#f0fdf4']
                      : ratio >= 0.75
                        ? ['#c2410c', '#fff7ed']
                        : ['#dc2626', '#fef2f2'];
                    const displayCount = count % 1 === 0 ? count : count.toFixed(1);
                    return (
                      <div style={{
                        display:'flex', alignItems:'center',
                        padding:'2px 7px', borderRadius:20,
                        fontSize:9, fontWeight:700, letterSpacing:'.03em',
                        color: col, background: bg,
                        border: `1.5px solid ${col}`,
                      }}>
                        {displayCount} PH / {quota}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {/* Lignes filtrées */}
          <div>
            {visibleGroups.length === 0 ? (
              <div style={{ padding:'1.5rem', fontFamily:'sans-serif', fontSize:12, color:'var(--text3)', textAlign:'center' }}>
                Aucun poste à afficher pour ce filtre.
              </div>
            ) : (
              visibleGroups.map(([grp, postes]) => (
                <div key={grp}>
                  <div className="grp-hdr-row">
                    <div className="grp-hdr">{grp}</div>
                  </div>
                  {postes.map(p => {
                    const combinedColor = p.combineWith ? POSTES_MAP[p.combineWith]?.c : null;
                    const assigned = [
                      ...(byPoste[p.id]?.medecins || []),
                      ...(p.combineWith
                        ? (byPoste[p.combineWith]?.medecins || []).map(m => ({ ...m, _color: combinedColor }))
                        : []),
                    ];
                    return (
                      <GridRow key={p.id} poste={p} days={days} todayIso={todayIso}
                        assigned={assigned}
                        exclusions={exclusions} extras={extras} renforts={renforts} absences={absences}
                        doctorFilter={doctorFilter} holidays={holidays}
                        alertSet={alerts.alertSet}
                        isSecretary={isSecretary} onCellClick={onCellClick}
                        dragInfo={dragInfo}
                        onChipDragStart={handleChipDragStart}
                        onChipDragEnd={handleChipDragEnd}
                        onCellDrop={handleCellDrop}
                        panelDragMed={panelDragMed}
                        onPanelCellDrop={handlePanelCellDrop}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Panneaux latéraux (disponibles + congés) ── */}
      {showAvailablePanel && (
        <div className="print-hide" style={{ position:'sticky', top:60, alignSelf:'flex-start', display:'flex', flexDirection:'column', gap:10, width:188, flexShrink:0, order:-1 }}>

          {/* Panneau PH disponibles */}
          <div className="available-panel" style={{ position:'static', maxHeight:'calc(55vh - 50px)' }}>
            <div className="available-panel-header">
              PH disponibles
              <span
                className="available-count"
                aria-label={`${disponibles.full.length + disponibles.partial.length} praticiens PH disponibles cette semaine`}
              >
                {disponibles.full.length + disponibles.partial.length}
              </span>
            </div>
            {isSecretary && (
              <div className="panel-drag-hint" aria-label="Glisser un PH sur une cellule pour l'affecter">
                <svg width="9" height="13" viewBox="0 0 9 13" fill="currentColor" aria-hidden="true" style={{ flexShrink:0 }}>
                  <circle cx="2" cy="2"  r="1.3"/><circle cx="7" cy="2"  r="1.3"/>
                  <circle cx="2" cy="6.5" r="1.3"/><circle cx="7" cy="6.5" r="1.3"/>
                  <circle cx="2" cy="11" r="1.3"/><circle cx="7" cy="11" r="1.3"/>
                </svg>
                Glisser un PH sur une cellule
              </div>
            )}
            {disponibles.full.length === 0 && disponibles.partial.length === 0 ? (
              <p className="available-empty">Aucun PH disponible cette semaine</p>
            ) : (
              <>
                {disponibles.full.length > 0 && (
                  <>
                    <div className="available-group-label">Présents cette semaine</div>
                    <ul className="available-list">
                      {disponibles.full.map(m => (
                        <li key={m.id} className="available-item"
                          draggable={isSecretary ? true : undefined}
                          onDragStart={isSecretary ? e => { e.stopPropagation(); handlePanelDragStart(m); } : undefined}
                          onDragEnd={isSecretary ? handlePanelDragEnd : undefined}
                        >
                          {isSecretary && (
                            <span className="drag-handle" aria-hidden="true">
                              <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
                                <circle cx="1.5" cy="1.5" r="1.2"/><circle cx="4.5" cy="1.5" r="1.2"/>
                                <circle cx="1.5" cy="5"   r="1.2"/><circle cx="4.5" cy="5"   r="1.2"/>
                                <circle cx="1.5" cy="8.5" r="1.2"/><circle cx="4.5" cy="8.5" r="1.2"/>
                              </svg>
                            </span>
                          )}
                          <span className="available-dot" style={{ background: '#16a34a' }} />
                          <span>
                            {m.prenom} {m.nom}
                            {m.schedNote && <span className="available-days">{m.schedNote}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {disponibles.partial.length > 0 && (
                  <>
                    <div className="available-group-label" style={{ marginTop: disponibles.full.length ? 10 : 0 }}>Présents partiellement</div>
                    <ul className="available-list">
                      {disponibles.partial.map(m => (
                        <li key={m.id} className="available-item"
                          draggable={isSecretary ? true : undefined}
                          onDragStart={isSecretary ? e => { e.stopPropagation(); handlePanelDragStart(m); } : undefined}
                          onDragEnd={isSecretary ? handlePanelDragEnd : undefined}
                        >
                          {isSecretary && (
                            <span className="drag-handle" aria-hidden="true">
                              <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
                                <circle cx="1.5" cy="1.5" r="1.2"/><circle cx="4.5" cy="1.5" r="1.2"/>
                                <circle cx="1.5" cy="5"   r="1.2"/><circle cx="4.5" cy="5"   r="1.2"/>
                                <circle cx="1.5" cy="8.5" r="1.2"/><circle cx="4.5" cy="8.5" r="1.2"/>
                              </svg>
                            </span>
                          )}
                          <span className="available-dot" style={{ background: '#f59e0b' }} />
                          <span>
                            {m.prenom} {m.nom}
                            <span className="available-days">{m.joursPresents.join(' ')}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>

          {/* Panneau En congés cette semaine */}
          {enCongesSemaine.length > 0 && (
            <div className="available-panel" style={{ position:'static', maxHeight:'none', overflowY:'visible' }}>
              <div className="available-panel-header">
                En congés cette sem.
                <span className="available-count" style={{ background:'var(--text3)' }}>
                  {enCongesSemaine.length}
                </span>
              </div>
              <ul className="available-list">
                {enCongesSemaine.map(m => (
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
      </div>

      {/* ── Dialog confirmation déplacement chip ── */}
      {pendingMove && (
        <div
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,.38)',
            zIndex:700, display:'flex', alignItems:'center', justifyContent:'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setPendingMove(null); }}
        >
          <div style={{
            background:'var(--surface)', borderRadius:'var(--rl)',
            border:'1px solid var(--border2)', padding:'1.5rem',
            width:400, boxShadow:'0 8px 32px rgba(0,0,0,.18)',
            fontFamily:'inherit',
          }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>
              Déplacer {pendingMove.medNom}
            </div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:18, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontWeight:600 }}>{moveSrcName}</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, opacity:.5 }}>
                <path d="M2 7h10M8 3l4 4-4 4"/>
              </svg>
              <span style={{ fontWeight:600 }}>{moveTgtName}</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              <button onClick={() => confirmMove('day')}
                style={{ textAlign:'left', padding:'10px 14px', borderRadius:'var(--r)', cursor:'pointer',
                  border:'1.5px solid var(--border2)', background:'var(--surface2)', color:'var(--text)',
                  fontSize:12, fontFamily:'inherit', transition:'border-color .1s, background .1s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; }}
              >
                <div style={{ fontWeight:700, marginBottom:2 }}>Ce jour uniquement</div>
                <div style={{ fontSize:10, color:'var(--text2)', textTransform:'capitalize' }}>{moveDayLabel}</div>
              </button>
              <button onClick={() => confirmMove('week')}
                style={{ textAlign:'left', padding:'10px 14px', borderRadius:'var(--r)', cursor:'pointer',
                  border:'1.5px solid var(--border2)', background:'var(--surface2)', color:'var(--text)',
                  fontSize:12, fontFamily:'inherit', transition:'border-color .1s, background .1s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; }}
              >
                <div style={{ fontWeight:700, marginBottom:2 }}>Toute la semaine</div>
                <div style={{ fontSize:10, color:'var(--text2)' }}>
                  {pendingMove.isExtra ? "Remplace l'affectation ponctuelle par une affectation semaine" : 'Toutes les vacations sont déplacées'}
                </div>
              </button>
            </div>
            <button onClick={() => setPendingMove(null)}
              style={{ width:'100%', padding:'6px', border:'1px solid var(--border2)',
                borderRadius:'var(--r)', background:'transparent', cursor:'pointer',
                fontSize:11, color:'var(--text3)', fontFamily:'inherit' }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── Dialog confirmation affectation depuis panneau (P14) ── */}
      {pendingPanelAssign && (() => {
        const { med, targetPoste, dayIso: dIso } = pendingPanelAssign;
        const tIds = [targetPoste.id, ...(targetPoste.combineWith ? [targetPoste.combineWith] : [])];

        // Garde "Toute la semaine" : bloqué si le PH a une affectation régulière ou un renfort
        // ailleurs. Les extras (remplaçants ponctuels) ne bloquent plus — leurs jours seront
        // automatiquement exclus à la confirmation (même logique que AssignModal / P19).
        const weekBlock =
          Object.values(byPoste).some(p => p.medecins?.some(m => m.id === med.id)) ||
          renforts.some(r => r.med_id === med.id);

        // Jours à auto-exclure si le PH est déjà remplaçant dans un autre poste cette semaine
        const weekAutoExcludeDays = extras
          .filter(e => e.med_id === med.id && !tIds.includes(e.poste_id))
          .map(e => e.jour);

        // Garde "Ce jour" : bloqué si le PH est déjà occupé ce jour dans un autre poste
        const dayBlock =
          extras.some(e => e.med_id === med.id && e.jour === dIso && !tIds.includes(e.poste_id)) ||
          renforts.some(r => r.med_id === med.id && r.jour === dIso && !tIds.includes(r.poste_id)) ||
          Object.entries(byPoste).some(([pid, data]) =>
            !tIds.includes(pid) &&
            data.medecins?.some(m =>
              m.id === med.id &&
              !exclusions.some(e => e.poste_id === pid && e.med_id === med.id && e.jour === dIso) &&
              worksDay(m, dIso, absences)
            )
          );

        return (
        <div
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,.38)',
            zIndex:700, display:'flex', alignItems:'center', justifyContent:'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setPendingPanelAssign(null); }}
        >
          <div style={{
            background:'var(--surface)', borderRadius:'var(--rl)',
            border:'1px solid var(--border2)', padding:'1.5rem',
            width:380, boxShadow:'0 8px 32px rgba(0,0,0,.18)',
            fontFamily:'inherit',
          }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>
              Affecter {med.prenom} {med.nom}
            </div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:18 }}>
              → <strong>{targetPoste.lbl}</strong>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              <button
                onClick={dayBlock ? undefined : () => confirmPanelAssign('day')}
                disabled={dayBlock}
                title={dayBlock ? 'Déjà en poste ou remplaçant ailleurs ce jour' : undefined}
                style={{ textAlign:'left', padding:'10px 14px', borderRadius:'var(--r)',
                  cursor: dayBlock ? 'not-allowed' : 'pointer',
                  border:'1.5px solid var(--border2)', background:'var(--surface2)', color:'var(--text)',
                  fontSize:12, fontFamily:'inherit', opacity: dayBlock ? 0.45 : 1,
                  transition:'border-color .1s, background .1s' }}
                onMouseEnter={!dayBlock ? e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)'; } : undefined}
                onMouseLeave={!dayBlock ? e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; } : undefined}
              >
                <div style={{ fontWeight:700, marginBottom:2 }}>Ce jour uniquement</div>
                <div style={{ fontSize:10, textTransform:'capitalize',
                  color: dayBlock ? '#dc2626' : 'var(--text2)' }}>
                  {dayBlock ? 'Déjà occupé ce jour' : panelAssignDayLabel}
                </div>
              </button>
              <button
                onClick={weekBlock ? undefined : () => confirmPanelAssign('week', weekAutoExcludeDays)}
                disabled={weekBlock}
                title={weekBlock
                  ? 'Déjà affecté quelque part cette semaine'
                  : weekAutoExcludeDays.length > 0
                    ? `Affecter à la semaine — sera exclu automatiquement le ${weekAutoExcludeDays.map(d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'short', day:'numeric' })).join(', ')} (déjà remplaçant)`
                    : undefined}
                style={{ textAlign:'left', padding:'10px 14px', borderRadius:'var(--r)',
                  cursor: weekBlock ? 'not-allowed' : 'pointer',
                  border:'1.5px solid var(--border2)', background:'var(--surface2)', color:'var(--text)',
                  fontSize:12, fontFamily:'inherit', opacity: weekBlock ? 0.45 : 1,
                  transition:'border-color .1s, background .1s' }}
                onMouseEnter={!weekBlock ? e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)'; } : undefined}
                onMouseLeave={!weekBlock ? e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; } : undefined}
              >
                <div style={{ fontWeight:700, marginBottom:2 }}>
                  Toute la semaine{weekAutoExcludeDays.length > 0 && !weekBlock ? ' *' : ''}
                </div>
                <div style={{ fontSize:10, color: weekBlock ? '#dc2626' : 'var(--text2)' }}>
                  {weekBlock
                    ? 'Déjà affecté cette semaine'
                    : weekAutoExcludeDays.length > 0
                      ? `Exclu automatiquement le ${weekAutoExcludeDays.map(d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'short', day:'numeric' })).join(', ')}`
                      : 'Affectation hebdomadaire'}
                </div>
              </button>
            </div>
            <button onClick={() => setPendingPanelAssign(null)}
              style={{ width:'100%', padding:'6px', border:'1px solid var(--border2)',
                borderRadius:'var(--r)', background:'transparent', cursor:'pointer',
                fontSize:11, color:'var(--text3)', fontFamily:'inherit' }}
            >
              Annuler
            </button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// ── Ligne de poste ──────────────────────────────────────────

function GridRow({ poste, days, todayIso, assigned, exclusions, extras, renforts, absences, doctorFilter, holidays, alertSet, isSecretary, onCellClick, dragInfo, onChipDragStart, onChipDragEnd, onCellDrop, panelDragMed, onPanelCellDrop }) {
  const daysPresent = {};
  assigned.forEach(m => {
    daysPresent[m.id] = days.filter(d => worksDay(m, toIso(d), absences)).length;
  });

  const stableOrder = {};
  [...assigned]
    .sort((a, b) => {
      const ra = typeRank(a.type ?? ''), rb = typeRank(b.type ?? '');
      if (ra !== rb) return ra - rb;
      const da = daysPresent[a.id] ?? 0, db = daysPresent[b.id] ?? 0;
      if (da !== db) return db - da;
      return a.nom.localeCompare(b.nom, 'fr');
    })
    .forEach((m, i) => { stableOrder[m.id] = i; });

  return (
    <div className="grow">
      <div className="pname">
        <span style={{ color: poste.c }}>{poste.lbl}</span>
        {(poste.min > 0 || poste.minPH > 0) && (() => {
          const hasAlert = alertSet && days.some(d => alertSet.has(`${poste.id}:${toIso(d)}`));
          const seuil = poste.minPH ?? poste.min;
          return (
            <span className="pname-quota">
              <span className={`pmin ${hasAlert ? 'warn' : 'ok'}`}>min {seuil}</span>
              <span
                className={`pname-status ${hasAlert ? 'warn' : 'ok'}`}
                title={hasAlert ? 'Créneau non couvert cette semaine' : 'Couverture OK'}
              >
                {hasAlert ? '✕' : '✓'}
              </span>
            </span>
          );
        })()}
      </div>
      {days.map(d => {
        const di = toIso(d);
        return (
          <Cell key={di} poste={poste} dayIso={di} isToday={di === todayIso}
            assigned={assigned} stableOrder={stableOrder}
            exclusions={exclusions} extras={extras} renforts={renforts} absences={absences}
            doctorFilter={doctorFilter} isHoliday={holidays.has(di)}
            isSecretary={isSecretary} onClick={() => onCellClick(poste, di)}
            dragInfo={dragInfo}
            onChipDragStart={onChipDragStart}
            onChipDragEnd={onChipDragEnd}
            onCellDrop={onCellDrop}
            panelDragMed={panelDragMed}
            onPanelCellDrop={onPanelCellDrop}
          />
        );
      })}
    </div>
  );
}

// ── Cellule ────────────────────────────────────────────────

function Cell({ poste, dayIso, isToday, assigned, stableOrder = {}, exclusions, extras, renforts, absences, doctorFilter, isHoliday, isSecretary, onClick, dragInfo, onChipDragStart, onChipDragEnd, onCellDrop, panelDragMed, onPanelCellDrop }) {
  const [isOver,  setIsOver]  = useState(false);
  const dragCounter           = useRef(0);

  const isHdjWednesday = poste.id === 'hdj' && new Date(dayIso).getDay() === 3;

  if (isHoliday || isHdjWednesday) {
    return (
      <div
        className={`cell${isToday ? ' today' : ''}`}
        style={!isToday ? { background:'var(--holiday-stripe)', cursor: isHdjWednesday ? 'not-allowed' : undefined } : undefined}
        title={isHdjWednesday ? 'HDJ fermé le mercredi' : undefined}
      />
    );
  }

  const allPosteIds = [poste.id, ...(poste.combineWith ? [poste.combineWith] : [])];

  const excl = exclusions
    .filter(e => allPosteIds.includes(e.poste_id) && e.jour === dayIso)
    .map(e => e.med_id);

  const dayExtras   = extras
    .filter(e => allPosteIds.includes(e.poste_id) && e.jour === dayIso)
    .map(e => ({ ...e, _color: e.poste_id !== poste.id ? (POSTES_MAP[e.poste_id]?.c || poste.c) : null }));

  const dayRenforts = (renforts || [])
    .filter(r => allPosteIds.includes(r.poste_id) && r.jour === dayIso);

  const present = assigned.filter(m => worksDay(m, dayIso, absences) && !excl.includes(m.id));
  const absent  = assigned.filter(m => isAbsent(m.id, dayIso, absences) && !excl.includes(m.id));

  const anyoneToday = present.length > 0 || dayExtras.length > 0 || dayRenforts.length > 0;
  const isOff = assigned.length > 0 && !anyoneToday && absent.length === 0;

  const cellBg = isOff
    ? { background:'var(--off-stripe)', cursor: isSecretary ? 'pointer' : 'default' }
    : {};

  const allChips = [
    ...present.map(m => ({
      key: m.id,
      id: m.id, nom: m.nom, type: m.type,
      isExtra: false,
      color: m._color || poste.c,
      srcPid: poste.id,
      halfDay: getSchedHalfDay(m, dayIso),
    })),
    ...dayExtras.map(e => ({
      key: e.med_id + '-x',
      id: e.med_id, nom: e.nom, type: e.type,
      isExtra: true, isRenfort: false,
      color: e._color || poste.c,
      srcPid: e.poste_id,
      halfDay: null,
    })),
    ...dayRenforts.map(r => ({
      key: r.med_id + '-r',
      id: r.med_id, nom: r.nom, type: r.type,
      isExtra: false, isRenfort: true,
      color: poste.c,
      srcPid: poste.id,
      halfDay: null,
    })),
  ].sort((a, b) => {
    const ra = typeRank(a.type ?? ''), rb = typeRank(b.type ?? '');
    if (ra !== rb) return ra - rb;
    if (a.isRenfort !== b.isRenfort) return a.isRenfort ? 1 : -1;
    if (a.isExtra !== b.isExtra) return a.isExtra ? 1 : -1;
    if (!a.isExtra && !a.isRenfort) return (stableOrder[a.id] ?? 9999) - (stableOrder[b.id] ?? 9999);
    return a.nom.localeCompare(b.nom, 'fr');
  });

  // ── Drop handlers ──────────────────────────────────────
  function handleDragEnter(e) {
    e.preventDefault();
    dragCounter.current++;
    setIsOver(true);
  }
  function handleDragLeave() {
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsOver(false); }
  }
  function handleDrop(e) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsOver(false);
    if (panelDragMed) {
      onPanelCellDrop(poste, dayIso);
    } else {
      onCellDrop(poste);
    }
  }

  const isDropActive = isOver && (dragInfo || panelDragMed);

  return (
    <div
      className={`cell${isSecretary ? ' avail' : ''}${isToday ? ' today' : ''}${isDropActive ? ' drop-target' : ''}`}
      style={cellBg}
      onClick={isSecretary ? onClick : undefined}
      onDragOver={isSecretary ? e => e.preventDefault() : undefined}
      onDragEnter={isSecretary ? handleDragEnter : undefined}
      onDragLeave={isSecretary ? handleDragLeave : undefined}
      onDrop={isSecretary ? handleDrop : undefined}
    >
      {allChips.map(chip => {
        const highlighted = doctorFilter === chip.id;
        const senior      = isSenior(chip.type);
        const dragging    = dragInfo?.medId === chip.id;
        const { color, isExtra, isRenfort } = chip;
        return (
          <div
            key={chip.key}
            className="chip"
            draggable={isSecretary && !isRenfort ? true : undefined}
            onDragStart={isSecretary && !isRenfort ? e => {
              e.stopPropagation();
              onChipDragStart({ medId: chip.id, medNom: chip.nom, medType: chip.type, sourcePid: chip.srcPid, dayIso, isExtra });
            } : undefined}
            onDragEnd={isSecretary && !isRenfort ? onChipDragEnd : undefined}
            style={{
              background:  isRenfort ? '#d9770610' : color + (highlighted ? '33' : senior ? '18' : '0d'),
              borderColor: isRenfort ? '#d9770655' : color + (highlighted ? 'cc' : senior ? '55' : '2e'),
              borderStyle: isRenfort ? 'dashed' : 'solid',
              boxShadow:   highlighted ? `0 0 0 2px ${color}55` : 'none',
              opacity:     dragging ? 0.35 : 1,
              cursor:      isSecretary && !isRenfort ? 'grab' : 'default',
              transition:  'opacity .15s',
            }}
          >
            <span className="chip-nm" style={{
              color:      isRenfort ? '#b45309' : color + (highlighted || senior ? '' : 'a0'),
              fontWeight: senior ? 700 : 400,
              fontStyle:  senior ? 'normal' : 'italic',
            }}>
              {chip.nom}
              {!senior && TYPE_LABEL[chip.type] && <em style={{ fontStyle:'italic', opacity:.75 }}> — {TYPE_LABEL[chip.type]}</em>}
              {isExtra && <span style={{ fontSize:8, opacity:.7 }}> (remplac.)</span>}
              {isRenfort && (
                <span style={{
                  marginLeft:4, fontSize:7, borderRadius:3, padding:'0 4px',
                  background:'#d9770618', border:'1px solid #d9770644',
                  color:'#b45309', fontWeight:700, fontStyle:'normal',
                }}>renfort</span>
              )}
              {chip.halfDay && (
                <span style={{
                  marginLeft:3, fontSize:7, borderRadius:3, padding:'0 3px',
                  background:'#d9770618', border:'1px solid #d9770644',
                  color:'#b45309', fontWeight:700, flexShrink:0,
                }}>
                  {chip.halfDay === 'matin' ? 'matin' : 'après-midi'}
                </span>
              )}
            </span>
          </div>
        );
      })}


      {isSecretary && <span className="add-lnk print-hide">+ affecter</span>}
    </div>
  );
}
