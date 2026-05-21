// components/PlanningGrid.jsx
import { useMemo, useState, useRef, useEffect } from 'react';
import { POSTES, DAYS_FR, toIso, weekDays, worksDay, isAbsent } from '../utils';

// ── Barre de recherche médecin ─────────────────────────────
function DoctorSearch({ medecins, value, onChange }) {
  const [search,    setSearch]    = useState('');
  const [open,      setOpen]      = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const listRef = useRef(null);

  useEffect(() => {
    if (!value) { setSelected(null); setSearch(''); }
  }, [value]);

  // Scroll l'élément actif dans la zone visible
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIdx];
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const q        = search.trim().toLowerCase();
  const filtered = q ? medecins.filter(m => m.nom.toLowerCase().includes(q)) : medecins;

  function pick(m) {
    setSelected(m);
    setSearch(m.nom);
    setOpen(false);
    setActiveIdx(-1);
    onChange(m.id);
  }

  function clear() {
    setSelected(null);
    setSearch('');
    setOpen(false);
    setActiveIdx(-1);
    onChange('');
  }

  function handleKeyDown(e) {
    if (!open || selected) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0) pick(filtered[activeIdx >= 0 ? activeIdx : 0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  return (
    <div style={{ position:'relative', minWidth:190 }}>
      <input
        type="text"
        className="team-search"
        placeholder="Rechercher un médecin…"
        value={search}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setActiveIdx(-1); }, 150)}
        onKeyDown={handleKeyDown}
        onChange={e => {
          setSearch(e.target.value);
          setSelected(null);
          setActiveIdx(-1);
          onChange('');
          setOpen(true);
        }}
        style={{
          width:'100%',
          padding:'4px 24px 4px 28px',
          fontSize:11,
          background: selected ? 'var(--accent-light)' : undefined,
          borderColor: selected ? 'var(--accent-mid)' : undefined,
        }}
      />
      {search && (
        <button
          onMouseDown={e => { e.preventDefault(); clear(); }}
          style={{
            position:'absolute', right:6, top:'50%', transform:'translateY(-50%)',
            background:'none', border:'none', cursor:'pointer',
            color:'var(--text3)', fontSize:15, lineHeight:1, padding:0,
          }}
        >×</button>
      )}
      {open && filtered.length > 0 && !selected && (
        <div ref={listRef} style={{
          position:'absolute', top:'calc(100% + 3px)', left:0, right:0, zIndex:500,
          background:'var(--surface)', border:'1px solid var(--border2)',
          borderRadius:'var(--r)', boxShadow:'0 4px 16px rgba(0,0,0,.13)',
          maxHeight:200, overflowY:'auto',
        }}>
          {filtered.map((m, idx) => (
            <div
              key={m.id}
              onMouseDown={() => pick(m)}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(-1)}
              style={{
                padding:'6px 12px', cursor:'pointer',
                fontSize:11, fontFamily:'sans-serif',
                borderBottom:'1px solid var(--border)',
                background: idx === activeIdx ? 'var(--accent-light)' : '',
              }}
            >
              {m.nom}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtWeek(monday, days) {
  const opts = { day: 'numeric', month: 'long', year: 'numeric' };
  return `${days[0].toLocaleDateString('fr-FR', { day:'numeric', month:'long' })} au ${days[4].toLocaleDateString('fr-FR', opts)}`;
}

// ── Définition des filtres (correspondent à la légende) ────
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

export default function PlanningGrid({ monday, planningData, absences, medecins = [], isSecretary, onCellClick }) {
  const [filter,       setFilter]       = useState(null);
  const [doctorFilter, setDoctorFilter] = useState('');

  const days     = weekDays(monday);
  const todayIso = toIso(new Date());

  const byPoste    = planningData?.affectations || {};
  const exclusions = planningData?.exclusions   || [];
  const extras     = planningData?.extras       || [];

  // ── Alertes (toujours sur l'ensemble des postes, filtre ignoré) ──
  const alerts = useMemo(() => {
    const warns = [];
    days.forEach(d => {
      const di = toIso(d);
      POSTES.filter(p => p.min > 0).forEach(p => {
        const assigned = byPoste[p.id]?.medecins || [];
        const excl     = exclusions.filter(e => e.poste_id === p.id && e.jour === di).map(e => e.med_id);
        const ext      = extras.filter(e => e.poste_id === p.id && e.jour === di).map(e => e.med_id);
        const present  = [
          ...assigned.filter(m => worksDay(m, di, absences) && !excl.includes(m.id)),
          ...ext,
        ];
        if (present.length < p.min)
          warns.push(`${p.lbl.split('—')[0].trim()} (${DAYS_FR[d.getDay() - 1]})`);
      });
    });
    return warns;
  }, [planningData, absences, monday]);

  // ── Groupes de postes (ordre stable défini par POSTES) ──
  const allGroups = useMemo(() => {
    const map = {};
    POSTES.forEach(p => { if (!map[p.grp]) map[p.grp] = []; map[p.grp].push(p); });
    return map;
  }, []);

  const activeFilter  = FILTERS.find(f => f.id === filter);

  // Postes où le médecin filtré apparaît (assigné ou extra) au moins un jour
  const doctorPostes = useMemo(() => {
    if (!doctorFilter) return null;
    const ids = new Set();
    POSTES.forEach(p => {
      const assigned = byPoste[p.id]?.medecins || [];
      if (assigned.some(m => m.id === doctorFilter)) { ids.add(p.id); return; }
      if (days.some(d => extras.some(e => e.poste_id === p.id && e.jour === toIso(d) && e.med_id === doctorFilter)))
        ids.add(p.id);
    });
    return ids;
  }, [doctorFilter, byPoste, extras, days]);

  const baseGroups   = filter === null
    ? Object.entries(allGroups)
    : Object.entries(allGroups).filter(([grp]) => activeFilter?.grps?.includes(grp));

  const visibleGroups = doctorPostes
    ? baseGroups
        .map(([grp, postes]) => [grp, postes.filter(p => doctorPostes.has(p.id))])
        .filter(([, postes]) => postes.length > 0)
    : baseGroups;

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

      {/* ── Filtres / légende + vue médecin + imprimer ── */}
      <div className="print-hide" style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:12, alignItems:'center' }}>
        {/* Filtres par groupe */}
        {FILTERS.map(f => {
          const active = filter === f.id;
          const col    = f.color || 'var(--accent)';
          return (
            <button
              key={String(f.id)}
              onClick={() => setFilter(f.id)}
              style={{
                display:'inline-flex', alignItems:'center', gap:5,
                padding:'4px 11px',
                border:`1.5px solid ${col}`,
                borderRadius:20,
                fontSize:10,
                fontFamily:'system-ui,-apple-system,sans-serif',
                fontWeight:700,
                letterSpacing:'.04em',
                cursor:'pointer',
                transition:'background .12s, color .12s',
                background: active ? col : 'transparent',
                color:      active ? '#fff' : col,
                outline:'none',
              }}
            >
              {f.color && (
                <span style={{
                  width:7, height:7, borderRadius:'50%', flexShrink:0,
                  background: active ? 'rgba(255,255,255,.75)' : f.color,
                }} />
              )}
              {f.label}
            </button>
          );
        })}

        {/* Séparateur + légende "Jour non travaillé" */}
        <span style={{ width:1, height:16, background:'var(--border2)', margin:'0 3px' }} />
        <div className="li">
          <div className="l-hatch" />
          <span style={{ fontSize:10, fontFamily:'sans-serif', color:'var(--text2)' }}>Jour non travaillé</span>
        </div>

        {/* ── Vue médecin ── */}
        {medecins.length > 0 && (
          <>
            <span style={{ width:1, height:16, background:'var(--border2)', margin:'0 3px' }} />
            <span style={{ fontSize:10, fontFamily:'Trebuchet MS,sans-serif', fontWeight:700, color:'var(--text2)', letterSpacing:'.04em', whiteSpace:'nowrap' }}>
              Vue médecin :
            </span>
            <DoctorSearch
              medecins={medecins}
              value={doctorFilter}
              onChange={setDoctorFilter}
            />
          </>
        )}

        {/* ── Bouton imprimer ── */}
        <button
          onClick={() => window.print()}
          style={{
            marginLeft:'auto',
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
      </div>

      {/* ── Grille ── */}
      <div className="grid-wrap">
        <div className="pgrid">

          {/* En-tête colonnes */}
          <div className="gh">
            <div className="ghc" style={{ textAlign:'left', paddingLeft:10 }}>Poste</div>
            {days.map((d, i) => (
              <div key={i} className={`ghc${toIso(d) === todayIso ? ' today' : ''}`}>
                {d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })}
              </div>
            ))}
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
                  {postes.map(p => (
                    <GridRow key={p.id} poste={p} days={days} todayIso={todayIso}
                      assigned={byPoste[p.id]?.medecins || []}
                      exclusions={exclusions} extras={extras} absences={absences}
                      doctorFilter={doctorFilter}
                      isSecretary={isSecretary} onCellClick={onCellClick} />
                  ))}
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Ligne de poste ──────────────────────────────────────────

function GridRow({ poste, days, todayIso, assigned, exclusions, extras, absences, doctorFilter, isSecretary, onCellClick }) {
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
            assigned={assigned} exclusions={exclusions} extras={extras} absences={absences}
            doctorFilter={doctorFilter}
            isSecretary={isSecretary} onClick={() => onCellClick(poste, di)} />
        );
      })}
    </div>
  );
}

