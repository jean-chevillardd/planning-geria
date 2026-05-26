// components/StatsTab.jsx — Synthèse: cards + heatmap with slide-in side panel
import { useState, useEffect, useMemo } from 'react';
import { POSTES, TYPE_LBL } from '../utils';
import * as api from '../api';

/* ── Categories ───────────────────────────────────────── */
const CATS = [
  { id:'ph',      label:'Praticiens hospitaliers', italic:false },
  { id:'padhue',  label:'PADHUE',                  italic:false },
  { id:'ipa',     label:'IPA',                     italic:false },
  { id:'interne', label:'Internes',                italic:true  },
  { id:'externe', label:'Externes',                italic:true  },
];

/* ── Congé colors & labels ────────────────────────────── */
const CONGE_COLORS = {
  'Congé annuel (CA)':     '#2272f0',
  'Congé maladie':         '#e11d48',
  'Congé maternité':       '#db2777',
  'RTT':                   '#4f46e5',
  'Récupération de garde': '#ea580c',
  'Formation':             '#059669',
  'Activité hors site':    '#d97706',
};
function congeColor(t) { return CONGE_COLORS[t] ?? '#6a6860'; }
function congeShort(t) {
  const map = {
    'Congé annuel (CA)':'CA', 'RTT':'RTT',
    'Formation':'Formation', 'Récupération de garde':'Récup.', 'Activité hors site':'Ext.',
  };
  if (map[t]) return map[t];
  if (t.includes('maternité')) return 'Maternité';
  if (t.includes('maladie'))   return 'Maladie';
  return t.slice(0, 8);
}

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

/* ── Helpers ──────────────────────────────────────────── */
const YEAR      = new Date().getFullYear();
const YEAR_START = `${YEAR}-01-01`;
const YEAR_END   = `${YEAR}-12-31`;

// Clamps an ISO date string to the current-year window.
function clampYear(iso, isEnd) {
  if (isEnd) return iso > YEAR_END   ? YEAR_END   : iso;
  return           iso < YEAR_START  ? YEAR_START : iso;
}

function countWorkingDays(d1, d2) {
  const s = clampYear(d1, false);
  const e = clampYear(d2, true);
  if (s > e) return 0;
  let n = 0;
  const end = new Date(e + 'T12:00:00');
  for (let d = new Date(s + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow > 0 && dow < 6) n++;
  }
  return n;
}

function sumW(p) {
  return Object.values(p.weeks).reduce((a, b) => a + b, 0);
}

function segs(p) {
  const total = sumW(p);
  if (!total) return [];
  return POSTES
    .filter(po => (p.weeks[po.id] || 0) > 0)
    .map(po => ({ ...po, n: p.weeks[po.id], pct: (p.weeks[po.id] / total) * 100 }));
}

function topSegs(p, n = 4) {
  return segs(p).sort((a, b) => b.n - a.n).slice(0, n);
}

function congesByType(absences) {
  const res = {};
  absences.forEach(a => {
    if (!res[a.type_abs]) res[a.type_abs] = 0;
    res[a.type_abs] += countWorkingDays(a.date_debut, a.date_fin);
  });
  return res;
}

function hexA(hex, alpha) {
  return hex + Math.round(alpha * 255).toString(16).padStart(2, '0');
}

