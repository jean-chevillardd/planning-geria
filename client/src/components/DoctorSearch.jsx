import { useState, useRef, useEffect } from 'react';

export default function DoctorSearch({ medecins, value, onChange }) {
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
