// App.jsx — PATCHED: emoji removed from tabs, header refreshed, palette updated
import { useState, useCallback, useRef, useEffect } from 'react';
import { getMonday, toIso, addDays } from './utils';
import { useBaseData, usePlanning } from './hooks/useData';
import * as api from './api';

import WeekNav      from './components/WeekNav';
import PlanningGrid from './components/PlanningGrid';
import AssignModal  from './components/AssignModal';
import TeamTab      from './components/TeamTab';
import AbsencesTab  from './components/AbsencesTab';
import StatsTab     from './components/StatsTab';
import MonthView    from './components/MonthView';

// ── Tab definitions — no emoji, SVG icons ──────────────────
const TAB_ICONS = {
  planning: (active) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? '#2272f0' : '#c8c5bc'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="12" height="11" rx="1.5"/>
      <path d="M1 5.5h12"/><path d="M4.5 1v3M9.5 1v3"/>
      <path d="M4 8.5h1.2M6.9 8.5h1.2M9.8 8.5h1.2"/>
    </svg>
  ),
  mois: (active) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? '#2272f0' : '#c8c5bc'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="12" height="11" rx="1.5"/>
      <path d="M1 5.5h12"/><path d="M4.5 1v3M9.5 1v3"/>
      <path d="M3.5 8.5h1M6.5 8.5h1M9.5 8.5h1M3.5 11h1M6.5 11h1"/>
    </svg>
  ),
  equipe: (active) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? '#2272f0' : '#c8c5bc'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="5" r="2.2"/>
      <path d="M1 13c0-2.2 1.8-4 4-4s4 1.8 4 4"/>
      <circle cx="10.5" cy="4.5" r="1.8"/>
      <path d="M12.8 13c0-1.9-1.5-3.5-3.3-3.5"/>
    </svg>
  ),
  absences: (active) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? '#2272f0' : '#c8c5bc'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="12" height="11" rx="1.5"/>
      <path d="M1 5.5h12"/><path d="M4.5 1v3M9.5 1v3"/>
      <path d="M4.5 9.5h5"/>
    </svg>
  ),
  stats: (active) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? '#2272f0' : '#c8c5bc'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12V7.5M5.5 12V4.5M9 12V6.5M12.5 12V2.5"/>
      <path d="M1 12h12"/>
    </svg>
  ),
};

const TABS = [
  { id:'planning', label:'Planning' },
  { id:'mois',     label:'Vue mensuelle' },
  { id:'equipe',   label:'Équipe' },
  { id:'absences', label:'Absences' },
  { id:'stats',    label:'Synthèse' },
];

const SESSION_KEY = 'secretary_key';

