// components/PlanningGrid.jsx
import { useMemo, useState, useRef } from 'react';
import { POSTES, DAYS_FR, toIso, weekDays, worksDay, isAbsent, getSchedHalfDay, getFrenchHolidays } from '../utils';

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

const FILTERS = [
  { id: null,      label: 'Tout afficher',    color: null,      grps: null },
  { id: 'cs',      label: 'Court séjour',     color: '#2272f0', grps: ['Court séjour 1', 'Court séjour 2'] },
  { id: 'ssr',     label: 'SSR',              color: '#1D9E75', grps: ['SSR'] },
  { id: 'hdj',     label: 'HDJ',              color: '#ea580c', grps: ['Hôpital de jour'] },
  { id: 'ucc',     label: 'UCC/EMCC',         color: '#e11d48', grps: ['UCC / EMCC'] },
  { id: 'extra',   label: 'Extra-hosp.',      color: '#0891b2', grps: ['Extra-hospitalier'] },
  { id: 'tnc',     label: 'Tps non clin.',    color: '#9333ea', grps: ['Temps non clinique'] },
  { id: 'ehpad',   label: 'EHPAD',            color: '#d97706', grps: ['EHPAD'] },
  { id: 'consult', label: 'Consultations',    color: '#7c3aed', grps: ['Consultations'] },
];

// ── Composant principal ────────────────────────────────────