function monthlyCongeMap(absences) {
  const res = {};
  absences.forEach(a => {
    const s = clampYear(a.date_debut, false);
    const e = clampYear(a.date_fin,   true);
    if (s > e) return;
    if (!res[a.type_abs]) res[a.type_abs] = Array(12).fill(0);
    const end = new Date(e + 'T12:00:00');
    for (let d = new Date(s + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      // d is already clamped to current year, so getMonth() is correct
      if (dow > 0 && dow < 6) res[a.type_abs][d.getMonth()]++;
    }
  });
  return res;
}

/* ── Icons ────────────────────────────────────────────── */
const IcoCards = () => (
  <svg width="15" height="12" viewBox="0 0 15 12" fill="currentColor">
    <rect x="0" y="0" width="6.5" height="5" rx="1.2"/>
    <rect x="8.5" y="0" width="6.5" height="5" rx="1.2"/>
    <rect x="0" y="7" width="6.5" height="5" rx="1.2"/>
    <rect x="8.5" y="7" width="6.5" height="5" rx="1.2"/>
  </svg>
);
const IcoMatrix = () => (
  <svg width="15" height="12" viewBox="0 0 15 12" fill="currentColor">
    <rect x="0" y="0" width="15" height="2" rx="1"/>
    <rect x="0" y="5" width="15" height="2" rx="1"/>
    <rect x="0" y="10" width="15" height="2" rx="1"/>
    <rect x="0" y="0" width="2" height="12" rx="1"/>
    <rect x="6.5" y="0" width="2" height="12" rx="1"/>
  </svg>
);
const IcoSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const IcoClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M18 6L6 18M6 6l12 12"/>
  </svg>
);

/* ── ViewToggle ───────────────────────────────────────── */
function ViewToggle({ view, setView }) {
  const btn = (v, icon, label) => (
    <button onClick={() => setView(v)} style={{
      display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
      background: view === v ? 'var(--accent)' : 'transparent',
      color:      view === v ? '#fff' : 'var(--text2)',
      border:'none', borderRadius:6, cursor:'pointer',
      fontSize:11, fontWeight:700, letterSpacing:'0.04em',
      fontFamily:'Trebuchet MS,sans-serif',
      transition:'all .15s',
    }}>
      {icon}{label}
    </button>
  );
  return (
    <div style={{ display:'flex', background:'#ede9e1', borderRadius:8, padding:3, gap:2 }}>
      {btn('cards',  <IcoCards/>,  'Par praticien')}
      {btn('matrix', <IcoMatrix/>, 'Vue matricielle')}
    </div>
  );
}

/* ── SvcBar ───────────────────────────────────────────── */
function SvcBar({ p, h = 8 }) {
  const s = segs(p);
  if (!s.length) return <div style={{ height:h, background:'#ede9e1', borderRadius:h }}/>;
  return (
    <div style={{ display:'flex', height:h, width:'100%', borderRadius:h, overflow:'hidden', gap:1 }}>
      {s.map(sg => (
        <div key={sg.id}
          title={`${sg.lbl} : ${sg.n} sem.`}
          style={{ flex:sg.pct, background:sg.c }}
        />
      ))}
    </div>
  );
}

/* ── MediumCard ───────────────────────────────────────── */
function MediumCard({ p, selected, onSelect }) {
  const [hov, setHov] = useState(false);
  const tw  = sumW(p);
  const top = topSegs(p, 4);
  const cat = CATS.find(c => c.id === p.type);
  const conges       = congesByType(p.absences);
  const totalAbsDays = Object.values(conges).reduce((a, b) => a + b, 0);

  return (
    <div
      onClick={() => onSelect(p.id === selected ? null : p.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: selected ? 'var(--accent-light)' : hov ? '#faf9f7' : 'var(--surface)',
        border:`1.5px solid ${selected ? 'var(--accent)' : hov ? '#c8c5be' : 'var(--border)'}`,
        borderRadius:10, padding:'16px 18px', cursor:'pointer',
        display:'flex', flexDirection:'column', gap:12,
        transition:'all .15s',
        boxShadow: selected ? '0 0 0 3px rgba(34,114,240,.13)' : hov ? '0 2px 8px rgba(0,0,0,.06)' : 'none',
      }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{
            fontWeight:700, fontSize:14, color:'var(--text)',
            fontStyle: cat?.italic ? 'italic' : 'normal',
            fontFamily:'Georgia,serif',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
          }}>{p.nom}</div>
          <div style={{ fontSize:10, color:'var(--text3)', marginTop:2, letterSpacing:'0.04em', fontFamily:'Trebuchet MS,sans-serif' }}>
            {TYPE_LBL[p.type]}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
          <div style={{ fontSize:24, fontWeight:800, color: selected ? 'var(--accent)' : 'var(--text)', lineHeight:1, fontFamily:'system-ui,sans-serif' }}>
            {tw}
          </div>
          <div style={{ fontSize:9, color:'var(--text2)', letterSpacing:'0.03em', fontFamily:'Trebuchet MS,sans-serif' }}>
            semaines
          </div>
        </div>
      </div>

      <SvcBar p={p} h={10}/>

      {top.length > 0 && (
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {top.map(s => (
            <div key={s.id} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:s.c, flexShrink:0 }}/>
              <span style={{ fontSize:11, color:'var(--text2)', fontFamily:'system-ui,sans-serif' }}>
                {s.short} <b style={{ color:'var(--text)', fontWeight:600 }}>{s.n}</b>
              </span>
            </div>
          ))}
        </div>
      )}

      {totalAbsDays > 0 && (
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {Object.entries(conges).map(([type, days]) => days > 0 ? (
            <div key={type} style={{ display:'flex', alignItems:'center', gap:3 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:congeColor(type) }}/>
              <span style={{ fontSize:10, color:'var(--text2)', fontFamily:'system-ui,sans-serif' }}>
                {congeShort(type)} <b style={{ color:'var(--text)', fontWeight:600 }}>{days}</b>
              </span>
            </div>
          ) : null)}
          <span style={{ marginLeft:'auto', fontSize:10, fontWeight:700, color:'var(--text2)', fontFamily:'system-ui,sans-serif' }}>
            {totalAbsDays} j.
          </span>
        </div>
      )}
    </div>
  );
}

