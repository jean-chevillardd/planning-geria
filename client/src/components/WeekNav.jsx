import { useState, useRef, useEffect, useMemo } from 'react';
import { fmtDay, addDays, getMonday, toIso } from '../utils';
import DoctorSearch from './DoctorSearch';

// ── Mini-calendrier de navigation semaine ──────────────────
function buildCalDays(monthDate) {
  const y = monthDate.getFullYear(), mo = monthDate.getMonth();
  const first = new Date(y, mo, 1);
  const last  = new Date(y, mo + 1, 0);
  const dow   = first.getDay();
  const cur   = new Date(first);
  cur.setDate(first.getDate() - (dow === 0 ? 6 : dow - 1));
  const days = [];
  while (true) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
    if (cur > last && cur.getDay() === 1) break;
  }
  return days;
}

const DAYS_HDR = ['L','M','M','J','V','S','D'];

function WeekPickerPopover({ monday, onChange, onClose }) {
  const [month,       setMonth]       = useState(() => new Date(monday.getFullYear(), monday.getMonth(), 1));
  const [hoveredWeek, setHoveredWeek] = useState(null);
  const ref            = useRef(null);
  const todayIso       = toIso(new Date());
  const selectedMon    = toIso(monday);

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

  const calDays  = useMemo(() => buildCalDays(month), [month]);
  const curMonth = month.getMonth();

  function handleDayClick(d) {
    onChange(getMonday(d));
    onClose();
  }

  return (
    <div ref={ref} style={{
      position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:600,
      background:'var(--surface)', border:'1px solid var(--border2)',
      borderRadius:'var(--rl)', boxShadow:'0 8px 28px rgba(0,0,0,.18)',
      padding:'12px', width:238,
    }}>
      {/* Navigation mois */}
      <div style={{ display:'flex', alignItems:'center', marginBottom:8, gap:4 }}>
        <button className="wn-btn"
          onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth()-1, 1))}>‹</button>
        <span style={{ flex:1, textAlign:'center', fontSize:12,
          fontFamily:'system-ui,-apple-system,sans-serif', fontWeight:700 }}>
          {month.toLocaleDateString('fr-FR', { month:'long', year:'numeric' })}
        </span>
        <button className="wn-btn"
          onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth()+1, 1))}>›</button>
      </div>

      {/* En-têtes jours */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1, marginBottom:3 }}>
        {DAYS_HDR.map((d, i) => (
          <div key={i} style={{
            textAlign:'center', fontSize:9,
            fontFamily:'Trebuchet MS,sans-serif', fontWeight:700,
            color: i >= 5 ? 'var(--text3)' : 'var(--text2)',
          }}>{d}</div>
        ))}
      </div>

      {/* Grille jours */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1 }}>
        {calDays.map((d, i) => {
          const iso       = toIso(d);
          const monIso    = toIso(getMonday(d));
          const inMonth   = d.getMonth() === curMonth;
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const isToday   = iso === todayIso;
          const isSelWeek = monIso === selectedMon;
          const isHovWeek = hoveredWeek && monIso === hoveredWeek;

          let bg    = isSelWeek ? 'var(--accent-light)' : isHovWeek ? 'var(--surface2)' : 'transparent';
          let color = !inMonth ? 'var(--text3)' : isWeekend ? 'var(--text3)' : 'var(--text)';
          if (isToday && !isSelWeek) color = 'var(--accent)';

          return (
            <div key={i}
              onClick={() => handleDayClick(d)}
              onMouseEnter={() => setHoveredWeek(monIso)}
              onMouseLeave={() => setHoveredWeek(null)}
              style={{
                height:28, display:'flex', alignItems:'center', justifyContent:'center',
                borderRadius:4, cursor:'pointer', background:bg, color,
                fontSize:11, fontFamily:'sans-serif',
                fontWeight: isToday ? 700 : isSelWeek ? 600 : 400,
                opacity: !inMonth ? .35 : 1,
                outline: isToday && !isSelWeek ? '1.5px solid var(--accent-mid)' : 'none',
                outlineOffset:-1, transition:'background .07s',
              }}
            >
              {d.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── WeekNav principal ──────────────────────────────────────
export default function WeekNav({ monday, onChange, onCopy, onGoToday, isSecretary, medecins = [], doctorFilter = '', onDoctorFilterChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const days = Array.from({ length: 5 }, (_, i) => addDays(monday, i));

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap' }}>
      {/* ── Navigation gauche ── */}
      <button className="wn-btn" title="Reculer d'un mois"
        onClick={() => onChange(addDays(monday, -28))}>«</button>
      <button className="wn-btn"
        onClick={() => onChange(addDays(monday, -7))}>‹</button>

      {/* ── Label cliquable → calendrier ── */}
      <div style={{ position:'relative' }}>
        <span
          className="wn-lbl"
          onClick={() => setPickerOpen(v => !v)}
          title="Cliquer pour accéder à une semaine précise"
          style={{ cursor:'pointer', userSelect:'none', display:'inline-flex', alignItems:'center', gap:5 }}
        >
          Semaine du {fmtDay(days[0])} au {fmtDay(days[4])}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ opacity:.45, flexShrink:0 }}>
            <path d="M2 3.5 5 6.5 8 3.5"/>
          </svg>
        </span>
        {pickerOpen && (
          <WeekPickerPopover
            monday={monday}
            onChange={w => { onChange(w); setPickerOpen(false); }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      {/* ── Navigation droite ── */}
      <button className="wn-btn"
        onClick={() => onChange(addDays(monday,  7))}>›</button>
      <button className="wn-btn" title="Avancer d'un mois"
        onClick={() => onChange(addDays(monday, 28))}>»</button>

      <button className="wn-chip" onClick={onGoToday}>Semaine actuelle</button>
      {isSecretary && (
        <button className="wn-copy" onClick={onCopy} title="Recopier les affectations de la semaine précédente">
          ⎘ Copier sem. précédente
        </button>
      )}

      {/* ── Vue médecin ── */}
      {medecins.length > 0 && onDoctorFilterChange && (
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <span style={{ fontSize:10, fontFamily:'Trebuchet MS,sans-serif', fontWeight:700,
            color:'var(--text2)', letterSpacing:'.04em', whiteSpace:'nowrap' }}>
            Vue médecin :
          </span>
          <DoctorSearch
            medecins={medecins}
            value={doctorFilter}
            onChange={onDoctorFilterChange}
          />
        </div>
      )}
    </div>
  );
}
