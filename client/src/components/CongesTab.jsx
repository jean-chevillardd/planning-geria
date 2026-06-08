import { useState, useEffect, useRef, useMemo } from 'react';
import * as api from '../api';
import { toIso } from '../utils';

const TC = {
  'Congé annuel (CA)':     { color:'#2563eb', bg:'#eff6ff' },
  'RTT':                   { color:'#4f46e5', bg:'#eef2ff' },
  'Formation':             { color:'#059669', bg:'#ecfdf5' },
  'Activité hors site':    { color:'#d97706', bg:'#fffbeb' },
  'Congé maladie':         { color:'#e11d48', bg:'#fff1f2' },
  'Congé maternité':       { color:'#db2777', bg:'#fdf2f8' },
  'Récupération de garde': { color:'#ea580c', bg:'#fff7ed' },
};
const TC_DEF = { color:'#6a6860', bg:'#f4f3ef' };
function tc(type) { return TC[type] ?? TC_DEF; }

function countWorkingDays(d1, d2) {
  let n = 0;
  const end = new Date(d2 + 'T12:00:00');
  for (let d = new Date(d1 + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow > 0 && dow < 6) n++;
  }
  return n;
}

function fmtRange(d1, d2) {
  const opts = { day:'numeric', month:'short' };
  const f1 = new Date(d1 + 'T12:00:00').toLocaleDateString('fr-FR', opts);
  if (d1 === d2) return f1;
  return `${f1} → ${new Date(d2 + 'T12:00:00').toLocaleDateString('fr-FR', opts)}`;
}

function MedDropdown({ medecins, value, onChange }) {
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const selected = value ? medecins.find(m => m.id === value) : null;
  const q = search.trim().toLowerCase();
  const filtered = q ? medecins.filter(m => m.nom.toLowerCase().includes(q)) : medecins;

  function pick(m) {
    onChange(m.id);
    setSearch('');
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setSearch('');
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ display:'flex', alignItems:'center', gap:10 }}>
      <span style={{ fontSize:13, fontWeight:700, color:'var(--text2)', whiteSpace:'nowrap' }}>
        Je suis :
      </span>
      <div style={{ position:'relative', flex:1, maxWidth:280 }}>
        <input
          type="text"
          placeholder="Rechercher votre nom…"
          value={selected ? selected.nom : search}
          readOnly={!!selected}
          onChange={e => { if (!selected) { setSearch(e.target.value); setOpen(true); } }}
          onFocus={() => { if (!selected) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{
            width:'100%', height:32, padding:'0 28px 0 10px', boxSizing:'border-box',
            border:`1px solid ${selected ? 'var(--accent-mid)' : 'var(--border2)'}`,
            borderRadius:'var(--r)', fontSize:13, background: selected ? 'var(--accent-light)' : 'var(--surface)',
            color:'var(--text)', outline:'none',
          }}
        />
        {(selected || search) && (
          <button
            onMouseDown={e => { e.preventDefault(); clear(); }}
            style={{
              position:'absolute', right:6, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer',
              color:'var(--text3)', fontSize:16, lineHeight:1, padding:0,
            }}
          >×</button>
        )}
        {open && !selected && filtered.length > 0 && (
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
                  padding:'7px 12px', cursor:'pointer', fontSize:12,
                  borderBottom:'1px solid var(--border)',
                  color:'var(--text)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                {m.nom}
              </div>
            ))}
          </div>
        )}
        {open && !selected && q && filtered.length === 0 && (
          <div style={{
            position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:300,
            background:'var(--surface)', border:'1px solid var(--border2)',
            borderRadius:'var(--r)', padding:'8px 12px', fontSize:11, color:'var(--text3)',
          }}>
            Aucun résultat
          </div>
        )}
      </div>
    </div>
  );
}

