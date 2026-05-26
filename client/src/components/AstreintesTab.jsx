import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toIso, addDays, getFrenchHolidays } from '../utils';
import * as api from '../api';

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MONTHS_FR_LOWER = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const JOURS_COURTS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

const SLOT_TYPES = [
  { id:'astreinte',  label:'Astreinte',  sub:'18h30→8h30 (sem) / 13h30→8h30 (WE)', c:'#d97706', dot:'◉', weOnly:false, bg:'#fdf6e7' },
  { id:'pont_rouge', label:'Pont Rouge', sub:'8h30→13h30',                          c:'#e11d48', dot:'▸', weOnly:true,  bg:'#fff1f2' },
  { id:'csg1',       label:'CSG 1',      sub:'8h30→13h30',                          c:'#2272f0', dot:'▸', weOnly:true,  bg:'#eff6ff' },
];

function mkKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function buildMap(astreintes) {
  const map = {};
  astreintes.forEach(a => {
    if (!map[a.date_iso]) map[a.date_iso] = {};
    map[a.date_iso][a.type_ast] = a;
  });
  return map;
}

function localMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
  dt.setHours(0,0,0,0);
  return dt;
}

function buildMonthWeeks(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const dow1 = firstDay.getDay();
  const startOff = dow1 === 0 ? -6 : 1 - dow1;
  const weeks = [];
  let cur = addDays(firstDay, startOff);
  while (cur <= lastDay) {
    weeks.push(Array.from({length:7}, (_,i) => addDays(cur, i)));
    cur = addDays(cur, 7);
  }
  return weeks;
}

function fmtWeekRange(monday) {
  const sunday = addDays(monday, 6);
  const d1 = monday.getDate(), m1 = monday.getMonth();
  const d2 = sunday.getDate(),  m2 = sunday.getMonth();
  const y  = sunday.getFullYear();
  if (m1 === m2) return `${d1} – ${d2} ${MONTHS_FR_LOWER[m1]} ${y}`;
  return `${d1} ${MONTHS_FR_LOWER[m1]} – ${d2} ${MONTHS_FR_LOWER[m2]} ${y}`;
}

// ── EPill — person name chip ─────────────────────────────
function EPill({ slotType, entry, dateIso, isSecretary, sel, onSel, onEdit }) {
  const { c, dot, bg } = slotType;
  const name = entry?.med_nom;
  const isSel = sel != null && entry != null && sel === entry.med_id;
  if (!entry && !isSecretary) return null;
  function handleClick() {
    if (isSecretary) onEdit(dateIso, slotType.id, entry ?? null);
    else if (entry) onSel?.(isSel ? null : entry.med_id);
  }
  return (
    <div onClick={handleClick} style={{
      display:'flex', alignItems:'center', gap:4,
      background: isSel ? `${c}22` : bg,
      border:`1.5px solid ${isSel ? c : isSecretary ? `${c}50` : 'transparent'}`,
      borderRadius:6, padding:'3px 7px 3px 5px',
      cursor:'pointer', transition:'all .15s', userSelect:'none',
      opacity: !entry && isSecretary ? 0.55 : 1,
    }}>
      <span style={{color:c, fontSize:9, lineHeight:1, flexShrink:0}}>{dot}</span>
      <span style={{
        fontSize:11.5, fontWeight: isSel ? 700 : 400,
        color: isSel ? c : name ? 'var(--text)' : 'var(--text3)',
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:120,
        fontFamily:'sans-serif',
      }}>
        {name ?? '— à assigner'}
      </span>
      {isSecretary && <span style={{fontSize:9, color:'var(--text3)', marginLeft:'auto', paddingLeft:4}}>✎</span>}
    </div>
  );
}