/* ── CardsView ────────────────────────────────────────── */
function CardsView({ practitioners, selectedId, onSelect, search, setSearch }) {
  const filtered = practitioners.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding:'24px 0' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <div style={{
          display:'flex', alignItems:'center', gap:8,
          border:'1px solid var(--border)', borderRadius:8,
          background:'var(--surface)', padding:'8px 14px', width:300,
        }}>
          <IcoSearch/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un praticien…"
            style={{
              border:'none', outline:'none', background:'transparent',
              fontSize:13, color:'var(--text)', width:'100%',
              fontFamily:'Georgia,serif',
            }}
          />
          {search && (
            <span onClick={() => setSearch('')} style={{ cursor:'pointer', color:'var(--text3)', fontSize:16, lineHeight:1 }}>
              ×
            </span>
          )}
        </div>
        {search && (
          <span style={{ fontSize:12, color:'var(--text2)', fontFamily:'system-ui,sans-serif' }}>
            {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {CATS.map(cat => {
        const prats = filtered.filter(p => p.type === cat.id);
        if (!prats.length) return null;
        return (
          <div key={cat.id} style={{ marginBottom:28 }}>
            <div style={{
              fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase',
              color:'var(--text2)', paddingBottom:10, marginBottom:14,
              borderBottom:'1px solid var(--border)',
              display:'flex', justifyContent:'space-between',
              fontFamily:'Trebuchet MS,sans-serif',
            }}>
              <span style={{ fontStyle: cat.italic ? 'italic' : 'normal' }}>{cat.label}</span>
              <span style={{ fontWeight:500, letterSpacing:0, fontSize:11 }}>
                {prats.length} praticien{prats.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
              {prats.map(p => (
                <MediumCard key={p.id} p={p} selected={p.id === selectedId} onSelect={onSelect}/>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── MatrixView ───────────────────────────────────────── */
function MatrixView({ practitioners, selectedId, onSelect }) {
  const activePostes = POSTES.filter(po =>
    practitioners.some(p => (p.weeks[po.id] || 0) > 0)
  );
  const maxV = Math.max(
    ...practitioners.flatMap(p => activePostes.map(po => p.weeks[po.id] || 0)),
    1
  );

  return (
    <div style={{ padding:'24px 0' }}>
      <div style={{ fontSize:11, color:'var(--text2)', marginBottom:16, fontFamily:'system-ui,sans-serif' }}>
        Intensité = volume de semaines · cliquer sur un nom pour ouvrir le détail
      </div>
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:12, padding:'16px 20px',
        display:'inline-block', minWidth:'100%',
      }}>
        <div style={{
          display:'grid',
          gridTemplateColumns:`160px repeat(${activePostes.length}, 40px)`,
          gap:3, marginBottom:4, alignItems:'end',
        }}>
          <div/>
          {activePostes.map(po => (
            <div key={po.id} style={{ display:'flex', alignItems:'flex-end', justifyContent:'center', height:52 }}>
              <span style={{
                fontSize:9, fontWeight:700, textTransform:'uppercase',
                letterSpacing:'0.04em', color:po.c,
                writingMode:'vertical-rl', transform:'rotate(180deg)',
                fontFamily:'Trebuchet MS,sans-serif',
              }}>{po.short}</span>
            </div>
          ))}
        </div>

        {CATS.map(cat => {
          const prats = practitioners.filter(p => p.type === cat.id);
          if (!prats.length) return null;
          return (
            <div key={cat.id}>
              <div style={{
                display:'grid',
                gridTemplateColumns:`160px repeat(${activePostes.length}, 40px)`,
                gap:3, marginTop:10, marginBottom:4,
              }}>
                <div style={{
                  fontSize:9, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase',
                  color:'var(--text3)',
                  display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:10,
                  fontStyle: cat.italic ? 'italic' : 'normal',
                  fontFamily:'Trebuchet MS,sans-serif',
                }}>{cat.label}</div>
                {activePostes.map(po => (
                  <div key={po.id} style={{ height:1, background:'var(--border)' }}/>
                ))}
              </div>

              {prats.map(p => (
                <div key={p.id} style={{
                  display:'grid',
                  gridTemplateColumns:`160px repeat(${activePostes.length}, 40px)`,
                  gap:3, marginBottom:3, alignItems:'center',
                }}>
                  <div
                    onClick={() => onSelect(p.id === selectedId ? null : p.id)}
                    style={{
                      fontSize:12,
                      fontWeight: p.id === selectedId ? 700 : 500,
                      color: p.id === selectedId ? 'var(--accent)' : 'var(--text)',
                      textAlign:'right', paddingRight:10, cursor:'pointer',
                      fontStyle: cat.italic ? 'italic' : 'normal',
                      fontFamily:'Georgia,serif',
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                      transition:'color .15s',
                    }}
                  >
                    {p.nom}
                  </div>
                  {activePostes.map(po => {
                    const v = p.weeks[po.id] || 0;
                    const alpha = v > 0 ? Math.max(0.15, v / maxV) : 0;
                    const bg    = v > 0 ? hexA(po.c, alpha) : '#f0ede6';
                    const txtCol = alpha > 0.55 ? '#fff' : v > 0 ? po.c : 'transparent';
                    return (
                      <div key={po.id}
                        title={v > 0 ? `${po.lbl} : ${v} sem.` : '—'}
                        style={{
                          height:28, borderRadius:4, background:bg,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:10, fontWeight:700, color:txtCol,
                          fontFamily:'system-ui,sans-serif',
                        }}
                      >
                        {v > 0 ? v : ''}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}

        <div style={{
          display:'flex', alignItems:'center', gap:8,
          marginTop:16, paddingTop:12, borderTop:'1px solid var(--border)',
          fontFamily:'system-ui,sans-serif',
        }}>
          <span style={{ fontSize:10, color:'var(--text2)' }}>0</span>
          <div style={{ display:'flex', gap:2 }}>
            {[0.1,0.28,0.46,0.64,0.82,1].map(o => (
              <div key={o} style={{ width:22, height:11, borderRadius:2, background:hexA('#2272f0', o) }}/>
            ))}
          </div>
          <span style={{ fontSize:10, color:'var(--text2)' }}>{maxV} sem.</span>
        </div>
      </div>
    </div>
  );
}

/* ── DetailContent ────────────────────────────────────── */
function DetailContent({ p }) {
  const s    = segs(p).sort((a, b) => b.n - a.n);
  const maxW = s[0]?.n || 1;
  const conges         = congesByType(p.absences);
  const totalAbsDays   = Object.values(conges).reduce((a, b) => a + b, 0);
  const activeCongeTypes = Object.entries(conges).filter(([, d]) => d > 0);
  const mc = monthlyCongeMap(p.absences);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:22 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
        {[
          ['Semaines', sumW(p)],
          ['Services', s.length],
          ['Absences', totalAbsDays + 'j'],
        ].map(([l, v]) => (
          <div key={l} style={{ background:'var(--bg)', borderRadius:8, padding:'12px 8px', textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:'var(--text)', lineHeight:1, fontFamily:'system-ui,sans-serif' }}>
              {v}
            </div>
            <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text2)', marginTop:4, fontFamily:'Trebuchet MS,sans-serif' }}>
              {l}
            </div>
          </div>
        ))}
      </div>

      {s.length > 0 && (
        <div>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:'var(--text2)', marginBottom:10, fontFamily:'Trebuchet MS,sans-serif' }}>
            Répartition par service
          </div>
          {s.map(sv => (
            <div key={sv.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <div style={{ width:10, height:10, borderRadius:2, background:sv.c, flexShrink:0 }}/>
              <div style={{ width:52, fontSize:10, color:'var(--text2)', textAlign:'right', flexShrink:0, fontFamily:'system-ui,sans-serif' }}>
                {sv.short}
              </div>
              <div style={{ flex:1, height:7, background:'#ede9e1', borderRadius:7, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${(sv.n / maxW) * 100}%`, background:sv.c, borderRadius:7, transition:'width .4s ease' }}/>
              </div>
              <div style={{ width:24, fontSize:12, fontWeight:700, color:'var(--text)', textAlign:'right', fontFamily:'system-ui,sans-serif' }}>
                {sv.n}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeCongeTypes.length > 0 && (
        <div>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:'var(--text2)', marginBottom:10, fontFamily:'Trebuchet MS,sans-serif' }}>
            Absences par mois
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'48px repeat(12,1fr)', gap:'2px', fontSize:9, fontFamily:'system-ui,sans-serif' }}>
            <div/>
            {MONTHS_SHORT.map(m => (
              <div key={m} style={{ textAlign:'center', color:'var(--text3)', fontWeight:600, paddingBottom:3 }}>{m}</div>
            ))}
            {Object.keys(mc).map(type => [
              <div key={type + 'l'} style={{ color:'var(--text2)', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:3, fontSize:9 }}>
                {congeShort(type)}
              </div>,
              ...MONTHS_SHORT.map((_, mi) => {
                const v = mc[type][mi];
                return (
                  <div key={type + mi} style={{
                    height:18, borderRadius:3,
                    background: v > 0 ? congeColor(type) : '#ede9e1',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color: v > 0 ? '#fff' : 'transparent',
                    fontSize:8, fontWeight:700,
                  }}>{v > 0 ? v : ''}</div>
                );
              }),
            ])}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── SidePanel ────────────────────────────────────────── */
function SidePanel({ p, onClose, practitioners }) {
  const cat = CATS.find(c => c.id === p.type);
  const idx = practitioners.findIndex(x => x.id === p.id);

  return (
    <div style={{
      width:380, flexShrink:0,
      background:'var(--surface)',
      borderLeft:'1px solid var(--border)',
      display:'flex', flexDirection:'column', overflow:'hidden',
    }}>
      <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:16, color:'var(--text)', fontStyle: cat?.italic ? 'italic' : 'normal', lineHeight:1.3, fontFamily:'Georgia,serif' }}>
              {p.nom}
            </div>
            <div style={{ fontSize:11, color:'var(--text2)', marginTop:4, fontFamily:'system-ui,sans-serif' }}>
              {TYPE_LBL[p.type]} · Rotation {new Date().getFullYear()}
            </div>
          </div>
          <button
            onClick={() => onClose(null)}
            style={{
              background:'none', border:'1px solid var(--border)', borderRadius:6,
              width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer', color:'var(--text2)', flexShrink:0, marginLeft:12,
              transition:'all .15s',
            }}
          >
            <IcoClose/>
          </button>
        </div>
        <div style={{ marginTop:14 }}>
          <SvcBar p={p} h={8}/>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        <DetailContent p={p}/>
      </div>

      <div style={{ padding:'12px 24px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', flexShrink:0 }}>
        {[[-1,'← Précédent'], [1,'Suivant →']].map(([dir, label]) => {
          const next = practitioners[idx + dir];
          return (
            <button
              key={dir}
              onClick={() => next && onClose(next.id)}
              disabled={!next}
              style={{
                background:'none', border:'1px solid var(--border)', borderRadius:6,
                padding:'6px 12px', cursor: next ? 'pointer' : 'not-allowed',
                color: next ? 'var(--text)' : 'var(--text3)',
                fontSize:12, fontWeight:500, fontFamily:'system-ui,sans-serif',
                transition:'all .15s', opacity: next ? 1 : 0.4,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main StatsTab ────────────────────────────────────── */
export default function StatsTab({ medecins }) {
  const [view,       setView]       = useState('cards');
  const [selectedId, setSelectedId] = useState(null);
  const [search,     setSearch]     = useState('');
  const [allStats,   setAllStats]   = useState(null);
  const [loading,    setLoading]    = useState(true);

  const year = new Date().getFullYear();

  useEffect(() => {
    api.getAllStats()
      .then(data => {
        const map = {};
        data.forEach(({ med_id, affectations, absences }) => {
          const weeks = {};
          affectations.forEach(({ poste_id, semaines }) => { weeks[poste_id] = Number(semaines); });
          map[med_id] = { weeks, absences };
        });
        setAllStats(map);
      })
      .catch(err => console.error('Stats error:', err))
      .finally(() => setLoading(false));
  }, []);

  const practitioners = useMemo(() => {
    const catOrder = Object.fromEntries(CATS.map((c, i) => [c.id, i]));
    return medecins
      .map(m => ({
        ...m,
        weeks:    allStats?.[m.id]?.weeks    ?? {},
        absences: allStats?.[m.id]?.absences ?? [],
      }))
      .sort((a, b) =>
        (catOrder[a.type] ?? 99) - (catOrder[b.type] ?? 99) ||
        a.nom.localeCompare(b.nom, 'fr')
      );
  }, [medecins, allStats]);

  const selectedP = practitioners.find(p => p.id === selectedId) ?? null;

  function handleSelect(id) {
    setSelectedId(id ?? null);
  }

  function handleViewSwitch(v) {
    setView(v);
    setSelectedId(null);
    setSearch('');
  }

  return (
    <div>
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        marginBottom:16, paddingBottom:14, borderBottom:'1px solid var(--border)',
      }}>
        <div>
          <div className="sec-t">Synthèse par praticien</div>
          <div style={{ fontSize:11, fontFamily:'system-ui,sans-serif', color:'var(--text2)', marginTop:3 }}>
            Rotation {year} · semaines passées &amp; planifiées
          </div>
        </div>
        <ViewToggle view={view} setView={handleViewSwitch}/>
      </div>

      {loading ? (
        <div style={{ fontFamily:'system-ui,sans-serif', fontSize:12, color:'var(--text2)', padding:'2rem 0' }}>
          Chargement des statistiques…
        </div>
      ) : (
        <div style={{
          display:'flex',
          height:'calc(100vh - 190px)',
          overflow:'hidden',
          border:'1px solid var(--border)',
          borderRadius:'var(--rl)',
          background:'var(--bg)',
          boxShadow:'var(--sh)',
        }}>
          <div style={{ flex:1, minWidth:0, overflowY:'auto', overflowX:'auto', padding:'0 24px' }}>
            {view === 'cards'
              ? <CardsView
                  practitioners={practitioners}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  search={search}
                  setSearch={setSearch}
                />
              : <MatrixView
                  practitioners={practitioners}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                />
            }
          </div>

          <div style={{
            width: selectedP ? 380 : 0,
            flexShrink:0, overflow:'hidden',
            transition:'width .25s ease',
            display:'flex',
          }}>
            {selectedP && (
              <SidePanel
                p={selectedP}
                onClose={handleSelect}
                practitioners={practitioners}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
