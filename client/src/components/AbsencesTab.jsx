// components/AbsencesTab.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import * as api from '../api';
import { getFrenchHolidays } from '../utils';

// ── Constantes ──────────────────────────────────────────────
// Ordre et libellés des catégories de personnel
const TYPE_ORDER  = { ph:0, padhue:1, ipa:2, interne:3, externe:4 };
const TYPE_LABELS = {
  ph:      'Praticiens Hospitaliers (PH)',
  padhue:  'PADHUE',
  ipa:     'IPA',
  interne: 'Internes',
  externe: 'Externes',
};

const TYPES_ABS = [
  'Congé annuel (CA)', 'Congé maladie', 'Congé maternité',
  'RTT', 'Récupération de garde', 'Formation',
  'Activité hors site',
];

const MONTHS_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

const DAYS_HDR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
const TRACK_H  = 24;
const DAY_H    = 32;

// ── Couleurs par type d'absence (fixes, sémantiques) ────────
const TYPE_COLORS = {
  'Congé annuel (CA)':  '#2272f0', // bleu
  'Congé maladie':      '#e11d48', // rose
  'Congé maternité':    '#db2777', // rose fuchsia
  'RTT':                '#4f46e5', // indigo
  'Récupération de garde': '#ea580c', // orange
  'Formation':          '#059669', // émeraude
  'Activité hors site': '#d97706', // ambre
};
function typeColor(typeAbs) { return TYPE_COLORS[typeAbs] ?? '#6A6A66'; }