// ── AssignModal ────────────────────────────────────────
function AssignModal({ dateIso, typeAst, current, medecins, onClose, onAssign, onClear }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);
  const slotType = SLOT_TYPES.find(t => t.id === typeAst);
  const dateLabel = new Date(dateIso + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday:'long', day:'numeric', month:'long',
  });
  const q        = search.trim().toLowerCase();
  const filtered = q ? medecins.filter(m => m.nom.toLowerCase().includes(q)) : medecins;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    function h(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="mbg open" onClick={e => e.target.classList.contains('mbg') && onClose()}>
      <div className="mbox" style={{ width:360, maxHeight:560 }}>
        <div className="mhead">
          <div className="mttl" style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
            <span style={{ width:10, height:10, borderRadius:'50%', background:slotType.c, flexShrink:0, display:'inline-block' }} />
            {slotType.label}
            <span style={{ fontSize:11, fontWeight:400, color:'var(--text2)' }}>— {dateLabel}</span>
          </div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        {current && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'8px 0', borderBottom:'1px solid var(--border)', marginBottom:8 }}>
            <span style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--text2)' }}>
              Actuellement : <strong style={{ color:'var(--text)' }}>{current.med_nom}</strong>
            </span>
            <button className="btn-sm danger" onClick={onClear}>Retirer</button>
          </div>
        )}
        <div className="form-row" style={{ marginBottom:8 }}>
          <input
            ref={inputRef}
            type="text"
            className="team-search"
            placeholder="Rechercher un médecin…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width:'100%' }}
          />
        </div>
        <div style={{ maxHeight:340, overflowY:'auto' }}>
          {filtered.map(m => {
            const isCurrent = current?.med_id === m.id;
            return (
              <div key={m.id} onClick={() => onAssign(m.id)}
                style={{
                  padding:'7px 12px', cursor:'pointer', fontSize:11, fontFamily:'sans-serif',
                  borderBottom:'1px solid var(--border)',
                  background: isCurrent ? 'var(--accent-light)' : 'transparent',
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                }}
                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'var(--surface2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = isCurrent ? 'var(--accent-light)' : 'transparent'; }}
              >
                <span style={{ fontWeight: isCurrent ? 700 : 400 }}>{m.nom}</span>
                <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {m.service && m.service !== 'geriatrie' && (
                    <span style={{ fontSize:9, color:'var(--text3)', fontStyle:'italic' }}>{m.service}</span>
                  )}
                  {isCurrent && <span style={{ fontSize:9, color:'var(--accent)', fontWeight:700 }}>✓ actuel</span>}
                </span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p style={{ textAlign:'center', color:'var(--text3)', fontSize:11, fontStyle:'italic', padding:'16px 0' }}>
              Aucun médecin trouvé
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── StatsSection ───────────────────────────────────────
function StatsSection({ astreintes, monthLabel }) {
  if (!astreintes.length) return null;
  const counts = {};
  astreintes.forEach(a => {
    if (!counts[a.med_id]) counts[a.med_id] = { nom:a.med_nom, astreinte:0, we:0 };
    if (a.type_ast === 'astreinte') counts[a.med_id].astreinte++;
    const dow = new Date(a.date_iso + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6) counts[a.med_id].we++;
  });
  const sorted = Object.values(counts).sort((a, b) => b.astreinte - a.astreinte);
  return (
    <div style={{ marginTop:20, borderTop:'1px solid var(--border)', paddingTop:14 }}>
      <div className="sec-s">Récapitulatif — {monthLabel}</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        {sorted.map(({ nom, astreinte, we }) => (
          <div key={nom} style={{
            fontSize:10, fontFamily:'sans-serif', padding:'3px 10px',
            background:'var(--surface2)', borderRadius:'var(--r)',
            border:'1px solid var(--border)',
          }}>
            <strong>{nom}</strong>
            <span style={{ color:'var(--text2)', marginLeft:6 }}>
              {astreinte} nuit{astreinte > 1 ? 's' : ''}
            </span>
            {we > 0 && (
              <span style={{ color:'#e11d48', marginLeft:5, fontWeight:600 }}>+{we} WE</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MiniMonth — sidebar for Semaine view ────────────────
function MiniMonth({ year, month, aMap, sel, weekStart, holidays }) {
  const weeks = buildMonthWeeks(year, month);
  const todayIso  = toIso(new Date());
  const wkMonIso  = toIso(weekStart);

  return (
    <div style={{
      width:192, flexShrink:0, background:'var(--surface)',
      borderRight:'1px solid var(--border)', padding:'16px 12px',
      display:'flex', flexDirection:'column', gap:12,
    }}>
      <div>
        <div style={{fontSize:12, fontWeight:800, color:'var(--text)', marginBottom:10, fontFamily:'sans-serif'}}>
          {MONTHS_FR[month]} {year}
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1, marginBottom:4}}>
          {JOURS_COURTS.map((l,i) => (
            <div key={l} style={{textAlign:'center', fontSize:8, fontWeight:700,
              color: i>=5 ? '#e11d48' : 'var(--text3)', paddingBottom:3}}>
              {l[0]}
            </div>
          ))}
        </div>
        {weeks.map((wk, wi) => {
          const isSelectedWk = toIso(wk[0]) === wkMonIso;
          return (
            <div key={wi} style={{
              display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1,
              background: isSelectedWk ? 'var(--accent-light)' : 'transparent',
              borderRadius:5, marginBottom:1, padding:'1px 0',
            }}>
              {wk.map((day, di) => {
                const inMonth = day.getMonth() === month;
                const iso = toIso(day);
                const d   = aMap[iso] || {};
                const tod = iso === todayIso;
                const wknd = di >= 5;
                const personMatch = sel != null && (
                  d.astreinte?.med_id === sel ||
                  d.pont_rouge?.med_id === sel ||
                  d.csg1?.med_id === sel
                );
                return (
                  <div key={di} title={d.astreinte?.med_nom ?? ''} style={{
                    display:'flex', flexDirection:'column', alignItems:'center',
                    padding:'2px 0', borderRadius:3,
                    background: tod ? 'var(--accent)' : personMatch ? 'var(--accent-light)' : 'transparent',
                    opacity: inMonth ? 1 : 0.25,
                  }}>
                    <span style={{
                      fontSize:9, fontWeight: tod ? 800 : 400,
                      color: tod ? '#fff' : wknd ? '#e11d48' : 'var(--text)',
                    }}>{day.getDate()}</span>
                    {d.astreinte && !tod && (
                      <div style={{
                        width:4, height:4, borderRadius:'50%', marginTop:1,
                        background: personMatch ? 'var(--accent)' : '#d97706',
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{borderTop:'1px solid var(--border)', paddingTop:10, display:'flex', flexDirection:'column', gap:6}}>
        {SLOT_TYPES.map(sh => (
          <div key={sh.id} style={{display:'flex', alignItems:'center', gap:6}}>
            <span style={{color:sh.c, fontSize:11}}>{sh.dot}</span>
            <div>
              <div style={{fontSize:11, fontWeight:700, color:'var(--text)', fontFamily:'sans-serif'}}>{sh.label}</div>
              <div style={{fontSize:9, color:'var(--text3)', fontFamily:'sans-serif', lineHeight:1.3}}>{sh.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DayCard — one day card in Semaine view ───────────────
function DayCard({ date, aMap, holidays, isSecretary, sel, onSel, onEdit }) {
  const iso   = toIso(date);
  const d     = aMap[iso] || {};
  const dowN  = (date.getDay() + 6) % 7; // 0=Mon..6=Sun
  const wknd  = dowN >= 5;
  const hol   = holidays?.get(iso);
  const isWEH = wknd || !!hol;
  const isToday = iso === toIso(new Date());
  const match   = sel != null && (d.astreinte?.med_id === sel || d.pont_rouge?.med_id === sel || d.csg1?.med_id === sel);
  const fade    = sel != null && !match;

  return (
    <div style={{
      flex:1, minWidth:90, position:'relative', overflow:'hidden',
      border: isToday ? '2px solid var(--accent)' : '1px solid var(--border)',
      borderRadius:'var(--rl)',
      background: isToday ? 'var(--accent-light)' : wknd ? '#fdf4f4' : 'var(--surface)',
      padding:'14px 12px 12px',
      opacity: fade ? 0.25 : 1, transition:'opacity .2s',
    }}>
      {hol && (
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none', borderRadius:'inherit',
          backgroundImage:'var(--holiday-stripe)',
        }}/>
      )}
      <div style={{position:'relative', zIndex:1}}>
        <div style={{marginBottom:8}}>
          <div style={{
            fontSize:10, fontWeight:700, letterSpacing:'0.08em',
            color: wknd ? '#e11d48' : 'var(--text3)',
            textTransform:'uppercase', marginBottom:2,
            fontFamily:'system-ui,sans-serif',
          }}>
            {JOURS_COURTS[dowN]}
          </div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:4}}>
            <div style={{
              fontSize:22, fontWeight:800, lineHeight:1,
              color: isToday ? 'var(--accent)' : wknd ? '#e11d48' : 'var(--text)',
            }}>
              {date.getDate()}
            </div>
            {hol && (
              <div style={{fontSize:9, color:'#b45309', fontWeight:600, lineHeight:1.3, fontFamily:'sans-serif', textAlign:'right', maxWidth:'65%'}}>
                {hol}
              </div>
            )}
          </div>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:3}}>
          <EPill slotType={SLOT_TYPES[0]} entry={d.astreinte}  dateIso={iso} isSecretary={isSecretary} sel={sel} onSel={onSel} onEdit={onEdit} />
          {isWEH && <EPill slotType={SLOT_TYPES[1]} entry={d.pont_rouge} dateIso={iso} isSecretary={isSecretary} sel={sel} onSel={onSel} onEdit={onEdit} />}
          {isWEH && <EPill slotType={SLOT_TYPES[2]} entry={d.csg1}       dateIso={iso} isSecretary={isSecretary} sel={sel} onSel={onSel} onEdit={onEdit} />}
        </div>
      </div>
    </div>
  );
}

// ── ViewSemaine (Direction A) ────────────────────────────
function ViewSemaine({ year, month, weekStart, onWeekChange, aMap, holidays, isSecretary, sel, onSel, onEdit }) {
  const todayMon   = toIso(localMonday(new Date()));
  const isCurrentWk = toIso(weekStart) === todayMon;
  const days = Array.from({length:7}, (_,i) => addDays(weekStart, i));

  return (
    <div>
      <div style={{
        display:'flex', alignItems:'center', gap:10,
        marginBottom:16, flexWrap:'wrap',
      }}>
        <button onClick={() => onWeekChange(addDays(weekStart, -7))} style={{
          background:'none', border:'1px solid var(--border)', borderRadius:6,
          width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', color:'var(--text2)', fontSize:14, fontFamily:'inherit',
        }}>‹</button>
        <span style={{fontSize:14, fontWeight:700, color:'var(--text)', fontFamily:'sans-serif'}}>
          {fmtWeekRange(weekStart)}
        </span>
        {isCurrentWk && (
          <span style={{
            fontSize:10, background:'var(--accent-light)', color:'var(--accent)',
            fontWeight:700, padding:'2px 9px', borderRadius:10, fontFamily:'sans-serif',
          }}>Cette semaine</span>
        )}
        <button onClick={() => onWeekChange(addDays(weekStart, 7))} style={{
          background:'none', border:'1px solid var(--border)', borderRadius:6,
          width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', color:'var(--text2)', fontSize:14, fontFamily:'inherit',
        }}>›</button>
        {sel != null && (
          <button onClick={() => onSel(null)} style={{
            marginLeft:'auto', background:'none', border:'1px solid var(--border)',
            borderRadius:6, padding:'3px 10px', fontSize:11, color:'var(--text2)',
            cursor:'pointer', fontFamily:'inherit',
          }}>× Effacer</button>
        )}
      </div>
      <div style={{display:'flex', gap:0, alignItems:'flex-start', border:'1px solid var(--border)', borderRadius:'var(--rl)', overflow:'hidden', background:'var(--surface)'}}>
        <MiniMonth year={year} month={month} aMap={aMap} sel={sel} weekStart={weekStart} holidays={holidays} />
        <div style={{flex:1, padding:16, display:'flex', gap:8, alignItems:'flex-start', overflowX:'auto', background:'var(--bg)'}}>
          {days.map((d,i) => (
            <DayCard key={i} date={d} aMap={aMap} holidays={holidays}
              isSecretary={isSecretary} sel={sel} onSel={onSel} onEdit={onEdit} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ViewRotation (Direction B) ───────────────────────────
function ViewRotation({ year, month, aMap, medecins, isSecretary, onEdit, holidays }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso    = toIso(new Date());
  const days = Array.from({length: daysInMonth}, (_,i) => {
    const d = new Date(year, month, i+1);
    return { day: i+1, iso: toIso(d), dow: (d.getDay() + 6) % 7 };
  });

  const totals = useMemo(() => {
    const t = {};
    medecins.forEach(m => { t[m.id] = { a:0, p:0, c:0 }; });
    Object.values(aMap).forEach(slots => {
      if (slots.astreinte)  { const id = slots.astreinte.med_id;  if (t[id]) t[id].a++; }
      if (slots.pont_rouge) { const id = slots.pont_rouge.med_id; if (t[id]) t[id].p++; }
      if (slots.csg1)       { const id = slots.csg1.med_id;       if (t[id]) t[id].c++; }
    });
    return t;
  }, [aMap, medecins]);

  const sorted = useMemo(() =>
    [...medecins].sort((a,b) => {
      const ta = totals[a.id] || {a:0,p:0,c:0};
      const tb = totals[b.id] || {a:0,p:0,c:0};
      const diff = (tb.a + tb.p + tb.c) - (ta.a + ta.p + ta.c);
      return diff !== 0 ? diff : a.nom.localeCompare(b.nom);
    }),
  [medecins, totals]);

  return (
    <div style={{overflowX:'auto'}}>
      <table style={{borderCollapse:'collapse', tableLayout:'fixed', width:'max-content'}}>
        <colgroup>
          <col style={{width:160}} />
          {days.map(({iso}) => <col key={iso} style={{width:32}} />)}
          <col style={{width:96}} />
        </colgroup>
        <thead>
          <tr>
            <th style={{padding:0, borderRight:'1px solid var(--border)', borderBottom:'1px solid var(--border)'}} />
            {days.map(({day, iso, dow}) => {
              const tod  = iso === todayIso;
              const wknd = dow >= 5;
              const hol  = !!holidays?.get(iso);
              return (
                <th key={iso} style={{
                  height:40, padding:'4px 0', textAlign:'center', verticalAlign:'bottom',
                  background: tod ? 'var(--accent)' : hol ? '#fef3c7' : wknd ? '#fdf4f4' : 'var(--bg)',
                  borderRight:'1px solid var(--border)',
                  borderBottom:`1px solid ${tod ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                  <div style={{fontSize:7, fontWeight:700, lineHeight:1, marginBottom:2,
                    color: tod ? 'rgba(255,255,255,.7)' : wknd ? '#e11d48' : 'var(--text3)'}}>
                    {JOURS_COURTS[dow][0]}
                  </div>
                  <div style={{fontSize:11, fontWeight: tod ? 800 : 600, lineHeight:1,
                    color: tod ? '#fff' : wknd ? '#e11d48' : 'var(--text)'}}>
                    {day}
                  </div>
                </th>
              );
            })}
            <th style={{padding:'0 0 4px 10px', textAlign:'left', verticalAlign:'bottom',
              borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:9, fontWeight:700, letterSpacing:'0.08em', color:'var(--text3)',
                fontFamily:'system-ui,sans-serif'}}>TOTAL</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(med => {
            const t = totals[med.id] || {a:0,p:0,c:0};
            return (
              <tr key={med.id}>
                <td style={{
                  height:34, padding:'0 14px', fontSize:12, fontWeight:600, color:'var(--text)',
                  whiteSpace:'nowrap', borderRight:'1px solid var(--border)', borderBottom:'1px solid var(--border)',
                  background:'var(--surface)', fontFamily:'sans-serif',
                }}>
                  {med.nom}
                </td>
                {days.map(({iso, dow}) => {
                  const d    = aMap[iso] || {};
                  const shA  = d.astreinte?.med_id  === med.id;
                  const shP  = d.pont_rouge?.med_id === med.id;
                  const shC  = d.csg1?.med_id       === med.id;
                  const tod  = iso === todayIso;
                  const wknd = dow >= 5;
                  return (
                    <td key={iso} style={{
                      width:32, padding:0, textAlign:'center', verticalAlign:'middle',
                      background: tod ? 'rgba(34,114,240,.1)' : wknd ? 'rgba(225,29,72,.02)' : 'transparent',
                      borderRight:'1px solid var(--border)', borderBottom:'1px solid var(--border)',
                      cursor: isSecretary ? 'pointer' : 'default',
                    }} onClick={isSecretary ? () => {
                      const sid     = shA ? 'astreinte' : shP ? 'pont_rouge' : 'csg1';
                      const current = shA ? d.astreinte : shP ? d.pont_rouge : shC ? d.csg1 : null;
                      onEdit(iso, sid, current);
                    } : undefined}>
                      <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, height:34}}>
                        {shA && <div style={{width:9,height:9,borderRadius:'50%',background:'#d97706'}} />}
                        {shP && <div style={{width:9,height:9,borderRadius:'50%',background:'#e11d48'}} />}
                        {shC && <div style={{width:9,height:9,borderRadius:'50%',background:'#2272f0'}} />}
                        {!shA && !shP && !shC && isSecretary && (
                          <div style={{width:14,height:14,borderRadius:3,border:'1.5px dashed var(--border)'}} />
                        )}
                      </div>
                    </td>
                  );
                })}
                <td style={{padding:'0 0 0 10px', borderBottom:'1px solid var(--border)', background:'var(--surface)'}}>
                  <div style={{display:'flex', gap:3, alignItems:'center', flexWrap:'nowrap'}}>
                    {t.a > 0 && <span style={{fontSize:10,fontWeight:700,color:'#d97706',background:'#fdf6e7',padding:'2px 5px',borderRadius:6,whiteSpace:'nowrap',fontFamily:'sans-serif'}}>{t.a}A</span>}
                    {t.p > 0 && <span style={{fontSize:10,fontWeight:700,color:'#e11d48',background:'#fff1f2',padding:'2px 5px',borderRadius:6,whiteSpace:'nowrap',fontFamily:'sans-serif'}}>{t.p}P</span>}
                    {t.c > 0 && <span style={{fontSize:10,fontWeight:700,color:'#2272f0',background:'#eff6ff',padding:'2px 5px',borderRadius:6,whiteSpace:'nowrap',fontFamily:'sans-serif'}}>{t.c}C</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{display:'flex', gap:14, paddingTop:10, paddingLeft:160, flexWrap:'wrap'}}>
        {SLOT_TYPES.map(sh => (
          <div key={sh.id} style={{display:'flex', alignItems:'center', gap:5}}>
            <div style={{width:9,height:9,borderRadius:'50%',background:sh.c}} />
            <span style={{fontSize:10, color:'var(--text2)', fontFamily:'sans-serif'}}>{sh.label}</span>
          </div>
        ))}
        {isSecretary && (
          <span style={{fontSize:10, color:'var(--text3)', marginLeft:4, fontFamily:'sans-serif', fontStyle:'italic'}}>
            Cliquer sur une cellule pour modifier
          </span>
        )}
      </div>
    </div>
  );
}

// ── CalCell — calendar cell for Calendrier view ──────────
function CalCell({ date, aMap, holidays, isSecretary, sel, onSel, onEdit }) {
  const iso   = toIso(date);
  const d     = aMap[iso] || {};
  const dowN  = (date.getDay() + 6) % 7;
  const wknd  = dowN >= 5;
  const hol   = holidays?.get(iso);
  const isWEH = wknd || !!hol;
  const isToday = iso === toIso(new Date());
  const match   = sel != null && (d.astreinte?.med_id === sel || d.pont_rouge?.med_id === sel || d.csg1?.med_id === sel);
  const fade    = sel != null && !match;
  const visible = SLOT_TYPES.filter(st => !st.weOnly || isWEH);

  return (
    <div style={{
      position:'relative', overflow:'hidden',
      border: isToday ? '2px solid var(--accent)' : '1px solid var(--border)',
      borderRadius:'var(--r)',
      background: isToday ? 'var(--accent-light)' : wknd ? 'rgba(225,29,72,.03)' : 'var(--surface)',
      padding:'8px 8px 7px',
      minHeight: isWEH ? 88 : 50,
      opacity: fade ? 0.25 : 1, transition:'opacity .2s',
    }}>
      {hol && (
        <div style={{position:'absolute', inset:0, pointerEvents:'none', borderRadius:'inherit', backgroundImage:'var(--holiday-stripe)'}}/>
      )}
      <div style={{position:'relative', zIndex:1}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:4, marginBottom:4}}>
          <span style={{
            fontSize:11, fontWeight: isToday ? 800 : 600, fontFamily:'sans-serif',
            color: isToday ? 'var(--accent)' : wknd ? '#e11d48' : 'var(--text)',
          }}>
            {date.getDate()}
          </span>
          {hol && (
            <span style={{fontSize:8, color:'#b45309', fontWeight:600, textAlign:'right', lineHeight:1.3, fontFamily:'sans-serif'}}>
              {hol}
            </span>
          )}
        </div>
        {visible.map(st => (
          <EPill key={st.id} slotType={st} entry={d[st.id] ?? null} dateIso={iso}
            isSecretary={isSecretary} sel={sel} onSel={onSel} onEdit={onEdit} />
        ))}
      </div>
    </div>
  );
}

// ── ViewCalendrier (Direction C) ─────────────────────────
function ViewCalendrier({ year, month, aMap, medecins, holidays, isSecretary, sel, onSel, onEdit }) {
  const weeks    = buildMonthWeeks(year, month);
  const todayIso = toIso(new Date());
  const tonight  = aMap[todayIso];
  const todayDate = new Date(todayIso + 'T12:00:00');
  const showSpotlight = todayDate.getFullYear() === year && todayDate.getMonth() === month;

  const personsInMonth = useMemo(() => {
    const ids = new Set(
      Object.values(aMap).flatMap(slots =>
        Object.values(slots).filter(Boolean).map(e => e.med_id)
      )
    );
    return medecins.filter(m => ids.has(m.id));
  }, [aMap, medecins]);

  return (
    <div>
      {showSpotlight && tonight?.astreinte && (
        <div style={{
          display:'inline-flex', alignItems:'center', gap:8,
          background:'#fdf6e7', border:'1px solid rgba(215,151,6,.31)',
          borderRadius:10, padding:'7px 14px', marginBottom:14,
        }}>
          <div style={{width:8,height:8,borderRadius:'50%',background:'#d97706',flexShrink:0}} />
          <span style={{fontSize:10, fontWeight:700, color:'var(--text2)', letterSpacing:'0.07em', fontFamily:'system-ui,sans-serif'}}>CE SOIR</span>
          <span style={{fontSize:13, fontWeight:800, color:'var(--text)', fontFamily:'sans-serif'}}>{tonight.astreinte.med_nom}</span>
          <span style={{fontSize:10, color:'var(--text3)', fontFamily:'sans-serif'}}>18h30 → 8h30</span>
        </div>
      )}
      <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:4}}>
        {JOURS_COURTS.map((l,i) => (
          <div key={l} style={{
            textAlign:'center', fontSize:10, fontWeight:700, letterSpacing:'0.05em',
            color: i >= 5 ? '#e11d48' : 'var(--text2)', padding:'6px 0',
            fontFamily:'system-ui,sans-serif',
          }}>{l}</div>
        ))}
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:4}}>
        {weeks.map((wk, wi) => (
          <div key={wi} style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4}}>
            {wk.map((day, di) => (
              <div key={di} style={{opacity: day.getMonth() === month ? 1 : 0.3}}>
                <CalCell date={day} aMap={aMap} holidays={holidays}
                  isSecretary={isSecretary} sel={sel} onSel={onSel} onEdit={onEdit} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {personsInMonth.length > 0 && (
        <div style={{
          borderTop:'1px solid var(--border)', marginTop:14, paddingTop:8,
          display:'flex', gap:5, flexWrap:'wrap', alignItems:'center',
        }}>
          <span style={{fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:'var(--text3)',
            marginRight:3, fontFamily:'system-ui,sans-serif'}}>FILTRER PAR PRATICIEN</span>
          {personsInMonth.map(m => {
            const isSel = sel === m.id;
            return (
              <div key={m.id} onClick={() => onSel(isSel ? null : m.id)} style={{
                display:'flex', alignItems:'center',
                background: isSel ? 'var(--accent-light)' : 'var(--bg)',
                border:`1px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius:20, padding:'3px 10px',
                cursor:'pointer', userSelect:'none', transition:'all .15s',
              }}>
                <span style={{
                  fontSize:11, fontWeight: isSel ? 700 : 500,
                  color: isSel ? 'var(--accent)' : 'var(--text2)',
                  whiteSpace:'nowrap', fontFamily:'sans-serif',
                }}>{m.nom}</span>
              </div>
            );
          })}
          {sel != null && (
            <button onClick={() => onSel(null)} style={{
              background:'none', border:'1px solid var(--border)', borderRadius:6,
              padding:'3px 10px', fontSize:11, color:'var(--text2)',
              cursor:'pointer', fontFamily:'inherit',
            }}>× Effacer</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── AstreintesTab — composant principal ──────────────────
export default function AstreintesTab({ medecins, isSecretary, onToast, onPushUndo, dayIso }) {
  const initDate = dayIso ? new Date(dayIso + 'T12:00:00') : new Date();
  const [monthDate, setMonthDate] = useState(new Date(initDate.getFullYear(), initDate.getMonth(), 1));
  const [weekStart, setWeekStart] = useState(() => localMonday(initDate));
  const [astreintes, setAstreintes] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [modal,      setModal]      = useState(null);
  const [view,       setView]       = useState('C');
  const [sel,        setSel]        = useState(null);

  const y  = monthDate.getFullYear();
  const mo = monthDate.getMonth();
  const mk = mkKey(monthDate);
  const holidays = useMemo(() => getFrenchHolidays(y), [y]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAstreintes(await api.getAstreintes(mk)); }
    catch(e) { onToast?.(e.message || 'Erreur de chargement', 'err'); }
    finally { setLoading(false); }
  }, [mk]);

  useEffect(() => { load(); }, [load]);

  const aMap = useMemo(() => buildMap(astreintes), [astreintes]);

  function changeMonth(newMo) {
    setMonthDate(newMo);
    setSel(null);
    const newY = newMo.getFullYear(), newMoN = newMo.getMonth();
    const firstDay = new Date(newY, newMoN, 1);
    const lastDay  = new Date(newY, newMoN + 1, 0);
    const wsEnd = addDays(weekStart, 6);
    if (!(weekStart <= lastDay && wsEnd >= firstDay)) {
      setWeekStart(localMonday(firstDay));
    }
  }

  function handleWeekChange(newMonday) {
    setWeekStart(newMonday);
    const thursday = addDays(newMonday, 3);
    const newMonthFirst = new Date(thursday.getFullYear(), thursday.getMonth(), 1);
    if (mkKey(newMonthFirst) !== mk) {
      setMonthDate(newMonthFirst);
    }
  }

  function handleEdit(dateIso, typeAst, current) {
    setModal({ dateIso, typeAst, current: current ?? null });
  }

  async function handleAssign(dateIso, typeAst, medId) {
    try {
      const existing = aMap[dateIso]?.[typeAst];
      if (!medId) {
        if (!existing) { setModal(null); return; }
        await api.deleteAstreinte(existing.id);
        const snap = { date_iso:dateIso, type_ast:typeAst, med_id:existing.med_id };
        onPushUndo?.('Retrait astreinte', async () => { await api.addAstreinte(snap); load(); });
      } else {
        const newRow = await api.addAstreinte({ date_iso:dateIso, type_ast:typeAst, med_id:medId });
        const newId  = newRow.id;
        const prevSnap = existing ? { date_iso:dateIso, type_ast:typeAst, med_id:existing.med_id } : null;
        onPushUndo?.('Affectation astreinte', async () => {
          await api.deleteAstreinte(newId);
          if (prevSnap) await api.addAstreinte(prevSnap);
          load();
        });
      }
      setModal(null);
      await load();
      onToast?.('Enregistré');
    } catch(e) {
      onToast?.(e.message || 'Erreur', 'err');
    }
  }

  const VIEWS = [
    { id:'A', label:'Semaine',    desc:'Cette semaine en grand' },
    { id:'B', label:'Rotation',   desc:'Vue par praticien'      },
    { id:'C', label:'Calendrier', desc:'Vue mensuelle'          },
  ];

  return (
    <div>
      {/* Month nav */}
      <div className="wn print-hide">
        <button className="wn-btn" onClick={() => changeMonth(new Date(y, mo-1, 1))}>‹</button>
        <span className="wn-lbl">{MONTHS_FR[mo]} {y}</span>
        <button className="wn-btn" onClick={() => changeMonth(new Date(y, mo+1, 1))}>›</button>
        <button className="wn-chip" onClick={() => {
          const n = new Date(); changeMonth(new Date(n.getFullYear(), n.getMonth(), 1));
        }}>Mois actuel</button>
        {loading && (
          <span style={{ fontSize:11, color:'var(--text2)', marginLeft:8, fontFamily:'sans-serif' }}>
            Chargement…
          </span>
        )}
        {!isSecretary && (
          <span style={{ fontSize:10, color:'var(--text3)', marginLeft:'auto', fontFamily:'sans-serif', fontStyle:'italic' }}>
            Lecture seule — déverrouillez pour modifier
          </span>
        )}
      </div>

      {/* View switcher + legend toolbar */}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        gap:12, marginBottom:16, flexWrap:'wrap',
      }}>
        <div style={{display:'flex', gap:6}}>
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => { setView(v.id); setSel(null); }} style={{
              display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2,
              padding:'8px 16px', borderRadius:'var(--r)',
              border:`1.5px solid ${view===v.id ? 'var(--accent)' : 'var(--border)'}`,
              background: view===v.id ? 'var(--accent-light)' : 'transparent',
              cursor:'pointer', fontFamily:'inherit', transition:'all .15s', minWidth:90,
            }}>
              <span style={{fontSize:12, fontWeight:700, color: view===v.id ? 'var(--accent)' : 'var(--text)'}}>
                {v.label}
              </span>
              <span style={{fontSize:10, color: view===v.id ? 'rgba(34,114,240,.6)' : 'var(--text3)'}}>
                {v.desc}
              </span>
            </button>
          ))}
        </div>
        <div style={{display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
          {SLOT_TYPES.map(sh => (
            <div key={sh.id} style={{
              display:'flex', alignItems:'center', gap:5,
              background:sh.bg, border:`1px solid ${sh.c}50`,
              borderRadius:20, padding:'4px 11px',
            }}>
              <div style={{width:7,height:7,borderRadius:'50%',background:sh.c,flexShrink:0}} />
              <span style={{fontSize:11, fontWeight:600, color:sh.c, whiteSpace:'nowrap', fontFamily:'sans-serif'}}>
                {sh.label}
              </span>
              {sh.weOnly && (
                <span style={{fontSize:9, color:sh.c, opacity:.7, marginLeft:1, fontFamily:'sans-serif'}}>WE</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === 'A' && (
        <ViewSemaine
          year={y} month={mo} weekStart={weekStart} onWeekChange={handleWeekChange}
          aMap={aMap} holidays={holidays} isSecretary={isSecretary}
          sel={sel} onSel={setSel} onEdit={handleEdit}
        />
      )}
      {view === 'B' && (
        <ViewRotation
          year={y} month={mo} aMap={aMap} medecins={medecins}
          isSecretary={isSecretary} onEdit={handleEdit} holidays={holidays}
        />
      )}
      {view === 'C' && (
        <>
          <ViewCalendrier
            year={y} month={mo} aMap={aMap} medecins={medecins}
            holidays={holidays} isSecretary={isSecretary}
            sel={sel} onSel={setSel} onEdit={handleEdit}
          />
          <StatsSection astreintes={astreintes} monthLabel={`${MONTHS_FR[mo]} ${y}`} />
        </>
      )}

      {modal && isSecretary && (
        <AssignModal
          {...modal}
          medecins={medecins}
          onClose={() => setModal(null)}
          onAssign={medId => handleAssign(modal.dateIso, modal.typeAst, medId)}
          onClear={() => handleAssign(modal.dateIso, modal.typeAst, null)}
        />
      )}
    </div>
  );
}