function CCard({ abs }) {
  const { color } = tc(abs.type_abs);
  const days = countWorkingDays(abs.date_debut, abs.date_fin);
  const confirmed = abs.confirmed === 1;
  return (
    <div className="cg-card">
      <div className="cg-card-bar" style={{ background: color }} />
      <div className="cg-card-body">
        <div>
          <div className="cg-card-date">{fmtRange(abs.date_debut, abs.date_fin)}</div>
          <div className="cg-card-meta">{abs.type_abs} · {days} j. ouvré{days > 1 ? 's' : ''}</div>
        </div>
        <span style={{
          display:'inline-flex', alignItems:'center', height:20, padding:'0 8px',
          borderRadius:100, fontSize:10, fontWeight:700, lineHeight:1, whiteSpace:'nowrap',
          background: confirmed ? '#dcfce7' : '#fef9c3',
          color:      confirmed ? '#15803d' : '#a16207',
        }}>
          {confirmed ? 'Confirmé' : 'En attente'}
        </span>
      </div>
    </div>
  );
}

// ── DateRangePicker deux mois ────────────────────────────────

const MONTHS_FR_LONG = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DRP_DAYS_HDR = ['L','M','M','J','V','S','D'];

function daysInMonthGrid(year, month) {
  const first  = new Date(year, month, 1);
  const last   = new Date(year, month + 1, 0);
  const dow    = first.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  const cells  = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));
  return cells;
}

