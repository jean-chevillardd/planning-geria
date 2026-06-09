import { useState, useEffect, useMemo } from 'react';
import * as api from '../api';

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

function fmtDateShort(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
}

// ── Sélecteur identité — <select> natif ─────────────────────

function IdentitySelect({ medecins, value, onChange }) {
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'var(--rl)', boxShadow:'var(--sh)',
      padding:'12px 14px', marginBottom:14,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, fontWeight:700, color:'var(--text2)', whiteSpace:'nowrap' }}>Je suis :</span>
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          style={{
            flex:1, minWidth:140, height:30, padding:'0 28px 0 10px',
            border:'1px solid var(--border2)', borderRadius:'var(--r)',
            background:'var(--surface)',
            fontSize:12, fontFamily:'inherit', color:'var(--text)',
            cursor:'pointer', outline:'none', appearance:'none',
            backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236a6860' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center',
          }}
        >
          <option value="">— Sélectionnez votre nom —</option>
          {medecins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
        </select>
      </div>
      <div style={{ fontSize:10, color:'var(--text3)', marginTop:4, fontStyle:'italic' }}>
        Votre sélection n'est pas mémorisée — rechoisissez à chaque visite.
      </div>
    </div>
  );
}

// ── Carte congé médecin ──────────────────────────────────────

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

// ── Modal demande de congé — simplifiée ─────────────────────

const CONGE_TYPES_MODAL = [
  'Congé annuel (CA)',
  'RTT',
  'Formation',
  'Activité hors site',
  'Congé maladie',
  'Congé maternité',
  'Récupération de garde',
  'Autre',
];