// ── Palette couleurs par praticien (légende filtre calendrier) ─
const PALETTE = [
  '#2272f0','#059669','#e11d48','#db2777','#0891b2',
  '#9333ea','#0d9488','#ea580c','#4f46e5','#d97706',
  '#7c3aed','#6366f1','#047857','#b91c1c','#92400e',
];
function medColor(medId) {
  let h = 0;
  for (let i = 0; i < medId.length; i++) h = (h * 31 + medId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ── Utilitaires date ────────────────────────────────────────
// ⚠ Méthodes locales pour éviter le décalage UTC+x
function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayIso() { return toIso(new Date()); }

function countWorkingDays(d1, d2) {
  let n = 0;
  const end = new Date(d2 + 'T12:00:00');
  for (let d = new Date(d1 + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow > 0 && dow < 6) n++;
  }
  return n;
}

function getCurrentWeekRange() {
  const today = new Date();
  const dow   = today.getDay();
  const mon   = new Date(today);
  mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  return { mon: toIso(mon), fri: toIso(fri) };
}

function getMonthWeeks(monthStart) {
  const year    = monthStart.getFullYear();
  const month   = monthStart.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const dow     = firstDay.getDay();
  const monday  = new Date(firstDay);
  monday.setDate(firstDay.getDate() - (dow === 0 ? 6 : dow - 1));
  const weeks = [];
  let cur = new Date(monday);
  while (cur <= lastDay) {
    const week = [];
    for (let d = 0; d < 5; d++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    cur.setDate(cur.getDate() + 2);
    weeks.push(week);
  }
  return weeks;
}

function computeBars(absences, weekDays) {
  const ws = toIso(weekDays[0]);
  const we = toIso(weekDays[4]);
  const bars = [];
  absences.forEach(a => {
    if (a.date_fin < ws || a.date_debut > we) return;
    const bsIso = a.date_debut > ws ? a.date_debut : ws;
    const beIso = a.date_fin   < we ? a.date_fin   : we;
    const cs = weekDays.findIndex(d => toIso(d) === bsIso);
    const ce = weekDays.findIndex(d => toIso(d) === beIso);
    bars.push({ abs: a, colStart: cs >= 0 ? cs : 0, colEnd: ce >= 0 ? ce : 4 });
  });
  bars.sort((a, b) => a.colStart - b.colStart || (b.colEnd - b.colStart) - (a.colEnd - a.colStart));
  const trackEnds = [];
  bars.forEach(bar => {
    let t = trackEnds.findIndex(e => e < bar.colStart);
    if (t === -1) { t = trackEnds.length; trackEnds.push(bar.colEnd); }
    else trackEnds[t] = bar.colEnd;
    bar.track = t;
  });
  return bars;
}

// ── Sélecteur de plage de dates (calendrier) ─────────────────
function DateRangePicker({ start, end, onChange }) {
  const [open,  setOpen]  = useState(false);
  const [phase, setPhase] = useState('start'); // 'start' | 'end'
  const [hover, setHover] = useState(null);
  const [month, setMonth] = useState(() => {
    const d = start ? new Date(start + 'T12:00:00') : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const ref = useRef(null);

  // Ferme si clic hors du picker
  useEffect(() => {
    if (!open) return;
    function h(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false); setPhase('start'); setHover(null);
      }
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Jours du calendrier (alignés sur lundi)
  const calDays = useMemo(() => {
    const y = month.getFullYear(), mo = month.getMonth();
    const first = new Date(y, mo, 1);
    const last  = new Date(y, mo + 1, 0);
    const dow   = first.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    const cur = new Date(first);
    cur.setDate(first.getDate() + offset);
    const days = [];
    while (true) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
      if (cur > last && cur.getDay() === 1) break;
    }
    return days;
  }, [month]);

  const todayStr = todayIso();
  // Fin effective incluant l'aperçu survol
  const effEnd = phase === 'end' && hover && start
    ? (hover >= start ? hover : start)
    : end;

  function handleDayClick(iso) {
    if (phase === 'start' || iso < start) {
      onChange({ start: iso, end: iso });
      setPhase('end');
    } else {
      onChange({ start, end: iso });
      setOpen(false); setPhase('start'); setHover(null);
    }
  }

  function fmtFr(iso) {
    if (!iso) return '?';
    return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
  }

  const triggerLabel = start && end
    ? (start === end ? fmtFr(start) : `${fmtFr(start)} → ${fmtFr(end)}`)
    : 'Sélectionner la période…';

  const CAL_DAYS_HDR = ['L','M','M','J','V','S','D'];

  return (
    <div ref={ref} style={{ position:'relative' }}>
      {/* ── Bouton déclencheur ── */}
      <button
        type="button"
        onClick={() => { if (!open) { setPhase('start'); setHover(null); } setOpen(v => !v); }}
        style={{
          display:'flex', alignItems:'center', gap:6, width:'100%',
          padding:'0 10px', height:30, boxSizing:'border-box',
          border:`1px solid ${open ? 'var(--accent-mid)' : 'var(--border2)'}`,
          borderRadius:'var(--r)',
          background: open ? 'var(--accent-light)' : 'var(--surface)',
          cursor:'pointer', fontSize:12, fontFamily:'sans-serif',
          color: start ? 'var(--text)' : 'var(--text3)',
          textAlign:'left', transition:'border-color .1s, background .1s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span>{triggerLabel}</span>
      </button>

      {/* ── Popover calendrier ── */}
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:600,
          background:'var(--surface)', border:'1px solid var(--border2)',
          borderRadius:'var(--rl)', boxShadow:'0 8px 28px rgba(0,0,0,.18)',
          padding:'14px', width:276,
        }}>
          {/* Indication de phase */}
          <div style={{
            fontSize:10, fontFamily:'Trebuchet MS,sans-serif', fontWeight:700,
            letterSpacing:'.03em', color:'var(--accent)',
            background:'var(--accent-light)', borderRadius:'var(--r)',
            padding:'4px 8px', marginBottom:10, textAlign:'center',
          }}>
            {phase === 'start' ? '① Cliquez sur la date de début' : '② Cliquez sur la date de fin'}
          </div>

          {/* Navigation mois */}
          <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
            <button type="button" className="wn-btn"
              onClick={e => { e.stopPropagation(); setMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1)); }}>‹</button>
            <span style={{ flex:1, textAlign:'center', fontSize:12, fontFamily:'sans-serif', fontWeight:600 }}>
              {month.toLocaleDateString('fr-FR', { month:'long', year:'numeric' })}
            </span>
            <button type="button" className="wn-btn"
              onClick={e => { e.stopPropagation(); setMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1)); }}>›</button>
          </div>

          {/* En-têtes jours */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:1, marginBottom:3 }}>
            {CAL_DAYS_HDR.map((d, i) => (
              <div key={i} style={{
                textAlign:'center', fontSize:9, fontFamily:'Trebuchet MS,sans-serif', fontWeight:700,
                color: i >= 5 ? 'var(--text3)' : 'var(--text2)',
              }}>{d}</div>
            ))}
          </div>

          {/* Grille jours */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:1 }}>
            {calDays.map((d, i) => {
              const iso         = toIso(d);
              const inCurMonth  = d.getMonth() === month.getMonth();
              const isWeekend   = d.getDay() === 0 || d.getDay() === 6;
              const isToday     = iso === todayStr;
              const isStart     = iso === start;
              const isEnd       = !!effEnd && iso === effEnd;
              const isInRange   = !!(start && effEnd && iso > start && iso < effEnd);
              const isSelected  = isStart || isEnd;
              const holidayName = inCurMonth && !isWeekend ? getFrenchHolidays(d.getFullYear()).get(iso) : null;

              let bg     = holidayName && !isSelected && !isInRange ? 'var(--holiday-stripe)' : 'transparent';
              let color  = !inCurMonth ? 'var(--text3)' : isWeekend ? 'var(--text3)' : holidayName ? '#d97706' : 'var(--text)';
              let radius = 4;
              if (isSelected) { bg = 'var(--accent)'; color = '#fff'; radius = '50%'; }
              else if (isInRange) { bg = 'var(--accent-light)'; color = 'var(--text)'; radius = 0; }

              return (
                <div key={i}
                  onClick={() => inCurMonth && handleDayClick(iso)}
                  onMouseEnter={() => phase === 'end' && inCurMonth && setHover(iso)}
                  onMouseLeave={() => phase === 'end' && setHover(null)}
                  title={holidayName || undefined}
                  style={{
                    height:30, display:'flex', alignItems:'center', justifyContent:'center',
                    borderRadius: radius, background: bg, color,
                    fontWeight: isToday ? 700 : holidayName ? 600 : 400,
                    fontSize:12, fontFamily:'sans-serif',
                    cursor: inCurMonth ? 'pointer' : 'default',
                    outline: isToday && !isSelected ? '1.5px solid var(--accent)' : 'none',
                    outlineOffset:-1,
                    opacity: !inCurMonth ? .35 : 1,
                    transition:'background .08s',
                  }}
                >{d.getDate()}</div>
              );
            })}
          </div>

          {/* Raccourcis rapides (phase start) */}
          {phase === 'start' && (
            <div style={{ marginTop:10, display:'flex', gap:5, flexWrap:'wrap' }}>
              {[
                { label:"Aujourd'hui", fn:() => { onChange({start:todayStr, end:todayStr}); setOpen(false); }},
                { label:'Cette semaine', fn:() => { const r = getCurrentWeekRange(); onChange({start:r.mon, end:r.fri}); setOpen(false); }},
              ].map(s => (
                <button key={s.label} type="button" onClick={s.fn} style={{
                  padding:'2px 9px', fontSize:9, borderRadius:10,
                  fontFamily:'Trebuchet MS,sans-serif', fontWeight:700,
                  border:'1px solid var(--border2)', background:'transparent',
                  color:'var(--text2)', cursor:'pointer',
                }}>{s.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Champ de recherche praticien ────────────────────────────
function MedSearchInput({ medecins, value, onChange, placeholder = 'Ajouter un congé pour…' }) {
  const [search,    setSearch]    = useState('');
  const [open,      setOpen]      = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const listRef = useRef(null);

  useEffect(() => {
    if (!value) { setSelected(null); setSearch(''); }
  }, [value]);

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
    onChange(m.id, m.nom);
  }

  function clear() {
    setSelected(null);
    setSearch('');
    setOpen(false);
    setActiveIdx(-1);
    onChange('', '');
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
    <div style={{ position:'relative', minWidth:180 }}>
      {/* Loupe explicite (le CSS .cgf input écrase le background-image de .team-search) */}
      <svg
        width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{
          position:'absolute', left:8, top:'50%', transform:'translateY(-50%)',
          color:'var(--text3)', pointerEvents:'none', flexShrink:0,
        }}
      >
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="text"
        className="team-search"
        placeholder={placeholder}
        value={search}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setActiveIdx(-1); }, 150)}
        onKeyDown={handleKeyDown}
        onChange={e => {
          setSearch(e.target.value);
          setSelected(null);
          setActiveIdx(-1);
          onChange('', '');
          setOpen(true);
        }}
        style={{
          width:'100%',
          padding:'0 24px 0 28px', height:30, boxSizing:'border-box',
          border:'1px solid var(--border2)',
          borderRadius:'var(--r)',
          fontSize:12, textAlign:'left',
          background: selected ? 'var(--accent-light)' : 'var(--surface)',
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

      {/* Dropdown */}
      {open && filtered.length > 0 && !selected && (
        <div ref={listRef} style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:300,
          background:'var(--surface)', border:'1px solid var(--border2)',
          borderRadius:'var(--r)', boxShadow:'0 4px 16px rgba(0,0,0,.12)',
          maxHeight:200, overflowY:'auto',
        }}>
          {filtered.map((m, idx) => (
            <div
              key={m.id}
              onMouseDown={() => pick(m)}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(-1)}
              style={{
                padding:'7px 12px', cursor:'pointer',
                fontSize:12, fontFamily:'sans-serif',
                borderBottom:'1px solid var(--border)',
                display:'flex', alignItems:'center', gap:8,
                background: idx === activeIdx ? 'var(--accent-light)' : '',
              }}
            >
              <span style={{
                width:8, height:8, borderRadius:'50%',
                background: medColor(m.id), flexShrink:0,
              }} />
              <span style={{ fontWeight:600 }}>{m.nom}</span>
            </div>
          ))}
        </div>
      )}

      {/* Aucun résultat */}
      {open && q && filtered.length === 0 && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:300,
          background:'var(--surface)', border:'1px solid var(--border2)',
          borderRadius:'var(--r)', padding:'8px 12px',
          fontSize:11, fontFamily:'sans-serif', color:'var(--text3)',
        }}>
          Aucun résultat
        </div>
      )}
    </div>
  );
}