function DRPMonth({ year, month, start, end, hover, phase, onDayClick, onDayHover }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const cells = useMemo(() => daysInMonthGrid(year, month), [year, month]);
  const effEnd = phase === 'end' && hover && start ? (hover >= start ? hover : start) : end;

  return (
    <div>
      <div className="drp-month-hd">{MONTHS_FR_LONG[month].toUpperCase()} {year}</div>
      <div className="drp-grid">
        {DRP_DAYS_HDR.map((d, i) => (
          <div key={`h${i}`} className="drp-dj" style={{ color: i >= 5 ? 'var(--text3)' : 'var(--text2)' }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="drp-cell" />;
          const iso       = toIso(d);
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const isToday   = iso === today;
          const isStart   = iso === start;
          const isEnd     = !!effEnd && iso === effEnd;
          const inRange   = !!(start && effEnd && iso > start && iso < effEnd);
          const isSelected = isStart || isEnd;

          let cellBg = 'transparent';
          if (inRange) cellBg = 'var(--accent-light)';

          let dayBg     = 'transparent';
          let dayColor  = isWeekend ? 'var(--text3)' : 'var(--text)';
          let dayBorder = 'none';
          if (isSelected)     { dayBg = 'var(--accent)'; dayColor = '#fff'; }
          else if (isToday)   { dayBorder = '1.5px solid var(--accent)'; dayColor = 'var(--accent)'; }

          return (
            <div
              key={iso}
              className="drp-cell"
              style={{ background: cellBg, cursor: isWeekend ? 'default' : 'pointer' }}
              onClick={() => !isWeekend && onDayClick(iso)}
              onMouseEnter={() => !isWeekend && phase === 'end' && onDayHover(iso)}
              onMouseLeave={() => phase === 'end' && onDayHover(null)}
            >
              <span className="drp-day" style={{
                background: dayBg, color: dayColor, border: dayBorder,
                opacity: isWeekend ? .35 : 1,
                fontWeight: isToday ? 700 : 400,
              }}>
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DRP({ start, end, onChange }) {
  const now = new Date();
  const [baseYear,  setBaseYear]  = useState(now.getFullYear());
  const [baseMouth, setBaseMouth] = useState(now.getMonth());
  const [phase, setPhase] = useState('start');
  const [hover, setHover] = useState(null);

  const m2Year  = baseMouth === 11 ? baseYear + 1 : baseYear;
  const m2Month = baseMouth === 11 ? 0 : baseMouth + 1;

  function handleDayClick(iso) {
    if (phase === 'start' || (start && iso < start)) {
      onChange({ start: iso, end: null });
      setPhase('end');
      setHover(null);
    } else {
      onChange({ start, end: iso });
      setPhase('start');
      setHover(null);
    }
  }

  function prev() {
    if (baseMouth === 0) { setBaseYear(y => y - 1); setBaseMouth(11); }
    else setBaseMouth(m => m - 1);
  }
  function next() {
    if (baseMouth === 11) { setBaseYear(y => y + 1); setBaseMouth(0); }
    else setBaseMouth(m => m + 1);
  }

  return (
    <div className="drp-wrap">
      <div className="drp-nav">
        <button type="button" className="drp-nav-btn" onClick={prev}>‹</button>
        <span style={{ fontSize:11, color:'var(--accent)', fontWeight:600, userSelect:'none' }}>
          {phase === 'start' ? '① Date de début' : '② Date de fin'}
        </span>
        <button type="button" className="drp-nav-btn" onClick={next}>›</button>
      </div>
      <div className="drp-months">
        <DRPMonth
          year={baseYear} month={baseMouth}
          start={start} end={end} hover={hover} phase={phase}
          onDayClick={handleDayClick} onDayHover={setHover}
        />
        <div className="drp-divider" />
        <DRPMonth
          year={m2Year} month={m2Month}
          start={start} end={end} hover={hover} phase={phase}
          onDayClick={handleDayClick} onDayHover={setHover}
        />
      </div>
    </div>
  );
}

// ── Modal demande de congé ───────────────────────────────────

const CONGE_TYPES_MODAL = [
  'Congé annuel (CA)',
  'RTT',
  'Formation',
  'Activité hors site',
  'Autre',
];

function CongeModal({ medecin, onClose, onSent }) {
  const [range,   setRange]   = useState({ start: null, end: null });
  const [type,    setType]    = useState('Congé annuel (CA)');
  const [note,    setNote]    = useState('');
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);
  const [err,     setErr]     = useState(null);

  const isValid = !!range.start && !!range.end;
  const days    = isValid ? countWorkingDays(range.start, range.end) : 0;

  useEffect(() => {
    function h(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  async function handleSubmit() {
    if (!isValid) return;
    setSending(true); setErr(null);
    try {
      await api.createCongeRequest({
        medecin_id: medecin.id,
        date_debut: range.start,
        date_fin:   range.end,
        type,
        note: note || null,
      });
      setDone(true);
      onSent();
    } catch(e) {
      setErr(e.message || 'Erreur lors de l\'envoi');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        position:'fixed', inset:0, zIndex:1000,
        background:'rgba(0,0,0,.45)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background:'var(--surface)', borderRadius:'var(--rl)',
        boxShadow:'0 16px 48px rgba(0,0,0,.22)',
        width:500, maxWidth:'96vw', maxHeight:'92vh', overflowY:'auto',
      }}>
        {/* Header */}
        <div style={{
          padding:'12px 16px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <span style={{ fontWeight:700, fontSize:13 }}>Nouvelle demande de congé</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'var(--text3)', lineHeight:1 }}>×</button>
        </div>

        {done ? (
          /* ── Écran de confirmation ── */
          <div style={{ padding:'40px 24px', textAlign:'center' }}>
            <div style={{
              width:52, height:52, borderRadius:'50%',
              background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center',
              margin:'0 auto 14px', fontSize:24, color:'#16a34a',
            }}>✓</div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:8 }}>Demande envoyée</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:24 }}>
              Les gestionnaires ont été notifiés par mail.
            </div>
            <button className="btn-primary" onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <div style={{ padding:'16px 18px' }}>
            {/* ── DateRangePicker ── */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--text2)', marginBottom:8 }}>
                Période
              </div>
              <DRP start={range.start} end={range.end} onChange={setRange} />
              {isValid && (
                <div style={{ marginTop:6, fontSize:11, color:'var(--text2)' }}>
                  {days} j. ouvré{days > 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* ── Type ── */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--text2)', marginBottom:8 }}>
                Type d'absence
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {CONGE_TYPES_MODAL.map(t => {
                  const { color, bg } = tc(t);
                  const active = type === t;
                  return (
                    <button
                      key={t} type="button"
                      onClick={() => setType(t)}
                      style={{
                        padding:'5px 12px', fontSize:12, borderRadius:'var(--r)',
                        border: `1.5px solid ${active ? color : 'var(--border2)'}`,
                        background: active ? bg : 'var(--surface)',
                        color: active ? color : 'var(--text2)',
                        fontWeight: active ? 700 : 400,
                        cursor:'pointer', transition:'all .1s',
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Note ── */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--text2)', marginBottom:6 }}>
                Note <span style={{ fontWeight:400, textTransform:'none' }}>(optionnel)</span>
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Précision optionnelle…"
                rows={3}
                style={{
                  width:'100%', boxSizing:'border-box', padding:'8px 10px',
                  border:'1px solid var(--border2)', borderRadius:'var(--r)',
                  fontSize:12, color:'var(--text)', background:'var(--surface)',
                  resize:'vertical', fontFamily:'inherit',
                }}
              />
            </div>

            {err && (
              <div style={{ background:'var(--danger-bg)', color:'var(--danger)', border:'1px solid #fda4af', borderRadius:'var(--r)', padding:'7px 10px', fontSize:11, marginBottom:10 }}>
                {err}
              </div>
            )}

            <p style={{ fontSize:11, color:'var(--text3)', margin:'0 0 14px' }}>
              Un mail sera envoyé aux gestionnaires.
            </p>

            {/* ── Footer ── */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button type="button" className="btn-cancel" onClick={onClose}>Annuler</button>
              <button
                type="button"
                className="btn-primary"
                disabled={!isValid || sending}
                onClick={handleSubmit}
                style={{ height:32 }}
              >
                {sending ? '…' : 'Envoyer la demande'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers campagne ─────────────────────────────────────────

function fmtDateShort(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
}

function absStatus(abs) {
  if (abs._local === 'refused') return 'refused';
  if (abs._local === 'ok' || abs.confirmed === 1) return 'ok';
  return 'pending';
}

function memberGlobalStatus(absences) {
  if (!absences || absences.length === 0) return 'en_attente';
  const states = absences.map(a => absStatus(a));
  if (states.every(s => s === 'ok')) return 'tout_valide';
  if (states.some(s => s !== 'pending')) return 'a_repondu';
  return 'en_attente';
}

const STATUS_STYLE = {
  tout_valide: { bg:'#dcfce7', color:'#15803d', label:'Tout validé' },
  a_repondu:   { bg:'#dbeafe', color:'#1d4ed8', label:'Répondu' },
  en_attente:  { bg:'#fef9c3', color:'#a16207', label:'En attente' },
};

function AbsPill({ abs }) {
  const { color, bg } = tc(abs.type_abs);
  return (
    <span className="ab-pill" style={{ color, background: bg }}>
      {fmtDateShort(abs.date_debut)} · {abs.type_abs}
    </span>
  );
}

// ── EditModal ────────────────────────────────────────────────

function EditModal({ member, onClose, onSave }) {
  const [rows,   setRows]   = useState(() =>
    (member.absences || []).map(a => ({ ...a, _local: null }))
  );
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  const confirmed = rows.filter(r => absStatus(r) === 'ok').length;
  const total     = rows.length;

  useEffect(() => {
    function h(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  function setRowLocal(id, val) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, _local: val } : r));
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const r of rows) {
        const cur = absStatus(r);
        const was = r.confirmed === 1 ? 'ok' : 'pending';
        if (cur === 'ok' && was !== 'ok')       await api.confirmAbsence(r.id);
        if (cur === 'pending' && was === 'ok')   await api.unconfirmAbsence(r.id);
        if (cur === 'refused')                   await api.deleteAbsence(r.id);
      }
      onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background:'var(--surface)', borderRadius:'var(--rl)', boxShadow:'0 16px 48px rgba(0,0,0,.22)', width:480, maxWidth:'96vw', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:13 }}>{member.nom}</div>
            <div style={{ fontSize:11, color:'var(--text2)' }}>Campagne congés — détail des absences</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'var(--text3)' }}>×</button>
        </div>

        <div style={{ overflowY:'auto', flex:1, padding:'12px 16px' }}>
          {rows.length === 0 && <p className="empty-msg">Aucune absence soumise.</p>}
          {rows.map(r => {
            const s = absStatus(r);
            const stateColor = s === 'ok' ? '#15803d' : s === 'refused' ? '#dc2626' : '#a16207';
            const stateBg    = s === 'ok' ? '#dcfce7' : s === 'refused' ? '#fee2e2' : '#fef9c3';
            return (
              <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ flex:1 }}>
                  <AbsPill abs={r} />
                  <div style={{ fontSize:10, color:'var(--text3)', marginTop:3 }}>
                    {countWorkingDays(r.date_debut, r.date_fin)} j. ouvrés
                  </div>
                </div>
                <span style={{ display:'inline-flex', alignItems:'center', height:20, padding:'0 7px', borderRadius:100, fontSize:10, fontWeight:700, background:stateBg, color:stateColor, whiteSpace:'nowrap' }}>
                  {s === 'ok' ? 'Validé' : s === 'refused' ? 'Refusé' : 'En attente'}
                </span>
                <div style={{ display:'flex', gap:4 }}>
                  {s !== 'ok'      && <button className="btn-xs bsec" onClick={() => setRowLocal(r.id, 'ok')}>Valider</button>}
                  {s !== 'refused' && <button className="btn-xs bdanger" onClick={() => setRowLocal(r.id, 'refused')}>Refuser</button>}
                  {s !== 'pending' && <button className="btn-xs" onClick={() => setRowLocal(r.id, null)}>Remettre</button>}
                </div>
              </div>
            );
          })}

          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--text2)', marginBottom:6 }}>
              Note interne <span style={{ fontWeight:400, textTransform:'none' }}>(optionnel)</span>
            </div>
            <textarea
              value={note} onChange={e => setNote(e.target.value)}
              rows={2} placeholder="Note interne…"
              style={{ width:'100%', boxSizing:'border-box', padding:'7px 9px', border:'1px solid var(--border2)', borderRadius:'var(--r)', fontSize:12, fontFamily:'inherit', resize:'vertical', background:'var(--surface)' }}
            />
          </div>
        </div>

        <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, color:'var(--text2)' }}>
            <strong style={{ color: confirmed === total && total > 0 ? '#15803d' : 'var(--text)' }}>{confirmed}</strong>
            <span style={{ color:'var(--text3)' }}>/{total}</span> absences validées
          </span>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-cancel" onClick={onClose}>Annuler</button>
            <button className="btn-primary" style={{ height:30 }} disabled={saving} onClick={handleSave}>
              {saving ? '…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NewCampModal ─────────────────────────────────────────────

function NewCampModal({ medecins, onClose, onLaunched }) {
  const [selectedIds, setSelectedIds] = useState(() =>
    medecins.filter(m => ['ph','ipa','padhue'].includes(m.type) && m.email).map(m => m.id)
  );
  const [phase, setPhase] = useState('form'); // form | sending | done
  const [result, setResult] = useState(null);

  useEffect(() => {
    function h(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  function toggleId(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const canLaunch = selectedIds.length > 0 && phase === 'form';

  async function handleLaunch() {
    setPhase('sending');
    try {
      const data = await api.sendCampaignByIds(selectedIds, window.location.origin);
      setResult(data);
      setPhase('done');
      onLaunched();
    } catch(e) {
      setPhase('form');
    }
  }

  const MED_TYPE_LABELS = { ph:'PH', padhue:'PADHUE', ipa:'IPA', interne:'Internes', externe:'Externes' };
  const TYPE_ORDER = ['ph','padhue','ipa','interne','externe'];
  const byType = TYPE_ORDER.reduce((acc, t) => {
    const meds = medecins.filter(m => m.type === t);
    if (meds.length) acc.push({ type: t, meds });
    return acc;
  }, []);

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background:'var(--surface)', borderRadius:'var(--rl)', boxShadow:'0 16px 48px rgba(0,0,0,.22)', width:460, maxWidth:'96vw', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontWeight:700, fontSize:13 }}>Nouvelle campagne congés</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'var(--text3)' }}>×</button>
        </div>

        {phase === 'done' ? (
          <div style={{ padding:'40px 24px', textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:24, color:'#16a34a' }}>✓</div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:8 }}>Campagne créée</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:24 }}>
              {result?.sent ?? 0} praticien{(result?.sent ?? 0) > 1 ? 's' : ''} notifié{(result?.sent ?? 0) > 1 ? 's' : ''} par mail.
            </div>
            <button className="btn-primary" onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <>
            <div style={{ overflowY:'auto', flex:1, padding:'14px 16px' }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--text2)', marginBottom:10 }}>
                Praticiens inclus ({selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''})
              </div>
              {byType.map(({ type, meds }) => (
                <div key={type} style={{ marginBottom:10 }}>
                  <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--text3)', marginBottom:4 }}>
                    {MED_TYPE_LABELS[type] || type.toUpperCase()}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                    {meds.map(m => {
                      const checked = selectedIds.includes(m.id);
                      return (
                        <label key={m.id} style={{
                          display:'flex', alignItems:'center', gap:8, padding:'5px 8px',
                          borderRadius:'var(--r)', cursor:'pointer',
                          background: checked ? 'var(--accent-light)' : 'transparent',
                          border: `1px solid ${checked ? 'var(--accent-mid)' : 'transparent'}`,
                        }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleId(m.id)} style={{ accentColor:'var(--accent)' }} />
                          <span style={{ fontSize:12, fontWeight: checked ? 600 : 400 }}>{m.nom}</span>
                          {!m.email && <span style={{ fontSize:10, color:'var(--text3)', marginLeft:'auto' }}>sans email</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button className="btn-cancel" onClick={onClose}>Annuler</button>
              <button className="btn-primary" style={{ height:30 }} disabled={!canLaunch} onClick={handleLaunch}>
                {phase === 'sending' ? '…' : 'Lancer la campagne'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── DemandesPonctuelles ───────────────────────────────────────

function DemandesPonctuelles({ onToast }) {
  const [reqs,    setReqs]    = useState(null);
  const [acting,  setActing]  = useState(null);
  const [filter,  setFilter]  = useState('pending');

  function reload() {
    api.getCongeRequests(filter === 'all' ? undefined : filter)
      .then(setReqs)
      .catch(() => setReqs([]));
  }

  useEffect(() => { setReqs(null); reload(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(id, action) {
    setActing(id);
    try {
      if (action === 'accept') await api.acceptCongeRequest(id);
      else                      await api.refuseCongeRequest(id);
      onToast(action === 'accept' ? 'Demande acceptée' : 'Demande refusée');
      reload();
    } catch(e) {
      onToast(e.message || 'Erreur', 'err');
    } finally { setActing(null); }
  }

  const STATUT = {
    pending:  { label:'En attente', bg:'#fffbeb', color:'#b45309' },
    accepted: { label:'Acceptée',   bg:'#f0fdf4', color:'#15803d' },
    refused:  { label:'Refusée',    bg:'#fef2f2', color:'#dc2626' },
  };

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--rl)', boxShadow:'var(--sh)', overflow:'hidden', marginTop:16 }}>
      <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}>
        <span style={{ fontWeight:700, fontSize:13 }}>Demandes ponctuelles</span>
        <div style={{ display:'flex', gap:6 }}>
          {['pending','accepted','refused','all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding:'3px 10px', borderRadius:100, fontSize:11, fontWeight:600, cursor:'pointer', border:'none',
                background: filter === f ? 'var(--accent)' : 'var(--surface2)',
                color:      filter === f ? '#fff'          : 'var(--text2)',
              }}
            >
              {{ pending:'En attente', accepted:'Acceptées', refused:'Refusées', all:'Toutes' }[f]}
            </button>
          ))}
        </div>
      </div>

      {reqs === null && (
        <div style={{ padding:24, textAlign:'center', color:'var(--text3)', fontSize:12 }}>Chargement…</div>
      )}
      {reqs !== null && reqs.length === 0 && (
        <div style={{ padding:24, textAlign:'center', color:'var(--text3)', fontSize:12 }}>Aucune demande.</div>
      )}
      {reqs !== null && reqs.length > 0 && (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'var(--surface2)' }}>
                {['Praticien','Période','Type','Note','Statut','Actions'].map(h => (
                  <th key={h} style={{ padding:'7px 12px', textAlign:'left', fontWeight:600, color:'var(--text2)', fontSize:11, borderBottom:'1px solid var(--border2)', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reqs.map(r => {
                const { color: tc, bg: tbg } = (TC[r.type] || { color:'#6b7280', bg:'#f3f4f6' });
                const s = STATUT[r.statut] || STATUT.pending;
                return (
                  <tr key={r.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'8px 12px', fontWeight:500 }}>{r.medecin_nom}</td>
                    <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                      {fmtDateShort(r.date_debut)}{r.date_fin !== r.date_debut ? ` → ${fmtDateShort(r.date_fin)}` : ''}
                    </td>
                    <td style={{ padding:'8px 12px' }}>
                      <span className="ab-pill" style={{ color: tc, background: tbg }}>{r.type}</span>
                    </td>
                    <td style={{ padding:'8px 12px', color:'var(--text2)', fontStyle: r.note ? 'italic' : 'normal' }}>
                      {r.note || '—'}
                    </td>
                    <td style={{ padding:'8px 12px', textAlign:'center' }}>
                      <span style={{ display:'inline-flex', alignItems:'center', height:20, padding:'0 8px', borderRadius:100, fontSize:10, fontWeight:700, background:s.bg, color:s.color }}>{s.label}</span>
                    </td>
                    <td style={{ padding:'8px 12px' }}>
                      {r.statut === 'pending' ? (
                        <div style={{ display:'flex', gap:5 }}>
                          <button
                            className="btn-xs bsec"
                            disabled={acting === r.id}
                            onClick={() => act(r.id, 'accept')}
                          >
                            {acting === r.id ? '…' : 'Accepter'}
                          </button>
                          <button
                            className="btn-xs bdanger"
                            disabled={acting === r.id}
                            onClick={() => act(r.id, 'refuse')}
                          >
                            {acting === r.id ? '…' : 'Refuser'}
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize:11, color:'var(--text3)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── GestCampView ─────────────────────────────────────────────

function GestCampView({ medecins, onToast }) {
  const [campaign,   setCampaign]   = useState(undefined);
  const [acting,     setActing]     = useState(null);
  const [editMember, setEditMember] = useState(null);
  const [showNew,    setShowNew]    = useState(false);

  function reload() {
    api.getCampaignLatest()
      .then(setCampaign)
      .catch(() => setCampaign(null));
  }

  useEffect(() => { reload(); }, []);

  async function handleConfirmAll(medId) {
    setActing(medId);
    try {
      await api.confirmCampaignMember(medId);
      reload();
      onToast('Absences validées');
    } catch(e) {
      onToast(e.message || 'Erreur', 'err');
    } finally { setActing(null); }
  }

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--rl)', boxShadow:'var(--sh)', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}>
        <span style={{ fontWeight:700, fontSize:13 }}>Campagne congés</span>
        <button className="btn-primary" style={{ height:30, fontSize:12 }} onClick={() => setShowNew(true)}>
          ＋ Nouvelle campagne
        </button>
      </div>

      {campaign === undefined && (
        <div style={{ padding:24, textAlign:'center', color:'var(--text3)', fontSize:12 }}>Chargement…</div>
      )}
      {campaign === null && (
        <div style={{ padding:24, textAlign:'center', color:'var(--text3)', fontSize:12 }}>Aucune campagne en cours.</div>
      )}

      {campaign && (
        <>
          <div style={{ padding:'8px 16px', background:'var(--surface2)', borderBottom:'1px solid var(--border)', fontSize:11, color:'var(--text2)' }}>
            Envoyée le {new Date(campaign.created_at).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })}
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'var(--surface2)' }}>
                  {['Praticien','Absences soumises','Validées','Statut','Actions'].map(h => (
                    <th key={h} style={{ padding:'7px 12px', textAlign:'left', fontWeight:600, color:'var(--text2)', fontSize:11, borderBottom:'1px solid var(--border2)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaign.members.filter(m => m.status === 'responded').map(m => {
                  const abs  = m.absences || [];
                  const tot  = abs.length;
                  const v    = abs.filter(a => a.confirmed === 1).length;
                  const stat = memberGlobalStatus(abs);
                  const { bg, color, label } = STATUS_STYLE[stat];
                  return (
                    <tr key={m.med_id} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'8px 12px', fontWeight:500 }}>{m.nom}</td>
                      <td style={{ padding:'8px 12px' }}>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                          {abs.map(a => <AbsPill key={a.id} abs={a} />)}
                          {tot === 0 && <span style={{ fontSize:11, color:'var(--text3)' }}>—</span>}
                        </div>
                      </td>
                      <td style={{ padding:'8px 12px', textAlign:'center' }}>
                        <span style={{ fontWeight: v === tot && tot > 0 ? 700 : 400, color: v === tot && tot > 0 ? '#15803d' : 'var(--text)' }}>{v}</span>
                        <span style={{ color:'var(--text3)' }}>/{tot}</span>
                      </td>
                      <td style={{ padding:'8px 12px', textAlign:'center' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', height:20, padding:'0 8px', borderRadius:100, fontSize:10, fontWeight:700, background:bg, color }}>{label}</span>
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        <div style={{ display:'flex', gap:5 }}>
                          <button
                            className="btn-xs bsec"
                            disabled={stat === 'tout_valide' || tot === 0 || acting === m.med_id}
                            onClick={() => handleConfirmAll(m.med_id)}
                          >
                            {acting === m.med_id ? '…' : 'Valider tout'}
                          </button>
                          <button className="btn-xs" onClick={() => setEditMember(m)}>
                            Modifier
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editMember && (
        <EditModal
          member={editMember}
          onClose={() => setEditMember(null)}
          onSave={() => { setEditMember(null); reload(); }}
        />
      )}
      {showNew && (
        <NewCampModal
          medecins={medecins}
          onClose={() => setShowNew(false)}
          onLaunched={() => { setShowNew(false); reload(); }}
        />
      )}
    </div>
  );
}

export default function CongesTab({ medecins, isGestionnaire }) {
  const [selectedMedId, setSelectedMedId] = useState(null);
  const [conges,        setConges]        = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [showModal,     setShowModal]     = useState(false);

  const selectedMed = useMemo(
    () => medecins.find(m => m.id === selectedMedId) ?? null,
    [medecins, selectedMedId]
  );

  function loadConges(medId) {
    setLoading(true);
    api.getMesConges(medId)
      .then(setConges)
      .catch(() => setConges([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!selectedMedId) { setConges([]); return; }
    loadConges(selectedMedId);
  }, [selectedMedId]);

  const hasSelection = !!selectedMedId;

  return (
    <div>
      <div className="sec-t" style={{ marginBottom:14 }}>Congés</div>

      {/* ── Vue médecin ── */}
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:'var(--rl)', padding:'14px 16px', marginBottom:16, boxShadow:'var(--sh)',
      }}>
        <MedDropdown medecins={medecins} value={selectedMedId} onChange={setSelectedMedId} />

        {!hasSelection && (
          <p style={{ margin:'10px 0 0', fontSize:12, color:'var(--text3)' }}>
            Sélectionnez votre nom pour voir vos congés.
          </p>
        )}

        <div style={{
          opacity: hasSelection ? 1 : .28,
          pointerEvents: hasSelection ? 'auto' : 'none',
          transition:'opacity .15s',
          marginTop:14,
        }}>
          <div style={{
            fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em',
            color:'var(--text2)', marginBottom:8,
          }}>
            Mes congés à venir
          </div>

          {loading ? (
            <p style={{ fontSize:12, color:'var(--text3)' }}>Chargement…</p>
          ) : conges.length === 0 ? (
            <p className="empty-msg">Aucun congé à venir.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
              {conges.map(abs => <CCard key={abs.id} abs={abs} />)}
            </div>
          )}

          <button
            className="btn-primary"
            style={{ marginTop: conges.length > 0 ? 0 : 8, height:32, fontSize:12 }}
            onClick={() => setShowModal(true)}
          >
            ＋ Demander un congé
          </button>
        </div>
      </div>

      {/* ── Vue gestionnaire ── */}
      {isGestionnaire && (
        <>
          <GestCampView medecins={medecins} onToast={() => {}} />
          <DemandesPonctuelles onToast={() => {}} />
        </>
      )}

      {/* ── Modal demande de congé ── */}
      {showModal && selectedMed && (
        <CongeModal
          medecin={selectedMed}
          onClose={() => setShowModal(false)}
          onSent={() => loadConges(selectedMedId)}
        />
      )}
    </div>
  );
}