// ── Cellule ────────────────────────────────────────────────

function Cell({ poste, dayIso, isToday, assigned, exclusions, extras, absences, doctorFilter, isSecretary, onClick }) {
  const excl      = exclusions.filter(e => e.poste_id === poste.id && e.jour === dayIso).map(e => e.med_id);
  const dayExtras = extras.filter(e => e.poste_id === poste.id && e.jour === dayIso);
  const present   = assigned.filter(m => worksDay(m, dayIso, absences) && !excl.includes(m.id));
  const absent    = assigned.filter(m => isAbsent(m.id, dayIso, absences) && !excl.includes(m.id));
  const anyoneToday = present.length > 0 || dayExtras.length > 0;
  const isOff     = assigned.length > 0 && !anyoneToday && absent.length === 0;

  return (
    <div
      className={`cell${isSecretary ? ' avail' : ''}${isToday ? ' today' : ''}`}
      style={isOff ? { background:'var(--off-stripe)', cursor: isSecretary ? 'pointer' : 'default' } : {}}
      onClick={isSecretary ? onClick : undefined}
    >
      {present.map(m => {
        const highlighted = doctorFilter === m.id;
        return (
          <div key={m.id} className="chip" style={{
            background:  poste.c + (highlighted ? '33' : '18'),
            borderColor: poste.c + (highlighted ? 'cc' : '55'),
            boxShadow:   highlighted ? `0 0 0 2px ${poste.c}55` : 'none',
          }}>
            <span className="chip-nm" style={{ color: poste.c }}>{m.nom}</span>
          </div>
        );
      })}
      {dayExtras.map(e => {
        const highlighted = doctorFilter === e.med_id;
        return (
          <div key={e.med_id} className="chip" style={{
            background:  poste.c + (highlighted ? '44' : '28'),
            borderColor: poste.c + (highlighted ? 'cc' : '88'),
            boxShadow:   highlighted ? `0 0 0 2px ${poste.c}55` : 'none',
          }}>
            <span className="chip-nm" style={{ color: poste.c }}>
              {e.nom} <span style={{ fontSize:8, opacity:.7 }}>(remplac.)</span>
            </span>
          </div>
        );
      })}
      {absent.map(m => (
        <div key={m.id} className="chip-abs">{m.nom} (absent)</div>
      ))}
      {isSecretary && <span className="add-lnk print-hide">+ affecter</span>}
    </div>
  );
}
