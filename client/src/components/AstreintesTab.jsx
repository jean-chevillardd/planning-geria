import { useState, useEffect, useCallback, useRef } from 'react';
import { toIso, addDays, getFrenchHolidays } from '../utils';
import * as api from '../api';

const MONTHS_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const SLOT_TYPES = [
  { id:'astreinte',  label:'Astreinte',  sub:'18h30→8h30 (sem) / 13h30→8h30 (WE)', c:'#d97706', weOnly:false },
  { id:'pont_rouge', label:'Pont Rouge', sub:'8h30→13h30',                          c:'#e11d48', weOnly:true  },
  { id:'csg1',       label:'CSG 1',      sub:'8h30→13h30',                          c:'#2272f0', weOnly:true  },
];

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildMap(astreintes) {
  const map = {};
  astreintes.forEach(a => {
    if (!map[a.date_iso]) map[a.date_iso] = {};
    map[a.date_iso][a.type_ast] = a;
  });
  return map;
}

// ── Chip d'un créneau ──────────────────────────────────
function SlotChip({ slotType, entry, isSecretary, onClick }) {
  const { c } = slotType;
  return (
    <div
      onClick={isSecretary ? onClick : undefined}
      style={{
        fontSize:9, marginBottom:3, borderRadius:4, padding:'2px 5px',
        background: entry ? c + '1a' : isSecretary ? 'var(--surface2)' : 'transparent',
        border:`1px solid ${entry ? c + '55' : 'var(--border)'}`,
        cursor: isSecretary ? 'pointer' : 'default',
        minHeight:18, display:'flex', alignItems:'center', gap:4, overflow:'hidden',
        transition:'background .1s',
      }}
      onMouseEnter={e => { if (isSecretary) e.currentTarget.style.background = c + '33'; }}
      onMouseLeave={e => { e.currentTarget.style.background = entry ? c + '1a' : isSecretary ? 'var(--surface2)' : 'transparent'; }}
    >
      <span style={{ fontWeight:700, color:c, flexShrink:0, fontSize:8 }}>
        {slotType.id === 'astreinte' ? '◉' : '▸'}
      </span>
      {entry
        ? <span style={{ color:'var(--text)', fontFamily:'sans-serif', fontSize:9,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:600 }}>
            {entry.med_nom}
          </span>
        : <span style={{ color:'var(--text3)', fontStyle:'italic', fontFamily:'sans-serif' }}>—</span>
      }
    </div>
  );
}

// ── Modal d'affectation ────────────────────────────────
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
              <div
                key={m.id}
                onClick={() => onAssign(m.id)}
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

// ── Récapitulatif du mois ──────────────────────────────
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

// ── Composant principal ───────────────────────────────
export default function AstreintesTab({ medecins, isSecretary, onToast, onPushUndo, dayIso }) {
  const initDate = dayIso ? new Date(dayIso + 'T12:00:00') : new Date();
  const [monthDate, setMonthDate] = useState(
    new Date(initDate.getFullYear(), initDate.getMonth(), 1)
  );
  const [astreintes, setAstreintes] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [modal,      setModal]      = useState(null);

  const y  = monthDate.getFullYear();
  const mo = monthDate.getMonth();
  const mk = monthKey(monthDate);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAstreintes(mk);
      setAstreintes(data);
    } catch(e) {
      onToast?.(e.message || 'Erreur de chargement', 'err');
    } finally {
      setLoading(false);
    }
  }, [mk]);

  useEffect(() => { load(); }, [load]);

  const aMap = buildMap(astreintes);
  const holidays = getFrenchHolidays(y);

  // Semaines du mois (lundi→dimanche)
  const firstDay   = new Date(y, mo, 1);
  const dow1       = firstDay.getDay();
  const startOff   = dow1 === 0 ? -6 : 1 - dow1;
  const weekStarts = [];
  let   cur        = addDays(firstDay, startOff);
  const lastDay    = new Date(y, mo + 1, 0);
  while (cur <= lastDay) {
    weekStarts.push(new Date(cur));
    cur = addDays(cur, 7);
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

  return (
    <div>
      {/* ── Navigation ── */}
      <div className="wn print-hide">
        <button className="wn-btn" onClick={() => setMonthDate(new Date(y, mo - 1, 1))}>‹</button>
        <span className="wn-lbl">{MONTHS_FR[mo]} {y}</span>
        <button className="wn-btn" onClick={() => setMonthDate(new Date(y, mo + 1, 1))}>›</button>
        <button className="wn-chip" onClick={() => {
          const n = new Date(); setMonthDate(new Date(n.getFullYear(), n.getMonth(), 1));
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

      {/* ── Légende ── */}
      <div style={{ display:'flex', gap:14, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        {SLOT_TYPES.map(st => (
          <div key={st.id} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, fontFamily:'sans-serif' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:st.c, flexShrink:0 }} />
            <strong style={{ color:st.c }}>{st.label}</strong>
            <span style={{ color:'var(--text3)' }}>
              {st.sub}{st.weOnly ? <em style={{ color:'#e11d48' }}> — WE seul</em> : ''}
            </span>
          </div>
        ))}
      </div>

      {/* ── Entêtes colonnes ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:4 }}>
        {JOURS_COURTS.map((d, i) => (
          <div key={d} style={{
            textAlign:'center', fontSize:10, fontWeight:700, fontFamily:'sans-serif',
            color: i >= 5 ? '#e11d48' : 'var(--text2)', paddingBottom:4,
          }}>{d}</div>
        ))}
      </div>

      {/* ── Grille ── */}
      {weekStarts.map((monday, wi) => (
        <div key={wi} style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:4 }}>
          {Array.from({ length:7 }, (_, di) => {
            const day         = addDays(monday, di);
            const dateIso     = toIso(day);
            const isThisMonth = day.getMonth() === mo;
            const isToday     = dateIso === toIso(new Date());
            const isWE        = di >= 5;
            const holidayName = holidays.get(dateIso);
            const slots       = aMap[dateIso] || {};
            const visible     = SLOT_TYPES.filter(st => !st.weOnly || isWE);

            return (
              <div key={dateIso} style={{
                border: isToday ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius:'var(--r)',
                background: holidayName ? 'var(--holiday-stripe)' : isWE ? 'rgba(225,29,72,.03)' : 'var(--surface)',
                opacity: isThisMonth ? 1 : 0.3,
                padding:'6px 7px',
                minHeight: isWE ? 88 : 50,
              }}>
                <div style={{
                  fontSize:11, fontWeight: isToday ? 800 : 600, fontFamily:'sans-serif',
                  color: isToday ? 'var(--accent)' : isWE ? '#e11d48' : 'var(--text)',
                  marginBottom:4,
                }}>
                  {day.getDate()}
                  {holidayName && (
                    <span style={{ display:'block', fontSize:8, fontStyle:'italic', color:'#d97706',
                      fontWeight:500, lineHeight:1.2 }}>{holidayName}</span>
                  )}
                </div>
                {visible.map(st => (
                  <SlotChip
                    key={st.id}
                    slotType={st}
                    entry={slots[st.id]}
                    isSecretary={isSecretary}
                    onClick={() => setModal({ dateIso, typeAst:st.id, current:slots[st.id] })}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ))}

      {/* ── Récap ── */}
      <StatsSection astreintes={astreintes} monthLabel={`${MONTHS_FR[mo]} ${y}`} />

      {/* ── Modal ── */}
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