export default function PlanningGrid({ monday, planningData, absences, medecins = [], isSecretary, onCellClick, doctorFilter = '', onOpenAstreintes, onMove }) {
  const [filter,      setFilter]      = useState(null);
  const [dragInfo,    setDragInfo]    = useState(null);   // chip en cours de drag
  const [pendingMove, setPendingMove] = useState(null);   // en attente de confirmation

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

  // ── Alertes ──────────────────────────────────────────────
  const alerts = useMemo(() => {
    const warns = [];
    days.forEach(d => {
      const di = toIso(d);
      if (holidays.has(di)) return;
      POSTES_DISPLAY.filter(p => p.min > 0).forEach(p => {
        const allIds   = [p.id, ...(p.combineWith ? [p.combineWith] : [])];
        const assigned = allIds.flatMap(pid => byPoste[pid]?.medecins || []);
        const excl     = exclusions.filter(e => allIds.includes(e.poste_id) && e.jour === di).map(e => e.med_id);
        const ext      = extras.filter(e => allIds.includes(e.poste_id) && e.jour === di);
        const present  = [
          ...assigned.filter(m => worksDay(m, di, absences) && !excl.includes(m.id)),
          ...ext,
        ];
        if (present.length < p.min)
          warns.push(`${p.lbl} (${DAYS_FR[d.getDay() - 1]})`);
      });
    });
    return warns;
  }, [planningData, absences, monday, holidays]);

  const allGroups = useMemo(() => {
    const map = {};
    POSTES_DISPLAY.forEach(p => { if (!map[p.grp]) map[p.grp] = []; map[p.grp].push(p); });
    return map;
  }, []);

  const activeFilter = FILTERS.find(f => f.id === filter);

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

  const baseGroups = filter === null
    ? Object.entries(allGroups)
    : Object.entries(allGroups).filter(([grp]) => activeFilter?.grps?.includes(grp));

  const visibleGroups = doctorPostes
    ? baseGroups
        .map(([grp, postes]) => [grp, postes.filter(p => doctorPostes.has(p.id))])
        .filter(([, postes]) => postes.length > 0)
    : baseGroups;

  // ── Drag & Drop handlers ──────────────────────────────────

  function handleChipDragStart(info) {
    setDragInfo(info);
  }

  function handleChipDragEnd() {
    setDragInfo(null);
  }

  function handleCellDrop(targetPoste) {
    if (!dragInfo) return;
    // Même poste : annuler
    if (targetPoste.id === dragInfo.sourcePid) { setDragInfo(null); return; }
    // Incompatibilité interne/non-interne
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

  // Labels pour la dialog
  const moveDayLabel = pendingMove
    ? new Date(pendingMove.dayIso + 'T12:00:00')
        .toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
    : '';
  const moveSrcName = pendingMove ? (POSTES_MAP[pendingMove.sourcePid]?.lbl ?? pendingMove.sourcePid) : '';
  const moveTgtName = pendingMove ? pendingMove.targetPoste.lbl : '';

  return (
    <div>
      {/* ── Titre impression ── */}
      <div className="print-only print-title">
        Planning — Semaine du {fmtWeek(monday, days)}
      </div>

      {/* ── Alerte couverture ── */}
      <div className={`alert print-hide ${alerts.length === 0 ? 'alert-ok' : 'alert-warn'}`} style={{ marginBottom:10 }}>
        {alerts.length === 0
          ? '✓ Tous les postes obligatoires sont couverts.'
          : `⚠ ${alerts.length} créneau(x) non couvert(s) : ${alerts.slice(0, 6).join(' · ')}${alerts.length > 6 ? ' …' : ''}`}
      </div>

      {/* ── Filtres / légende ── */}
      <div className="print-hide" style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:12, alignItems:'center' }}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          const col    = f.color || 'var(--accent)';
          return (
            <button
              key={String(f.id)}
              onClick={() => setFilter(f.id)}
              style={{
                display:'inline-flex', alignItems:'center', gap:5,
                padding:'4px 11px', border:`1.5px solid ${col}`, borderRadius:20,
                fontSize:10, fontFamily:'system-ui,-apple-system,sans-serif',
                fontWeight:700, letterSpacing:'.04em', cursor:'pointer',
                transition:'background .12s, color .12s',
                background: active ? col : 'transparent',
                color:      active ? '#fff' : col, outline:'none',
              }}
            >
              {f.color && (
                <span style={{ width:7, height:7, borderRadius:'50%', flexShrink:0,
                  background: active ? 'rgba(255,255,255,.75)' : f.color }} />
              )}
              {f.label}
            </button>
          );
        })}
        <span style={{ width:1, height:16, background:'var(--border2)', margin:'0 3px' }} />
        <div className="li">
          <div className="l-hatch" />
          <span style={{ fontSize:10, fontFamily:'sans-serif', color:'var(--text2)' }}>Jour non travaillé</span>
        </div>
        {isSecretary && (
          <>
            <span style={{ width:1, height:16, background:'var(--border2)', margin:'0 3px' }} />
            <div className="li">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ opacity:.5 }}>
                <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M3.5 5.5h4M5.5 3.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize:10, fontFamily:'sans-serif', color:'var(--text2)' }}>Glisser pour déplacer</span>
            </div>
          </>
        )}
        <button
          onClick={() => window.print()}
          style={{
            marginLeft:'auto', fontSize:10, padding:'4px 11px', borderRadius:20,
            fontFamily:'system-ui,-apple-system,sans-serif', fontWeight:700,
            letterSpacing:'.04em', cursor:'pointer',
            border:'1.5px solid var(--border2)', background:'transparent', color:'var(--text2)',
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
      </div>

      {/* ── Grille ── */}
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
                  style={!isToday && holidayName ? { background:'var(--holiday-stripe)', color:'#d97706' } : undefined}>
                  {d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })}
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
                            fontSize:9, fontFamily:'system-ui,-apple-system,sans-serif',
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
                        exclusions={exclusions} extras={extras} absences={absences}
                        doctorFilter={doctorFilter} holidays={holidays}
                        isSecretary={isSecretary} onCellClick={onCellClick}
                        dragInfo={dragInfo}
                        onChipDragStart={handleChipDragStart}
                        onChipDragEnd={handleChipDragEnd}
                        onCellDrop={handleCellDrop}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Dialog confirmation déplacement ── */}
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
            fontFamily:'system-ui,-apple-system,sans-serif',
          }}>
            {/* Titre */}
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

            {/* Options */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              <button
                onClick={() => confirmMove('day')}
                style={{
                  textAlign:'left', padding:'10px 14px',
                  borderRadius:'var(--r)', cursor:'pointer',
                  border:'1.5px solid var(--border2)',
                  background:'var(--surface2)', color:'var(--text)',
                  fontSize:12, fontFamily:'inherit',
                  transition:'border-color .1s, background .1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; }}
              >
                <div style={{ fontWeight:700, marginBottom:2 }}>Ce jour uniquement</div>
                <div style={{ fontSize:10, color:'var(--text2)', textTransform:'capitalize' }}>{moveDayLabel}</div>
              </button>

              <button
                onClick={() => confirmMove('week')}
                style={{
                  textAlign:'left', padding:'10px 14px',
                  borderRadius:'var(--r)', cursor:'pointer',
                  border:'1.5px solid var(--border2)',
                  background:'var(--surface2)', color:'var(--text)',
                  fontSize:12, fontFamily:'inherit',
                  transition:'border-color .1s, background .1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; }}
              >
                <div style={{ fontWeight:700, marginBottom:2 }}>Toute la semaine</div>
                <div style={{ fontSize:10, color:'var(--text2)' }}>
                  {pendingMove.isExtra ? 'Remplace l\'affectation ponctuelle par une affectation semaine' : 'Toutes les vacations sont déplacées'}
                </div>
              </button>
            </div>

            <button
              onClick={() => setPendingMove(null)}
              style={{
                width:'100%', padding:'6px', border:'1px solid var(--border2)',
                borderRadius:'var(--r)', background:'transparent', cursor:'pointer',
                fontSize:11, color:'var(--text3)', fontFamily:'inherit',
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ligne de poste ──────────────────────────────────────────

function GridRow({ poste, days, todayIso, assigned, exclusions, extras, absences, doctorFilter, holidays, isSecretary, onCellClick, dragInfo, onChipDragStart, onChipDragEnd, onCellDrop }) {
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
        <div className="pdot" style={{ background: poste.c }} />
        <span>{poste.lbl}</span>
        {poste.min > 0 && <span className="pmin">min {poste.min}</span>}
      </div>
      {days.map(d => {
        const di = toIso(d);
        return (
          <Cell key={di} poste={poste} dayIso={di} isToday={di === todayIso}
            assigned={assigned} stableOrder={stableOrder}
            exclusions={exclusions} extras={extras} absences={absences}
            doctorFilter={doctorFilter} isHoliday={holidays.has(di)}
            isSecretary={isSecretary} onClick={() => onCellClick(poste, di)}
            dragInfo={dragInfo}
            onChipDragStart={onChipDragStart}
            onChipDragEnd={onChipDragEnd}
            onCellDrop={onCellDrop}
          />
        );
      })}
    </div>
  );
}

// ── Cellule ────────────────────────────────────────────────

function Cell({ poste, dayIso, isToday, assigned, stableOrder = {}, exclusions, extras, absences, doctorFilter, isHoliday, isSecretary, onClick, dragInfo, onChipDragStart, onChipDragEnd, onCellDrop }) {
  const [isOver,  setIsOver]  = useState(false);
  const dragCounter           = useRef(0);

  if (isHoliday) {
    return (
      <div
        className={`cell${isToday ? ' today' : ''}`}
        style={!isToday ? { background:'var(--holiday-stripe)' } : undefined}
      />
    );
  }

  const allPosteIds = [poste.id, ...(poste.combineWith ? [poste.combineWith] : [])];

  const excl = exclusions
    .filter(e => allPosteIds.includes(e.poste_id) && e.jour === dayIso)
    .map(e => e.med_id);

  const dayExtras = extras
    .filter(e => allPosteIds.includes(e.poste_id) && e.jour === dayIso)
    .map(e => ({ ...e, _color: e.poste_id !== poste.id ? (POSTES_MAP[e.poste_id]?.c || poste.c) : null }));

  const present = assigned.filter(m => worksDay(m, dayIso, absences) && !excl.includes(m.id));
  const absent  = assigned.filter(m => isAbsent(m.id, dayIso, absences) && !excl.includes(m.id));

  const anyoneToday = present.length > 0 || dayExtras.length > 0;
  const isOff = assigned.length > 0 && !anyoneToday && absent.length === 0;

  const cellBg = isOff
    ? { background:'var(--off-stripe)', cursor: isSecretary ? 'pointer' : 'default' }
    : {};

  // Fusion présents + extras dans une liste unique triée :
  // 1. typeRank  2. réguliers avant extras (même type)  3. stableOrder / alphabétique
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
      isExtra: true,
      color: e._color || poste.c,
      srcPid: e.poste_id,
    })),
  ].sort((a, b) => {
    const ra = typeRank(a.type ?? ''), rb = typeRank(b.type ?? '');
    if (ra !== rb) return ra - rb;
    // Même type : régulier avant extra
    if (a.isExtra !== b.isExtra) return a.isExtra ? 1 : -1;
    // Réguliers : ordre stable calculé sur la semaine
    if (!a.isExtra) return (stableOrder[a.id] ?? 9999) - (stableOrder[b.id] ?? 9999);
    // Extras : alphabétique
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
    onCellDrop(poste);
  }

  // Est-ce que le drag en cours vient de cette cellule ?
  const isDragSource = dragInfo && dragInfo.sourcePid === poste.id && dragInfo.dayIso === dayIso;

  return (
    <div
      className={`cell${isSecretary ? ' avail' : ''}${isToday ? ' today' : ''}${isOver && dragInfo ? ' drop-target' : ''}`}
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
        const { color, isExtra } = chip;
        return (
          <div
            key={chip.key}
            className="chip"
            draggable={isSecretary ? true : undefined}
            onDragStart={isSecretary ? e => {
              e.stopPropagation();
              onChipDragStart({ medId: chip.id, medNom: chip.nom, medType: chip.type, sourcePid: chip.srcPid, dayIso, isExtra });
            } : undefined}
            onDragEnd={isSecretary ? onChipDragEnd : undefined}
            style={{
              background:  color + (highlighted ? '33' : senior ? '18' : '0d'),
              borderColor: color + (highlighted ? 'cc' : senior ? '55' : '2e'),
              boxShadow:   highlighted ? `0 0 0 2px ${color}55` : 'none',
              opacity:     dragging ? 0.35 : 1,
              cursor:      isSecretary ? 'grab' : 'default',
              transition:  'opacity .15s',
            }}
          >
            <span className="chip-nm" style={{
              color:      color + (highlighted || senior ? '' : 'a0'),
              fontWeight: senior ? 700 : 400,
              fontStyle:  senior ? 'normal' : 'italic',
            }}>
              {chip.nom}
              {!senior && TYPE_LABEL[chip.type] && <em style={{ fontStyle:'italic', opacity:.75 }}> — {TYPE_LABEL[chip.type]}</em>}
              {isExtra && <span style={{ fontSize:8, opacity:.7 }}> (remplac.)</span>}
              {chip.halfDay && (
                <span style={{
                  marginLeft:3, fontSize:7, borderRadius:3, padding:'0 3px',
                  background:'#d9770618', border:'1px solid #d9770644',
                  color:'#b45309', fontWeight:700, flexShrink:0,
                }}>
                  {chip.halfDay === 'matin' ? '½M' : '½AM'}
                </span>
              )}
            </span>
          </div>
        );
      })}

      {absent.map(m => {
        const absSenior = isSenior(m.type);
        return (
          <div key={m.id} className="chip-abs">
            {m.nom}
            {!absSenior && TYPE_LABEL[m.type] && <em style={{ fontStyle:'italic', opacity:.75 }}> — {TYPE_LABEL[m.type]}</em>}
            {' '}(absent)
          </div>
        );
      })}

      {isSecretary && <span className="add-lnk print-hide">+ affecter</span>}
    </div>
  );
}
