import { useState, useEffect, useRef } from 'react';

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

export default function MonthPickerPopover({ value, onChange, onClose }) {
  const [yr, setYr] = useState(value.getFullYear());
  const ref = useRef(null);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  useEffect(() => {
    function h(e) { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const curM = value.getMonth();
  const curY = value.getFullYear();

  return (
    <div ref={ref} style={{
      position:'absolute', top:'calc(100% + 6px)', left:'50%', transform:'translateX(-50%)',
      zIndex:700, background:'var(--surface)', border:'1px solid var(--border2)',
      borderRadius:'var(--rl)', boxShadow:'0 8px 28px rgba(0,0,0,.18)',
      padding:'12px', width:200,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:10 }}>
        <button className="wn-btn" onClick={() => setYr(y => y - 1)}>‹</button>
        <span style={{ flex:1, textAlign:'center', fontSize:13, fontFamily:'inherit', fontWeight:700 }}>{yr}</span>
        <button className="wn-btn" onClick={() => setYr(y => y + 1)}>›</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4 }}>
        {MONTHS_FR.map((m, i) => {
          const isSel = i === curM && yr === curY;
          return (
            <button key={i} onClick={() => { onChange(new Date(yr, i, 1)); onClose(); }} style={{
              padding:'5px 2px', fontSize:11, fontFamily:'inherit',
              fontWeight: isSel ? 700 : 400, borderRadius:'var(--r)',
              border: isSel ? '1.5px solid var(--accent)' : '1px solid transparent',
              background: isSel ? 'var(--accent-light)' : 'transparent',
              color: isSel ? 'var(--accent)' : 'var(--text)',
              cursor:'pointer', textAlign:'center', transition:'background .08s',
            }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
            >{m.slice(0,3)}</button>
          );
        })}
      </div>
    </div>
  );
}