// ── Lock/Unlock SVG icon ───────────────────────────────────
function LockIcon({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="10" height="7" rx="2"/>
      {open
        ? <path d="M4.5 6V4a2.5 2.5 0 0 1 4.5-1.5"/>
        : <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6"/>}
    </svg>
  );
}

// ── Modal saisie mot de passe ──────────────────────────────
function PasswordModal({ onClose, onSuccess }) {
  const [pwd,   setPwd]   = useState('');
  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    function h(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!pwd.trim()) return;
    setBusy(true); setError('');
    try {
      await api.checkPassword(pwd);
      onSuccess(pwd);
    } catch {
      setError('Mot de passe incorrect.');
      setPwd('');
      inputRef.current?.focus();
    } finally { setBusy(false); }
  }

  return (
    <div className="mbg open" onClick={e => e.target.classList.contains('mbg') && onClose()}>
      <div className="mbox" style={{ width:320, maxHeight:'none', padding:'1.5rem' }}>
        <div className="mhead">
          <div className="mttl">Accès secrétariat</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <p style={{ fontSize:11, fontFamily:'system-ui,sans-serif', color:'var(--text2)', margin:'6px 0 14px', lineHeight:1.6 }}>
          Entrez le mot de passe pour activer les modifications.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Mot de passe</label>
            <input ref={inputRef} type="password" value={pwd}
              onChange={e => { setPwd(e.target.value); setError(''); }}
              placeholder="••••••••" autoComplete="current-password" />
          </div>
          {error && <p style={{ fontSize:11, fontFamily:'system-ui,sans-serif', color:'var(--danger)', marginBottom:10 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={busy || !pwd.trim()}>
              {busy ? '…' : 'Déverrouiller'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Bouton cadenas header ──────────────────────────────────
function LockButton({ isSecretary, onLock, onUnlock }) {
  return (
    <button
      onClick={isSecretary ? onLock : onUnlock}
      title={isSecretary ? 'Mode secrétariat actif — cliquer pour verrouiller' : 'Accès secrétariat'}
      style={{
        display:'flex', alignItems:'center', gap:6,
        background: isSecretary ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.1)',
        border: isSecretary ? '1px solid rgba(255,255,255,.4)' : '1px solid rgba(255,255,255,.2)',
        borderRadius:20, padding:'4px 12px 4px 10px', cursor:'pointer', color:'#fff',
        fontSize:10, fontFamily:'system-ui,-apple-system,sans-serif', fontWeight:600,
        letterSpacing:'.02em', transition:'all .15s',
      }}
    >
      <LockIcon open={isSecretary} />
      <span style={{ opacity: isSecretary ? 1 : 0.65 }}>
        {isSecretary ? 'Secrétariat' : 'Lecture seule'}
      </span>
    </button>
  );
}

// ── App principale ─────────────────────────────────────────
export default function App() {
  const [tab,         setTab]      = useState('planning');
  const [monday,      setMonday]   = useState(() => getMonday(new Date()));
  const [modal,       setModal]    = useState(null);
  const [toasts,      setToasts]   = useState([]);
  const [isSecretary, setIsSecretary] = useState(false);
  const [pwdModal,    setPwdModal] = useState(false);
  const toastId = useRef(0);
  const weekKey = toIso(monday);

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) { api.setSecretaryKey(saved); setIsSecretary(true); }
  }, []);

  const { medecins, absences, loading: baseLoading, error: baseError, reload: reloadBase } = useBaseData();
  const { data: planningData, loading: planLoading, reload: reloadPlan } = usePlanning(weekKey);
  const reload = useCallback(() => { reloadBase(); reloadPlan(); }, [reloadBase, reloadPlan]);

  function showToast(msg, type = 'ok') {
    const id = ++toastId.current;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800);
  }

  function handleUnlock(password) {
    api.setSecretaryKey(password);
    sessionStorage.setItem(SESSION_KEY, password);
    setIsSecretary(true); setPwdModal(false);
    showToast('Mode secrétariat activé');
  }

  function handleLock() {
    api.setSecretaryKey(''); sessionStorage.removeItem(SESSION_KEY);
    setIsSecretary(false); setModal(null);
    showToast('Planning verrouillé');
  }

  async function handleAction(type, payload) {
    try {
      switch (type) {
        case 'add_affectation':  await api.addAffectation(payload);   break;
        case 'del_affectation':  await api.deleteAffectation(payload); break;
        case 'add_exclusion':    await api.addExclusion(payload);     break;
        case 'del_exclusion':    await api.deleteExclusion(payload);  break;
        case 'add_extra':        await api.addExtra(payload);         break;
        case 'del_extra':        await api.deleteExtra(payload);      break;
        default: console.warn('Action inconnue:', type);
      }
      setModal(null); reloadPlan(); showToast('Enregistré');
    } catch(e) { showToast(e.message || "Erreur lors de l'enregistrement", 'err'); }
  }

  async function handleCopyWeek() {
    const prevKey = toIso(addDays(monday, -7));
    if (!confirm('Copier les affectations de la semaine précédente ? Les affectations actuelles seront écrasées.')) return;
    try { await api.copyWeek(prevKey, weekKey); reloadPlan(); showToast('Semaine copiée'); }
    catch(e) { showToast(e.message || 'Erreur lors de la copie', 'err'); }
  }

  if (baseLoading && medecins.length === 0)
    return <div style={{ padding:'2rem', fontFamily:'system-ui,sans-serif', color:'var(--text2)' }}>Chargement…</div>;
  if (baseError)
    return <div style={{ padding:'2rem', fontFamily:'system-ui,sans-serif', color:'var(--danger)' }}>Erreur : {baseError}</div>;

  return (
    <>
      {/* ── Header ── */}
      <div className="hdr" style={{
        background: isSecretary
          ? 'linear-gradient(135deg,#1858c8,#2272f0)'
          : '#1858c8',
      }}>
        <div className="hdr-l">
          <span className="hdr-logo">CHU</span>
          <span className="hdr-div"></span>
          <span className="hdr-title">
            <span className="hdr-title-strong">Planning</span>
            <span className="hdr-title-light">Pôle Gériatrie</span>
          </span>
        </div>
        <div className="hdr-r">
          <span>{planLoading ? 'Chargement…' : `Semaine ${weekKey}`}</span>
          <LockButton isSecretary={isSecretary} onLock={handleLock} onUnlock={() => setPwdModal(true)} />
        </div>
      </div>

      <div className="main">
        {/* ── Tabs ── */}
        <div className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={`tab${tab===t.id?' active':''}`} onClick={() => setTab(t.id)}>
              {TAB_ICONS[t.id](tab === t.id)}
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Planning ── */}
        {tab === 'planning' && (
          <>
            <div className="print-hide">
              <WeekNav monday={monday} onChange={setMonday} onCopy={handleCopyWeek}
                onGoToday={() => setMonday(getMonday(new Date()))} isSecretary={isSecretary} />
            </div>
            {planLoading && !planningData && (
              <div style={{ fontFamily:'system-ui,sans-serif', fontSize:12, color:'var(--text2)', padding:'1rem 0' }}>
                Chargement du planning…
              </div>
            )}
            {planningData && (
              <div style={{ opacity: planLoading ? 0.55 : 1, transition:'opacity .15s', pointerEvents: planLoading ? 'none' : undefined }}>
                <PlanningGrid monday={monday} planningData={planningData} absences={absences}
                  medecins={medecins} isSecretary={isSecretary}
                  onCellClick={(poste, dayIso) => isSecretary && setModal({ poste, dayIso })} />
              </div>
            )}
          </>
        )}
        {tab === 'mois'     && <MonthView medecins={medecins} absences={absences} />}
        {tab === 'equipe'   && <TeamTab medecins={medecins} isSecretary={isSecretary} onReload={reloadBase} onToast={showToast} />}
        {tab === 'absences' && <AbsencesTab medecins={medecins} absences={absences} isSecretary={isSecretary} onReload={reloadBase} onToast={showToast} />}
        {tab === 'stats'    && <StatsTab medecins={medecins} />}

        <div className="foot">Pôle Gériatrie — Planning interne · Base de données SQLite</div>
      </div>

      {/* ── Toasts ── */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'ok' ? '✓' : '⚠'} {t.msg}
          </div>
        ))}
      </div>

      {modal && isSecretary && (
        <AssignModal poste={modal.poste} dayIso={modal.dayIso} monday={monday}
          planningData={planningData} medecins={medecins} absences={absences}
          onClose={() => setModal(null)} onAction={handleAction} />
      )}
      {pwdModal && <PasswordModal onClose={() => setPwdModal(false)} onSuccess={handleUnlock} />}
    </>
  );
}
