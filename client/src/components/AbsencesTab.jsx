// components/AbsencesTab.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import * as api from '../api';

// ── Constantes ──────────────────────────────────────────────
const TYPES_ABS = [
  'Congé annuel (CA)', 'Formation / DPC', 'Congé maladie',
  'Temps non clinique', 'RTT', 'Récupération de garde',
  'Congé formation (CF)', 'Activité externe (CM2R / MTG…)',
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
  'Congé annuel (CA)':              '#185FA5', // bleu
  'Formation / DPC':                '#0F6E56', // vert
  'Congé maladie':                  '#C94A20', // rouge-orangé
  'Temps non clinique':             '#7B3FA0', // violet
  'RTT':                            '#2D6EA0', // bleu acier
  'Récupération de garde':          '#B54D00', // orange brun
  'Congé formation (CF)':           '#1A7E74', // teal
  'Activité externe (CM2R / MTG…)': '#8A5C0A', // brun doré
};
function typeColor(typeAbs) { return TYPE_COLORS[typeAbs] ?? '#6A6A66'; }

// ── Palette couleurs par praticien (légende filtre calendrier) ─
const PALETTE = [
  '#185FA5','#0F6E56','#C94A20','#C44070','#4A4A47',
  '#7B3FA0','#1A7E74','#B54D00','#2D6EA0','#5E8C00',
  '#A0362D','#006D7A','#7A5200','#8A5C0A','#6A6A66',
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
          padding:'5px 10px',
          border:`1px solid ${open ? 'var(--accent-mid)' : 'var(--border2)'}`,
          borderRadius:'var(--r)',
          background: open ? 'var(--accent-light)' : 'var(--surface)',
          cursor:'pointer', fontSize:12, fontFamily:'sans-serif',
          color: start ? 'var(--text)' : 'var(--text3)',
          textAlign:'left', transition:'border-color .1s, background .1s',
        }}
      >
        <span style={{ fontSize:14 }}>📅</span>
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
              const iso        = toIso(d);
              const inCurMonth = d.getMonth() === month.getMonth();
              const isWeekend  = d.getDay() === 0 || d.getDay() === 6;
              const isToday    = iso === todayStr;
              const isStart    = iso === start;
              const isEnd      = !!effEnd && iso === effEnd;
              const isInRange  = !!(start && effEnd && iso > start && iso < effEnd);
              const isSelected = isStart || isEnd;

              let bg     = 'transparent';
              let color  = !inCurMonth ? 'var(--text3)' : isWeekend ? 'var(--text3)' : 'var(--text)';
              let radius = 4;
              if (isSelected) { bg = 'var(--accent)'; color = '#fff'; radius = '50%'; }
              else if (isInRange) { bg = 'var(--accent-light)'; radius = 0; }

              return (
                <div key={i}
                  onClick={() => inCurMonth && handleDayClick(iso)}
                  onMouseEnter={() => phase === 'end' && inCurMonth && setHover(iso)}
                  onMouseLeave={() => phase === 'end' && setHover(null)}
                  style={{
                    height:30, display:'flex', alignItems:'center', justifyContent:'center',
                    borderRadius: radius, background: bg, color,
                    fontWeight: isToday ? 700 : 400,
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
function MedSearchInput({ medecins, value, onChange }) {
  // value = medId sélectionné, onChange(id, nom) ou onChange('', '') pour effacer
  const [search,   setSearch]   = useState('');
  const [open,     setOpen]     = useState(false);
  const [selected, setSelected] = useState(null); // { id, nom }

  // Synchroniser le display si value est réinitialisé de l'extérieur
  useEffect(() => {
    if (!value) { setSelected(null); setSearch(''); }
  }, [value]);

  const q        = search.trim().toLowerCase();
  const filtered = q
    ? medecins.filter(m => m.nom.toLowerCase().includes(q))
    : medecins;

  function pick(m) {
    setSelected(m);
    setSearch(m.nom);
    setOpen(false);
    onChange(m.id, m.nom);
  }

  function clear() {
    setSelected(null);
    setSearch('');
    setOpen(false);
    onChange('', '');
  }

  return (
    <div style={{ position:'relative', minWidth:180 }}>
      <input
        type="text"
        className="team-search"
        placeholder="Rechercher un praticien…"
        value={search}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault(); // ne pas soumettre le form depuis ce champ
            if (open && filtered.length > 0 && !selected) pick(filtered[0]);
          }
          if (e.key === 'Escape') { setOpen(false); }
        }}
        onChange={e => {
          setSearch(e.target.value);
          setSelected(null);
          onChange('', '');
          setOpen(true);
        }}
        style={{
          width:'100%',
          paddingRight: search ? 24 : 10,
          border:'1px solid var(--border2)',
          borderRadius:'var(--r)',
          fontSize:12,
          padding:'5px 24px 5px 28px',
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

      {/* Dropdown */}
      {open && filtered.length > 0 && !selected && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:300,
          background:'var(--surface)', border:'1px solid var(--border2)',
          borderRadius:'var(--r)', boxShadow:'0 4px 16px rgba(0,0,0,.12)',
          maxHeight:200, overflowY:'auto',
        }}>
          {filtered.map(m => (
            <div
              key={m.id}
              onMouseDown={() => pick(m)}
              style={{
                padding:'7px 12px', cursor:'pointer',
                fontSize:12, fontFamily:'sans-serif',
                borderBottom:'1px solid var(--border)',
                display:'flex', alignItems:'center', gap:8,
                transition:'background .08s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
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
            border:'1px solid #f0a0a0', borderRadius:'var(--r)', cursor:'pointer',
          }}
        >
          Supprimer cette absence
        </button>
      )}
    </div>
  );
}

// ── Calendrier mensuel ──────────────────────────────────────
function AbsenceCalendar({ absences, isSecretary, onDelete }) {
  const [calMonth,  setCalMonth]  = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [filterMed, setFilterMed] = useState('');
  const [popover,   setPopover]   = useState(null);

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
        <button className="wn-btn" onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</button>
        <button className="wn-btn" onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</button>
        <span className="wn-lbl">{MONTHS_FR[curMonth]} {curYear}</span>
        <button className="wn-chip" onClick={() => { const n = new Date(); setCalMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}>
          Mois actuel
        </button>
        {monthMeds.length > 1 && (
          <select
            value={filterMed}
            onChange={e => setFilterMed(e.target.value)}
            style={{
              marginLeft:'auto', border:'1px solid var(--border2)', borderRadius:'var(--r)',
              padding:'3px 8px', fontSize:11, fontFamily:'sans-serif',
              background:'var(--surface)', color:'var(--text)', cursor:'pointer',
            }}
          >
            <option value="">Tous les praticiens</option>
            {monthMeds.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        )}
      </div>

      {/* ── Légende praticiens (filtre cliquable) ── */}
      {monthMeds.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:12 }}>
          {monthMeds.map(m => (
            <div
              key={m.id}
              onClick={e => { e.stopPropagation(); setFilterMed(prev => prev === m.id ? '' : m.id); }}
              style={{
                display:'inline-flex', alignItems:'center', gap:5,
                padding:'3px 10px', borderRadius:20, cursor:'pointer',
                border:`1.5px solid ${medColor(m.id)}${filterMed === m.id ? 'ff' : '55'}`,
                background: filterMed === m.id ? medColor(m.id) + '22' : 'transparent',
                transition:'all .12s',
              }}
            >
              <span style={{ width:7, height:7, borderRadius:'50%', background:medColor(m.id) }} />
              <span style={{ fontSize:10, fontFamily:'sans-serif', fontWeight:600, color:medColor(m.id) }}>
                {m.nom}
              </span>
            </div>
          ))}
        </div>
      )}

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
                  const iso     = toIso(d);
                  const isToday = iso === todayStr;
                  const inMonth = d.getMonth() === curMonth;
                  return (
                    <div key={di} style={{
                      height:DAY_H, display:'flex', alignItems:'center', justifyContent:'center',
                      borderRight: di < 4 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span style={{
                        display:'inline-flex', alignItems:'center', justifyContent:'center',
                        width:22, height:22, borderRadius:'50%', fontSize:11, fontFamily:'sans-serif',
                        fontWeight: isToday ? 700 : 400,
                        background: isToday ? 'var(--accent)' : 'transparent',
                        color: isToday ? '#fff' : inMonth ? 'var(--text)' : 'var(--text3)',
                      }}>
                        {d.getDate()}
                      </span>
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

// ── Composant principal ─────────────────────────────────────
export default function AbsencesTab({ medecins, absences, isSecretary, onReload, onToast }) {
  const [medId,   setMedId]   = useState('');
  const [dateD,   setDateD]   = useState(() => todayIso());
  const [dateF,   setDateF]   = useState(() => todayIso());
  const [typeAbs, setTypeAbs] = useState(TYPES_ABS[0]);
  const [saving,  setSaving]  = useState(false);
  const [view,    setView]    = useState('list');

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

  const thisWeekAbsent = useMemo(() => {
    const { mon, fri } = getCurrentWeekRange();
    return absences
      .filter(a => a.date_debut <= fri && a.date_fin >= mon)
      .map(a => a.med_nom)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort();
  }, [absences]);

  async function handleAdd() {
    if (!medId || !dateD || !dateF) { onToast('Renseignez tous les champs', 'err'); return; }
    if (dateF < dateD) { onToast('La date de fin doit être après le début', 'err'); return; }
    setSaving(true);
    try {
      await api.addAbsence({ med_id:medId, date_debut:dateD, date_fin:dateF, type_abs:typeAbs });
      setMedId('');
      setDateD(todayIso()); setDateF(todayIso());
      onReload();
      onToast('Absence enregistrée');
    } catch(e) {
      onToast(e.message || 'Erreur lors de l\'enregistrement', 'err');
    } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    try {
      await api.deleteAbsence(id);
      onReload();
      onToast('Absence supprimée');
    } catch(e) {
      onToast(e.message || 'Erreur lors de la suppression', 'err');
    }
  }

  return (
    <div>
      <div className="sec-t" style={{ marginBottom:12 }}>Absences &amp; congés</div>

      {/* ── Bannière absents cette semaine ── */}
      {thisWeekAbsent.length > 0 && (
        <div style={{
          background:'var(--accent-light)', border:'1px solid var(--accent-mid)',
          borderRadius:'var(--r)', padding:'7px 12px', marginBottom:12,
          fontSize:11, fontFamily:'sans-serif', color:'var(--accent)',
          display:'flex', alignItems:'center', gap:8,
        }}>
          <span style={{ fontWeight:700 }}>Cette semaine :</span>
          {thisWeekAbsent.join(', ')} absent{thisWeekAbsent.length > 1 ? 's' : ''}
        </div>
      )}

      {/* ── Formulaire ajout + alerte (secrétaires seulement) ── */}
      {isSecretary && (
        <>
          <form className="cgform" onSubmit={e => { e.preventDefault(); handleAdd(); }}>
            {/* Praticien — champ cherchable */}
            <div className="cgf" style={{ position:'relative' }}>
              <label>Praticien</label>
              <MedSearchInput
                medecins={medecins}
                value={medId}
                onChange={(id) => setMedId(id)}
              />
            </div>

            {/* Période — sélecteur calendrier */}
            <div className="cgf">
              <label>Période</label>
              <DateRangePicker
                start={dateD}
                end={dateF}
                onChange={({ start, end }) => { setDateD(start); setDateF(end); }}
              />
            </div>

            <div className="cgf">
              <label>Type</label>
              <select value={typeAbs} onChange={e => setTypeAbs(e.target.value)}>
                {TYPES_ABS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="cgf" style={{ display:'flex', alignItems:'flex-end', gap:8 }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? '…' : '+ Ajouter'}
              </button>
              {workDays !== null && (
                <span style={{ fontSize:10, fontFamily:'sans-serif', color:'var(--text2)', whiteSpace:'nowrap', paddingBottom:2 }}>
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

      {/* ── Légende types de congé ── */}
      <TypeLegend />

      {/* ── Toggle vue ── */}
      <div style={{ display:'flex', gap:6, marginBottom:14, alignItems:'center' }}>
        {[{ id:'list', label:'☰ Liste' }, { id:'cal', label:'📅 Calendrier' }].map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              padding:'4px 13px', borderRadius:20, fontSize:10,
              fontFamily:'Trebuchet MS,sans-serif', fontWeight:700, letterSpacing:'.04em',
              cursor:'pointer', transition:'background .12s, color .12s, border-color .12s',
              background:  view === v.id ? 'var(--accent)' : 'transparent',
              color:       view === v.id ? '#fff'          : 'var(--text2)',
              border:`1.5px solid ${view === v.id ? 'var(--accent)' : 'var(--border2)'}`,
              outline:'none',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'list' && <AbsenceList absences={absences} isSecretary={isSecretary} onDelete={handleDelete} />}
      {view === 'cal'  && <AbsenceCalendar absences={absences} isSecretary={isSecretary} onDelete={handleDelete} />}
    </div>
  );
}