function CongeModal({ medecin, onClose, onSent }) {
  const today = new Date().toISOString().slice(0, 10);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin,   setDateFin]   = useState('');
  const [type,      setType]      = useState('Congé annuel (CA)');
  const [note,      setNote]      = useState('');
  const [sending,   setSending]   = useState(false);
  const [done,      setDone]      = useState(false);
  const [err,       setErr]       = useState(null);

  const isValid = !!dateDebut && !!dateFin && dateFin >= dateDebut;
  const days    = isValid ? countWorkingDays(dateDebut, dateFin) : 0;

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
        date_debut: dateDebut,
        date_fin:   dateFin,
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

  const inputStyle = {
    height:30, padding:'0 8px', border:'1px solid var(--border2)',
    borderRadius:'var(--r)', fontSize:12, fontFamily:'inherit',
    background:'var(--surface)', color:'var(--text)', width:'100%', boxSizing:'border-box',
  };
  const labelStyle = {
    display:'block', fontSize:10, fontWeight:700, letterSpacing:'.05em',
    textTransform:'uppercase', color:'var(--text2)', marginBottom:5,
  };

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background:'var(--surface)', borderRadius:'var(--rl)', boxShadow:'0 16px 48px rgba(0,0,0,.22)', width:340, maxWidth:'calc(100vw - 32px)', padding:20 }}>
        {done ? (
          <div style={{ textAlign:'center', padding:'24px 0' }}>
            <div style={{ width:48, height:48, borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:22, color:'#16a34a' }}>✓</div>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:8 }}>Demande envoyée</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginBottom:20 }}>Les gestionnaires ont été notifiés par mail.</div>
            <button className="btn-cancel" onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:16, paddingBottom:12, borderBottom:'1px solid var(--border)' }}>
              Nouvelle demande de congé
            </div>

            {/* Période */}
            <div style={{ marginBottom:12 }}>
              <label style={labelStyle}>Période</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:6, alignItems:'center' }}>
                <input
                  type="date" min={today} value={dateDebut}
                  onChange={e => { setDateDebut(e.target.value); if (dateFin && e.target.value > dateFin) setDateFin(''); }}
                  style={inputStyle}
                />
                <span style={{ fontSize:14, color:'var(--text3)', textAlign:'center' }}>→</span>
                <input
                  type="date" min={dateDebut || today} value={dateFin}
                  onChange={e => setDateFin(e.target.value)}
                  style={inputStyle}
                />
              </div>
              {isValid && (
                <div style={{ marginTop:5, fontSize:11, color:'var(--text2)' }}>
                  {days} j. ouvré{days > 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Type */}
            <div style={{ marginBottom:12 }}>
              <label style={labelStyle}>Type</label>
              <select
                value={type} onChange={e => setType(e.target.value)}
                style={{ ...inputStyle, height:30, padding:'0 10px', cursor:'pointer' }}
              >
                {CONGE_TYPES_MODAL.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Note */}
            <div style={{ marginBottom:12 }}>
              <label style={labelStyle}>
                Précision <span style={{ fontWeight:400, textTransform:'none' }}>(facultatif)</span>
              </label>
              <textarea
                value={note} onChange={e => setNote(e.target.value)}
                rows={2} placeholder="Précision optionnelle…"
                style={{ width:'100%', boxSizing:'border-box', padding:'8px 10px', border:'1px solid var(--border2)', borderRadius:'var(--r)', fontSize:12, fontFamily:'inherit', background:'var(--surface)', color:'var(--text)', resize:'none' }}
              />
            </div>

            {err && (
              <div style={{ background:'var(--danger-bg)', color:'var(--danger)', border:'1px solid #fda4af', borderRadius:'var(--r)', padding:'7px 10px', fontSize:11, marginBottom:10 }}>
                {err}
              </div>
            )}

            <div style={{ fontSize:10, color:'var(--text3)', fontStyle:'italic', textAlign:'center', marginBottom:12 }}>
              Un mail sera envoyé aux gestionnaires.
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, paddingTop:12, borderTop:'1px solid var(--border)' }}>
              <button className="btn-cancel" onClick={onClose}>Annuler</button>
              <button className="btn-primary" disabled={!isValid || sending} onClick={handleSubmit}>
                {sending ? '…' : 'Envoyer la demande'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Helpers campagne ─────────────────────────────────────────

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
                  {s !== 'ok'      && <button className="btn-xs btn-ok"     onClick={() => setRowLocal(r.id, 'ok')}>Valider</button>}
                  {s !== 'refused' && <button className="btn-xs btn-danger" onClick={() => setRowLocal(r.id, 'refused')}>Refuser</button>}
                  {s !== 'pending' && <button className="btn-xs"         onClick={() => setRowLocal(r.id, null)}>Remettre</button>}
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
            <button className="btn-ok" disabled={saving} onClick={handleSave}>
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
  const [phase,  setPhase]  = useState('form');
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
            <button className="btn-cancel" onClick={onClose}>Fermer</button>
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
              <button className="btn-primary" disabled={!canLaunch} onClick={handleLaunch}>
                {phase === 'sending' ? '…' : 'Lancer la campagne'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── DemandesPonctuelles — liste style mockup ─────────────────

function DemandesPonctuelles({ onToast }) {
  const [reqs,   setReqs]   = useState(null);
  const [acting, setActing] = useState(null);

  function reload() {
    api.getCongeRequests()
      .then(setReqs)
      .catch(() => setReqs([]));
  }

  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const pending = (reqs || []).filter(r => r.statut === 'pending');
  const others  = (reqs || []).filter(r => r.statut !== 'pending');
  const nbPend  = pending.length;

  return (
    <div className="ponctuel-section">
      <div className="ponctuel-hdr">
        <span style={{ fontWeight:700, fontSize:13, color:'#7c3aed' }}>Demandes ponctuelles</span>
        {nbPend > 0 && (
          <span className="ponctuel-badge">{nbPend} en attente</span>
        )}
      </div>

      {reqs === null && (
        <div style={{ padding:'14px', fontSize:12, color:'var(--text3)' }}>Chargement…</div>
      )}
      {reqs !== null && reqs.length === 0 && (
        <div style={{ padding:'20px 14px', fontSize:12, color:'var(--text3)', textAlign:'center' }}>Aucune demande.</div>
      )}

      {reqs !== null && reqs.length > 0 && (
        <div className="ponctuel-list">
          {pending.map(r => {
            const days = countWorkingDays(r.date_debut, r.date_fin);
            return (
              <div key={r.id} className="ponctuel-row">
                <div className="ponctuel-dot" />
                <div className="ponctuel-info">
                  <div><strong>{r.medecin_nom}</strong> — {r.type}</div>
                  <div className="ponctuel-meta">
                    {fmtDateShort(r.date_debut)}{r.date_fin !== r.date_debut ? ` → ${fmtDateShort(r.date_fin)}` : ''} · {days} j. ouvré{days > 1 ? 's' : ''}
                    {r.note && <> · <em>{r.note}</em></>}
                  </div>
                </div>
                <div className="ponctuel-actions">
                  <button className="btn-xs btn-ok" disabled={acting === r.id} onClick={() => act(r.id, 'accept')}>
                    {acting === r.id ? '…' : 'Valider'}
                  </button>
                  <button className="btn-xs btn-danger" disabled={acting === r.id} onClick={() => act(r.id, 'refuse')}>
                    {acting === r.id ? '…' : 'Refuser'}
                  </button>
                </div>
              </div>
            );
          })}

          {others.map(r => {
            const isOk = r.statut === 'accepted';
            return (
              <div key={r.id} className="ponctuel-row" style={{ opacity:.65 }}>
                <div className="ponctuel-dot" style={{ background: isOk ? 'var(--ok)' : 'var(--danger)' }} />
                <div className="ponctuel-info" style={{ color:'var(--text3)' }}>
                  {r.medecin_nom} — {r.type} · {fmtDateShort(r.date_debut)}{r.date_fin !== r.date_debut ? ` → ${fmtDateShort(r.date_fin)}` : ''} · {isOk ? 'validée' : 'refusée'}
                </div>
              </div>
            );
          })}
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
      <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}>
        <span style={{ fontWeight:700, fontSize:13 }}>Campagne congés</span>
        <button className="btn-primary" onClick={() => setShowNew(true)}>
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
                            className="btn-xs btn-ok"
                            disabled={stat === 'tout_valide' || tot === 0 || acting === m.med_id}
                            onClick={() => handleConfirmAll(m.med_id)}
                          >
                            {acting === m.med_id ? '…' : 'Valider tout'}
                          </button>
                          <button className="btn-xs" onClick={() => setEditMember(m)}>Modifier</button>
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

// ── CongesTab ────────────────────────────────────────────────

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

  return (
    <div>
      <div className="sec-t" style={{ marginBottom:14 }}>Congés</div>

      {/* ── Vue médecin (masquée pour les gestionnaires) ── */}
      {!isGestionnaire && (
        <>
          <IdentitySelect medecins={medecins} value={selectedMedId} onChange={setSelectedMedId} />

          {!selectedMedId ? (
            <div className="conge-placeholder">
              Sélectionnez votre nom ci-dessus pour voir vos congés à venir.
            </div>
          ) : (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--rl)', padding:'14px 16px', boxShadow:'var(--sh)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--text2)' }}>
                  Congés à venir
                </span>
                {!loading && conges.length > 0 && (
                  <span style={{ fontSize:10, color:'var(--text3)' }}>
                    {conges.length} congé{conges.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {loading ? (
                <p style={{ fontSize:12, color:'var(--text3)', margin:'0 0 14px' }}>Chargement…</p>
              ) : conges.length === 0 ? (
                <p className="empty-msg" style={{ marginBottom:14 }}>Aucun congé à venir.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
                  {conges.map(abs => <CCard key={abs.id} abs={abs} />)}
                </div>
              )}

              <button
                className="btn-primary"
                style={{ width:'100%', justifyContent:'center' }}
                onClick={() => setShowModal(true)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                Demander un congé
              </button>
            </div>
          )}
        </>
      )}

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