// ── Légende types de congé ──────────────────────────────────
function TypeLegend() {
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'var(--r)', padding:'8px 12px', marginBottom:14,
    }}>
      <div style={{
        fontSize:9, fontFamily:'Trebuchet MS,sans-serif', fontWeight:700,
        letterSpacing:'.07em', textTransform:'uppercase', color:'var(--text2)',
        marginBottom:7,
      }}>
        Types de congé
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 14px' }}>
        {TYPES_ABS.map(t => (
          <div key={t} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{
              display:'inline-block', width:10, height:10, borderRadius:3,
              background: typeColor(t) + '33', border:`1.5px solid ${typeColor(t)}99`,
              flexShrink:0,
            }} />
            <span style={{ fontSize:10, fontFamily:'sans-serif', color:'var(--text2)' }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Vue liste groupée par mois ──────────────────────────────
function AbsenceList({ absences, isSecretary, onDelete }) {
  const grouped = useMemo(() => {
    const map = {};
    absences.forEach(a => {
      const [y, m] = a.date_debut.split('-');
      const key = `${y}-${m}`;
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [absences]);

  if (absences.length === 0) return <p className="empty-msg">Aucune absence enregistrée.</p>;

  return (
    <div className="cg-list">
      {grouped.map(([key, items]) => {
        const [y, m] = key.split('-');
        return (
          <div key={key}>
            <div style={{
              fontSize:9, fontFamily:'Trebuchet MS,sans-serif', fontWeight:700,
              textTransform:'uppercase', letterSpacing:'.07em', color:'var(--text2)',
              padding:'10px 0 4px', borderBottom:'1px solid var(--border)', marginBottom:5,
            }}>
              {MONTHS_FR[parseInt(m, 10) - 1]} {y}
            </div>
            {items.sort((a, b) => a.date_debut.localeCompare(b.date_debut)).map(a => {
              const col = typeColor(a.type_abs);
              return (
                <div key={a.id} className="cgi" style={{
                  marginBottom:4,
                  background: col + '12',
                  borderColor: col + '55',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{
                      display:'inline-block', width:9, height:9, borderRadius:2,
                      background: col + '33', border:`1.5px solid ${col}99`, flexShrink:0,
                    }} />
                    <span className="cg-nm" style={{ color: col }}>{a.med_nom}</span>
                    <span className="cg-dt">
                      — {a.type_abs} · {a.date_debut} → {a.date_fin}
                      {' '}
                      <span style={{ fontSize:9, color:'var(--text3)' }}>
                        ({countWorkingDays(a.date_debut, a.date_fin)} j. ouvrés)
                      </span>
                    </span>
                  </div>
                  {isSecretary && <button className="cg-rm" onClick={() => onDelete(a.id)}>×</button>}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Popover barre calendrier ────────────────────────────────
function BarPopover({ abs, x, y, isSecretary, onClose, onDelete }) {
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const left  = x + 168 > window.innerWidth  ? x - 176 : x + 8;
  const top   = y + 140 > window.innerHeight ? y - 148 : y + 8;
  const color = typeColor(abs.type_abs);
  const days  = countWorkingDays(abs.date_debut, abs.date_fin);

  return (
    <div ref={ref} style={{
      position:'fixed', left, top, zIndex:800,
      background:'var(--surface)', border:'1px solid var(--border2)',
      borderRadius:'var(--rl)', boxShadow:'0 8px 24px rgba(0,0,0,.18)',
      padding:'12px 14px', minWidth:170, maxWidth:230,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:7 }}>
        <span style={{ width:10, height:10, borderRadius:3, background: color + '33', border:`1.5px solid ${color}99`, flexShrink:0 }} />
        <span style={{ fontSize:12, fontWeight:'bold', color:'var(--text)' }}>{abs.med_nom}</span>
      </div>
      <div style={{ fontSize:10, fontFamily:'sans-serif', color:'var(--text2)', lineHeight:1.7 }}>
        <div style={{ color, fontWeight:600 }}>{abs.type_abs}</div>
        <div>{abs.date_debut} → {abs.date_fin}</div>
        <div style={{ color:'var(--text3)' }}>{days} jour{days > 1 ? 's' : ''} ouvré{days > 1 ? 's' : ''}</div>
      </div>
      {isSecretary && (
        <button
          onClick={() => { onDelete(abs.id); onClose(); }}
          style={{
            marginTop:10, width:'100%', padding:'4px 0',
            fontSize:10, fontFamily:'sans-serif',
            background:'var(--danger-bg)', color:'var(--danger)',
            border:'1px solid var(--danger-bd,#fda4af)', borderRadius:'var(--r)', cursor:'pointer',
          }}
        >
          Supprimer cette absence
        </button>
      )}
    </div>
  );
}

// ── Popover sélection rapide de mois ────────────────────────
function MonthPickerPopover({ calMonth, onSelect, onClose }) {
  const [year, setYear] = useState(calMonth.getFullYear());
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

  const curM = calMonth.getMonth();
  const curY = calMonth.getFullYear();

  return (
    <div ref={ref} style={{
      position:'absolute', top:'calc(100% + 6px)', left:'50%', transform:'translateX(-50%)',
      zIndex:600, background:'var(--surface)', border:'1px solid var(--border2)',
      borderRadius:'var(--rl)', boxShadow:'0 8px 28px rgba(0,0,0,.18)',
      padding:'12px', width:220,
    }}>
      {/* Navigation année */}
      <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:10 }}>
        <button className="wn-btn" onClick={() => setYear(y => y - 1)}>‹</button>
        <span style={{ flex:1, textAlign:'center', fontSize:13, fontFamily:'system-ui,sans-serif', fontWeight:700 }}>
          {year}
        </span>
        <button className="wn-btn" onClick={() => setYear(y => y + 1)}>›</button>
      </div>
      {/* Grille 3×4 mois */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4 }}>
        {MONTHS_FR.map((m, i) => {
          const isSel = i === curM && year === curY;
          return (
            <button
              key={i}
              onClick={() => { onSelect(new Date(year, i, 1)); onClose(); }}
              style={{
                padding:'5px 2px', fontSize:11, fontFamily:'system-ui,sans-serif',
                fontWeight: isSel ? 700 : 400, borderRadius:'var(--r)',
                border: isSel ? '1.5px solid var(--accent)' : '1px solid transparent',
                background: isSel ? 'var(--accent-light)' : 'transparent',
                color: isSel ? 'var(--accent)' : 'var(--text)',
                cursor:'pointer', textAlign:'center',
                transition:'background .08s',
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

// ── Calendrier mensuel ──────────────────────────────────────
function AbsenceCalendar({ absences, isSecretary, onDelete, initialMonth }) {
  const [calMonth,  setCalMonth]  = useState(() => {
    if (initialMonth) return new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1);
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [filterMed,   setFilterMed]   = useState('');
  const [popover,     setPopover]     = useState(null);
  const [pickerOpen,  setPickerOpen]  = useState(false);

  const todayStr = todayIso();
  const curMonth = calMonth.getMonth();
  const curYear  = calMonth.getFullYear();
  const weeks    = getMonthWeeks(calMonth);

  const monthAbsences = useMemo(() => {
    const mStart = `${curYear}-${String(curMonth + 1).padStart(2,'0')}-01`;
    const mEnd   = toIso(new Date(curYear, curMonth + 1, 0));
    return absences.filter(a => a.date_debut <= mEnd && a.date_fin >= mStart);
  }, [absences, curMonth, curYear]);

  const monthMeds = useMemo(() => {
    const seen = new Map();
    monthAbsences.forEach(a => { if (!seen.has(a.med_id)) seen.set(a.med_id, a.med_nom); });
    return [...seen.entries()].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom));
  }, [monthAbsences]);

  const filtered = filterMed ? absences.filter(a => a.med_id === filterMed) : absences;

  function handleBarClick(e, abs) {
    e.stopPropagation();
    setPopover(prev => prev?.abs.id === abs.id ? null : { abs, x: e.clientX, y: e.clientY });
  }

  return (
    <div onClick={() => setPopover(null)}>
      {/* ── Navigation + filtre ── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        <button className="wn-btn" title="Reculer de 6 mois"
          onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 6, 1))}>«</button>
        <button className="wn-btn" title="Mois précédent"
          onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</button>

        {/* Label cliquable → MonthPicker */}
        <div style={{ position:'relative' }}>
          <span
            className="wn-lbl"
            onClick={() => setPickerOpen(v => !v)}
            title="Cliquer pour choisir un mois"
            style={{ cursor:'pointer', userSelect:'none', display:'inline-flex', alignItems:'center', gap:5 }}
          >
            {MONTHS_FR[curMonth]} {curYear}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ opacity:.45, flexShrink:0 }}>
              <path d="M2 3.5 5 6.5 8 3.5"/>
            </svg>
          </span>
          {pickerOpen && (
            <MonthPickerPopover
              calMonth={calMonth}
              onSelect={m => { setCalMonth(m); setPickerOpen(false); }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>

        <button className="wn-btn" title="Mois suivant"
          onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</button>
        <button className="wn-btn" title="Avancer de 6 mois"
          onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 6, 1))}>»</button>

        <button className="wn-chip" onClick={() => { const n = new Date(); setCalMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}>
          Mois actuel
        </button>
        <AbsenceFilterBadge monthMeds={monthMeds} filterMed={filterMed} onFilter={setFilterMed} />
      </div>

      {/* ── En-têtes colonnes ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:2, marginBottom:4 }}>
        {DAYS_HDR.map(d => (
          <div key={d} style={{
            textAlign:'center', fontSize:9, fontFamily:'Trebuchet MS,sans-serif',
            fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'var(--text2)',
          }}>{d}</div>
        ))}
      </div>

      {/* ── Semaines ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
        {weeks.map((weekDays, wi) => {
          const bars    = computeBars(filtered, weekDays);
          const nTracks = bars.reduce((m, b) => Math.max(m, b.track + 1), 0);
          const barsH   = nTracks * TRACK_H + (nTracks > 0 ? 4 : 0);
          return (
            <div key={wi} style={{
              background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:'var(--r)', overflow:'visible',
            }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)' }}>
                {weekDays.map((d, di) => {
                  const iso         = toIso(d);
                  const isToday     = iso === todayStr;
                  const inMonth     = d.getMonth() === curMonth;
                  const holidayName = getFrenchHolidays(d.getFullYear()).get(iso);
                  return (
                    <div key={di} title={holidayName || undefined} style={{
                      height: DAY_H + (holidayName ? 14 : 0),
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      borderRight: di < 4 ? '1px solid var(--border)' : 'none',
                      background: holidayName && !isToday ? 'var(--holiday-stripe)' : 'transparent',
                    }}>
                      <span style={{
                        display:'inline-flex', alignItems:'center', justifyContent:'center',
                        width:22, height:22, borderRadius:'50%', fontSize:11, fontFamily:'sans-serif',
                        fontWeight: isToday ? 700 : 400,
                        background: isToday ? 'var(--accent)' : 'transparent',
                        color: isToday ? '#fff' : holidayName ? '#d97706' : inMonth ? 'var(--text)' : 'var(--text3)',
                      }}>
                        {d.getDate()}
                      </span>
                      {holidayName && (
                        <span style={{ fontSize:7, fontStyle:'italic', color:'#d97706', lineHeight:1.2, textAlign:'center', maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', padding:'0 2px' }}>
                          {holidayName}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {barsH > 0 && (
                <div style={{ position:'relative', height:barsH, borderTop:'1px solid var(--border)' }}>
                  {bars.map((bar, bi) => {
                    const leftPct  = (bar.colStart / 5) * 100;
                    const widthPct = ((bar.colEnd - bar.colStart + 1) / 5) * 100;
                    const topPx    = bar.track * TRACK_H + 2;
                    const color    = typeColor(bar.abs.type_abs); // coloré par TYPE
                    const isActive = popover?.abs.id === bar.abs.id;
                    return (
                      <div
                        key={bi}
                        onClick={e => handleBarClick(e, bar.abs)}
                        title={`${bar.abs.med_nom} — ${bar.abs.type_abs}`}
                        style={{
                          position:'absolute',
                          left:   `calc(${leftPct}% + 3px)`,
                          width:  `calc(${widthPct}% - 6px)`,
                          top:    topPx,
                          height: TRACK_H - 4,
                          background: isActive ? color + '44' : color + '1e',
                          border: `1.5px solid ${color}${isActive ? 'cc' : '77'}`,
                          borderRadius:5, boxSizing:'border-box',
                          display:'flex', alignItems:'center',
                          paddingLeft:6, paddingRight:4, overflow:'hidden',
                          cursor:'pointer', transition:'background .1s, border-color .1s',
                        }}
                      >
                        <span style={{
                          fontSize:10, fontFamily:'sans-serif', fontWeight:600,
                          color, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                        }}>
                          {bar.abs.med_nom}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {monthAbsences.length === 0 && (
        <div style={{ textAlign:'center', padding:'2rem', fontFamily:'sans-serif', fontSize:12, color:'var(--text3)' }}>
          Aucune absence ce mois-ci.
        </div>
      )}

      {popover && (
        <BarPopover
          abs={popover.abs}
          x={popover.x}
          y={popover.y}
          isSecretary={isSecretary}
          onClose={() => setPopover(null)}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

// ── Filtre praticien (badge + dropdown) dans nav calendrier ─
function AbsenceFilterBadge({ monthMeds, filterMed, onFilter }) {
  const [open,      setOpen]      = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const ref     = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function h(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setActiveIdx(-1); } }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIdx];
    if (item) item.scrollIntoView({ block:'nearest' });
  }, [activeIdx]);

  const options = [{ id:'', nom:'Tous les praticiens' }, ...monthMeds];
  const selected = filterMed ? monthMeds.find(m => m.id === filterMed) : null;
  const isFiltered = !!filterMed;
  const n = monthMeds.length;

  function select(id) { onFilter(id); setOpen(false); setActiveIdx(-1); }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter')     { e.preventDefault(); if (activeIdx >= 0) select(options[activeIdx].id); }
    else if (e.key === 'Escape')    { setOpen(false); setActiveIdx(-1); }
  }

  if (n === 0) return null;

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button
        onClick={() => { setOpen(v => !v); setActiveIdx(-1); }}
        onKeyDown={handleKeyDown}
        style={{
          display:'inline-flex', alignItems:'center', gap:6,
          padding:'2px 10px 2px 9px',
          background: isFiltered || open ? 'var(--accent)' : 'var(--accent-light)',
          border:`1px solid ${isFiltered || open ? 'var(--accent)' : 'var(--accent-mid)'}`,
          borderRadius:20, fontSize:10, fontFamily:'system-ui,sans-serif',
          color: isFiltered || open ? '#fff' : 'var(--accent)',
          cursor:'pointer', fontWeight:700, transition:'all .12s',
        }}
      >
        <span style={{ fontSize:12 }}>👥</span>
        <span>{selected ? selected.nom : `${n} personne${n > 1 ? 's' : ''} absente${n > 1 ? 's' : ''}`}</span>
        {isFiltered
          ? <span onMouseDown={e => { e.stopPropagation(); select(''); }} style={{ opacity:.8, fontSize:14, lineHeight:1, marginLeft:1 }}>×</span>
          : <span style={{ fontSize:9, opacity:.7 }}>{open ? '▴' : '▾'}</span>
        }
      </button>

      {open && (
        <div ref={listRef} style={{
          position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:400,
          background:'var(--surface)', border:'1px solid var(--border2)',
          borderRadius:'var(--rl)', boxShadow:'0 8px 24px rgba(0,0,0,.15)',
          padding:'4px 0', minWidth:220, maxHeight:260, overflowY:'auto',
        }}>
          {options.map((m, idx) => (
            <div
              key={m.id || 'all'}
              onMouseDown={() => select(m.id)}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(-1)}
              style={{
                padding:'7px 14px', fontSize:11, fontFamily:'system-ui,sans-serif',
                borderBottom: idx < options.length - 1 ? '1px solid var(--border)' : 'none',
                display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                background: idx === activeIdx ? 'var(--accent-light)' : filterMed === m.id ? 'var(--surface2)' : 'transparent',
              }}
            >
              {m.id
                ? <span style={{ width:7, height:7, borderRadius:'50%', background:medColor(m.id), flexShrink:0 }} />
                : <span style={{ width:7, flexShrink:0 }} />
              }
              <span style={{ fontWeight: m.id ? 600 : 400, color: m.id ? 'var(--text)' : 'var(--text2)' }}>{m.nom}</span>
              {filterMed === m.id && <span style={{ marginLeft:'auto', color:'var(--accent)', fontSize:11 }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Vue semestre par praticien ──────────────────────────────
function SemesterView({ absences, medecins, isSecretary, onDelete }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [sem,  setSem]  = useState(now.getMonth() < 6 ? 1 : 2);
  const [popover, setPopover] = useState(null);

  const semMonths  = sem === 1 ? [0,1,2,3,4,5] : [6,7,8,9,10,11];
  const semStartIso = `${year}-${sem === 1 ? '01' : '07'}-01`;
  const semEndIso   = sem === 1 ? `${year}-06-30` : `${year}-12-31`;

  const semAbsences = useMemo(() =>
    absences.filter(a => a.date_debut <= semEndIso && a.date_fin >= semStartIso),
    [absences, semStartIso, semEndIso]
  );

  // Rows enrichis avec le type (catégorie) du praticien, triés par catégorie puis nom
  const rows = useMemo(() => {
    const seen = new Map();
    semAbsences.forEach(a => {
      if (!seen.has(a.med_id)) {
        const med = medecins.find(m => m.id === a.med_id);
        seen.set(a.med_id, { id: a.med_id, nom: a.med_nom, type: med?.type || 'ph' });
      }
    });
    return [...seen.values()].sort((a, b) => {
      const ta = TYPE_ORDER[a.type] ?? 99;
      const tb = TYPE_ORDER[b.type] ?? 99;
      return ta !== tb ? ta - tb : a.nom.localeCompare(b.nom, 'fr');
    });
  }, [semAbsences, medecins]);

  function getMedMonthAbs(medId, mIdx) {
    const mStart = `${year}-${String(mIdx + 1).padStart(2,'0')}-01`;
    const mEnd   = toIso(new Date(year, mIdx + 1, 0));
    return semAbsences.filter(a => a.med_id === medId && a.date_debut <= mEnd && a.date_fin >= mStart);
  }

  function prevSem() { if (sem === 1) { setSem(2); setYear(y => y - 1); } else setSem(1); }
  function nextSem() { if (sem === 2) { setSem(1); setYear(y => y + 1); } else setSem(2); }

  const thStyle = {
    padding:'6px 6px', fontFamily:'Trebuchet MS,sans-serif', fontSize:9,
    fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase',
    color:'var(--text2)', borderBottom:'2px solid var(--border2)', textAlign:'center',
  };

  return (
    <div onClick={() => setPopover(null)}>
      {/* Navigation semestre */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap' }}>
        <button className="wn-btn" onClick={prevSem}>‹</button>
        <button className="wn-btn" onClick={nextSem}>›</button>
        <span className="wn-lbl">S{sem} {year}</span>
        <button className="wn-chip" onClick={() => {
          const n = new Date();
          setYear(n.getFullYear());
          setSem(n.getMonth() < 6 ? 1 : 2);
        }}>Semestre actuel</button>
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'2rem', fontFamily:'sans-serif', fontSize:12, color:'var(--text3)' }}>
          Aucune absence ce semestre.
        </div>
      ) : (
        <div style={{ overflowX:'auto', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--rl)', boxShadow:'var(--sh)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:'sans-serif' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign:'left', padding:'6px 12px', minWidth:140 }}>Praticien</th>
                {semMonths.map(mIdx => (
                  <th key={mIdx} style={{ ...thStyle, minWidth:70 }}>{MONTHS_FR[mIdx].slice(0,3)}</th>
                ))}
                <th style={{ ...thStyle, minWidth:55 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Insérer des lignes d'en-tête de catégorie entre les groupes
                const items = [];
                let lastType = null;
                rows.forEach(med => {
                  if (med.type !== lastType) {
                    items.push({ _header: true, type: med.type });
                    lastType = med.type;
                  }
                  items.push(med);
                });
                return items.map(item => {
                  if (item._header) {
                    return (
                      <tr key={`hdr-${item.type}`}>
                        <td colSpan={semMonths.length + 2} style={{
                          padding:'6px 12px 4px',
                          fontSize:9, fontFamily:'Trebuchet MS,sans-serif',
                          fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase',
                          color:'var(--text2)',
                          background:'var(--surface2,#f3f3f1)',
                          borderTop:'1px solid var(--border2)',
                          borderBottom:'1px solid var(--border)',
                        }}>
                          {TYPE_LABELS[item.type] || item.type.toUpperCase()}
                        </td>
                      </tr>
                    );
                  }
                  const med = item;
                  const medSemAbs = semAbsences.filter(a => a.med_id === med.id);
                  const totalDays = medSemAbs.reduce((sum, a) => {
                    const eff0 = a.date_debut > semStartIso ? a.date_debut : semStartIso;
                    const eff1 = a.date_fin   < semEndIso   ? a.date_fin   : semEndIso;
                    return sum + countWorkingDays(eff0, eff1);
                  }, 0);
                  return (
                  <tr key={med.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'6px 12px', fontWeight:500, color:'var(--text)', fontSize:11 }}>
                      {med.nom}
                    </td>
                    {semMonths.map(mIdx => {
                      const abs = getMedMonthAbs(med.id, mIdx);
                      return (
                        <td key={mIdx} style={{ padding:'4px 3px', textAlign:'center', verticalAlign:'middle' }}>
                          {abs.length > 0 && (
                            <div style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'center' }}>
                              {(() => {
                                const mStart = `${year}-${String(mIdx+1).padStart(2,'0')}-01`;
                                const mEnd   = toIso(new Date(year, mIdx+1, 0));
                                const byType = {};
                                abs.forEach(a => {
                                  const eff0 = a.date_debut > mStart ? a.date_debut : mStart;
                                  const eff1 = a.date_fin   < mEnd   ? a.date_fin   : mEnd;
                                  byType[a.type_abs] = (byType[a.type_abs] || 0) + countWorkingDays(eff0, eff1);
                                });
                                return Object.entries(byType).map(([type, days]) => {
                                  const col = typeColor(type);
                                  return (
                                    <div
                                      key={type}
                                      title={type}
                                      style={{
                                        background:col+'22', border:`1.5px solid ${col}77`,
                                        borderRadius:4, padding:'2px 6px',
                                        fontSize:10, color:col, fontWeight:600,
                                        whiteSpace:'nowrap',
                                      }}
                                    >
                                      {days}j
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding:'4px 8px', textAlign:'center', fontWeight:700, color:'var(--accent)', fontSize:12 }}>
                      {totalDays}j
                    </td>
                  </tr>
                );
              });
            })()}
            </tbody>
          </table>
        </div>
      )}

      {popover && (
        <BarPopover
          abs={popover.abs}
          x={popover.x}
          y={popover.y}
          isSecretary={isSecretary}
          onClose={() => setPopover(null)}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

// ── Composant principal ─────────────────────────────────────
export default function AbsencesTab({ medecins, absences, isSecretary, onReload, onToast, onPushUndo = () => {}, initNav }) {
  const [medId,       setMedId]       = useState('');
  const [dateD,       setDateD]       = useState(() => todayIso());
  const [dateF,       setDateF]       = useState(() => todayIso());
  const [typeAbs,     setTypeAbs]     = useState(TYPES_ABS[0]);
  const [saving,      setSaving]      = useState(false);
  const [searchMedId, setSearchMedId] = useState('');
  const [viewMode,    setViewMode]    = useState('calendrier'); // 'calendrier' | 'semestre'

  // Navigation depuis l'onglet Synthèse → pré-sélectionne le médecin + mois
  useEffect(() => {
    if (!initNav) return;
    setSearchMedId(initNav.medId);
    setViewMode('calendrier');
  }, [initNav?.nonce]);

  const workDays = useMemo(() => {
    if (!dateD || !dateF || dateF < dateD) return null;
    return countWorkingDays(dateD, dateF);
  }, [dateD, dateF]);

  const overlap = useMemo(() => {
    if (!medId || !dateD || !dateF || dateF < dateD) return null;
    return absences.find(a =>
      a.med_id === medId && a.date_debut <= dateF && a.date_fin >= dateD
    ) || null;
  }, [medId, dateD, dateF, absences]);

  const displayedAbsences = useMemo(() => {
    if (!searchMedId) return absences;
    return absences.filter(a => a.med_id === searchMedId);
  }, [absences, searchMedId]);

  async function handleAdd() {
    if (!medId || !dateD || !dateF) { onToast('Renseignez tous les champs', 'err'); return; }
    if (dateF < dateD) { onToast('La date de fin doit être après le début', 'err'); return; }
    setSaving(true);
    try {
      const result = await api.addAbsence({ med_id:medId, date_debut:dateD, date_fin:dateF, type_abs:typeAbs });
      const absId = result.id;
      onPushUndo('Ajout congé', async () => { await api.deleteAbsence(absId); onReload(); });
      setMedId('');
      setDateD(todayIso()); setDateF(todayIso());
      onReload();
      onToast('Absence enregistrée');
    } catch(e) {
      onToast(e.message || 'Erreur lors de l\'enregistrement', 'err');
    } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    const absToDelete = absences.find(a => a.id === id);
    try {
      await api.deleteAbsence(id);
      if (absToDelete) {
        onPushUndo('Suppression congé', async () => {
          await api.addAbsence({ med_id: absToDelete.med_id, date_debut: absToDelete.date_debut, date_fin: absToDelete.date_fin, type_abs: absToDelete.type_abs });
          onReload();
        });
      }
      onReload();
      onToast('Absence supprimée');
    } catch(e) {
      onToast(e.message || 'Erreur lors de la suppression', 'err');
    }
  }

  return (
    <div>
      <div className="sec-t" style={{ marginBottom:12 }}>Absences &amp; congés</div>

      {/* ── Formulaire ajout + alerte (secrétaires seulement) ── */}
      {isSecretary && (
        <>
          <form className="cgform" onSubmit={e => { e.preventDefault(); handleAdd(); }}>
            {/* Titre encadré */}
            <div style={{
              width:'100%', fontSize:10, fontFamily:'Trebuchet MS,sans-serif',
              fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase',
              color:'var(--text2)', borderBottom:'1px solid var(--border)',
              paddingBottom:8, marginBottom:6,
            }}>
              Ajouter un congé
            </div>

            {/* Praticien — champ cherchable */}
            <div className="cgf" style={{ position:'relative' }}>
              <MedSearchInput
                medecins={medecins}
                value={medId}
                onChange={(id) => setMedId(id)}
              />
            </div>

            {/* Période — sélecteur calendrier */}
            <div className="cgf">
              <DateRangePicker
                start={dateD}
                end={dateF}
                onChange={({ start, end }) => { setDateD(start); setDateF(end); }}
              />
            </div>

            <div className="cgf">
              <select value={typeAbs} onChange={e => setTypeAbs(e.target.value)}
                style={{ height:30, boxSizing:'border-box' }}>
                {TYPES_ABS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="cgf" style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button type="submit" className="btn-primary" disabled={saving}
                style={{ height:30, boxSizing:'border-box' }}>
                {saving ? '…' : '+ Ajouter'}
              </button>
              {workDays !== null && (
                <span style={{ fontSize:10, fontFamily:'sans-serif', color:'var(--text2)', whiteSpace:'nowrap' }}>
                  = {workDays} j. ouvré{workDays > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </form>

          {/* ── Avertissement chevauchement ── */}
          {overlap && (
            <div style={{
              background:'var(--warn-bg)', border:'1px solid var(--warn-bd)',
              borderRadius:'var(--r)', padding:'7px 12px', marginTop:-6, marginBottom:10,
              fontSize:11, fontFamily:'sans-serif', color:'var(--warn)',
            }}>
              ⚠ Ce praticien a déjà une absence qui chevauche cette période ({overlap.date_debut} → {overlap.date_fin}).
            </div>
          )}
        </>
      )}

      {/* ── Recherche congé ── */}
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:'var(--rl)', padding:'10px 14px', marginBottom:14, boxShadow:'var(--sh)',
      }}>
        <div style={{
          fontSize:10, fontFamily:'Trebuchet MS,sans-serif', fontWeight:700,
          letterSpacing:'.07em', textTransform:'uppercase', color:'var(--text2)',
          borderBottom:'1px solid var(--border)', paddingBottom:8, marginBottom:10,
        }}>
          Recherche congé
        </div>
        <MedSearchInput
          medecins={medecins}
          value={searchMedId}
          onChange={(id) => setSearchMedId(id)}
          placeholder="Recherche un congé pour…"
        />
      </div>

      {/* ── Légende types de congé ── */}
      <TypeLegend />

      {/* ── Bascule vue Calendrier / Semestre ── */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        {[
          { key:'calendrier', label:'Par mois' },
          { key:'semestre',   label:'Par semestre' },
        ].map(v => (
          <button
            key={v.key}
            onClick={() => setViewMode(v.key)}
            style={{
              padding:'6px 20px', fontSize:12, borderRadius:20, cursor:'pointer',
              fontFamily:'system-ui,sans-serif', fontWeight:700,
              background: viewMode === v.key ? 'var(--accent)' : 'var(--accent-light)',
              color:      viewMode === v.key ? '#fff'          : 'var(--accent)',
              border:`1.5px solid ${viewMode === v.key ? 'var(--accent)' : 'var(--accent-mid)'}`,
              transition:'all .12s',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {viewMode === 'calendrier'
        ? <AbsenceCalendar key={initNav?.nonce ?? 'default'} absences={displayedAbsences} isSecretary={isSecretary} onDelete={handleDelete} initialMonth={initNav?.monthDate} />
        : <SemesterView   absences={displayedAbsences} medecins={medecins} isSecretary={isSecretary} onDelete={handleDelete} />
      }
    </div>
  );
}
