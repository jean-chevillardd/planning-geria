// App.jsx
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

const TABS = [
  { id:'planning', label:'📅 Planning' },
  { id:'mois',     label:'📆 Vue mensuelle' },
  { id:'equipe',   label:'👥 Équipe' },
  { id:'absences', label:'🏖 Absences' },
  { id:'stats',    label:'📊 Synthèse' },
];

const SESSION_KEY = 'secretary_key';

// ── Modal saisie mot de passe ──────────────────────────
function PasswordModal({ onClose, onSuccess }) {
  const [pwd,   setPwd]   = useState('');
  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Esc → fermer
  useEffect(() => {
    function h(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!pwd.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.checkPassword(pwd);
      onSuccess(pwd);
    } catch {
      setError('Mot de passe incorrect.');
      setPwd('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mbg open" onClick={e => e.target.classList.contains('mbg') && onClose()}>
      <div className="mbox" style={{ width:320, maxHeight:'none', padding:'1.5rem' }}>
        <div className="mhead">
          <div className="mttl">Accès secrétariat</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <p style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--text2)', margin:'6px 0 14px', lineHeight:1.6 }}>
          Entrez le mot de passe pour activer les modifications.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Mot de passe</label>
            <input
              ref={inputRef}
              type="password"
              value={pwd}
              onChange={e => { setPwd(e.target.value); setError(''); }}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--danger)', marginBottom:10 }}>
              {error}
            </p>
          )}
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

// ── Bouton cadenas header ──────────────────────────────
function LockButton({ isSecretary, onLock, onUnlock }) {
  return (
    <button
      onClick={isSecretary ? onLock : onUnlock}
      title={isSecretary ? 'Mode secrétariat actif — cliquer pour verrouiller' : 'Accès secrétariat'}
      style={{
        display:'flex', alignItems:'center', gap:5,
        background: isSecretary ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.08)',
        border: isSecretary ? '1px solid rgba(255,255,255,.35)' : '1px solid rgba(255,255,255,.2)',
        borderRadius:20,
        padding:'3px 10px 3px 8px',
        cursor:'pointer',
        color:'#fff',
        fontSize:10,
        fontFamily:'Trebuchet MS,sans-serif',
        fontWeight:700,
        letterSpacing:'.04em',
        transition:'all .15s',
      }}
    >
      <span style={{ fontSize:13 }}>{isSecretary ? '🔓' : '🔒'}</span>
      <span style={{ opacity: isSecretary ? 1 : 0.7 }}>
        {isSecretary ? 'Secrétariat' : 'Lecture seule'}
      </span>
    </button>
  );
}

// ── App principale ─────────────────────────────────────
export default function App() {
  const [tab,        setTab]      = useState('planning');
  const [monday,     setMonday]   = useState(() => getMonday(new Date()));
  const [modal,      setModal]    = useState(null); // { poste, dayIso }
  const [toasts,     setToasts]   = useState([]);
  const [isSecretary, setIsSecretary] = useState(false);
  const [pwdModal,   setPwdModal] = useState(false);
  const toastId = useRef(0);

  const weekKey = toIso(monday);

  // Restaurer la session secrétariat depuis sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      api.setSecretaryKey(saved);
      setIsSecretary(true);
    }
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
    setIsSecretary(true);
    setPwdModal(false);
    showToast('Mode secrétariat activé');
  }

  function handleLock() {
    api.setSecretaryKey('');
    sessionStorage.removeItem(SESSION_KEY);
    setIsSecretary(false);
    setModal(null);
    showToast('Planning verrouillé');
  }

  // ── Actions planning (depuis AssignModal) ──────────────
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
      setModal(null);
      reloadPlan();
      showToast('Enregistré');
    } catch(e) {
      showToast(e.message || 'Erreur lors de l\'enregistrement', 'err');
    }
  }

  async function handleCopyWeek() {
    const prevKey = toIso(addDays(monday, -7));
    if (!confirm('Copier les affectations de la semaine précédente ? Les affectations actuelles seront écrasées.')) return;
    try {
      await api.copyWeek(prevKey, weekKey);
      reloadPlan();
      showToast('Semaine copiée');
    } catch(e) {
      showToast(e.message || 'Erreur lors de la copie', 'err');
    }
  }

  if (baseLoading && medecins.length === 0) return <div style={{ padding:'2rem', fontFamily:'sans-serif', color:'var(--text2)' }}>Chargement…</div>;
  if (baseError)   return <div style={{ padding:'2rem', fontFamily:'sans-serif', color:'var(--danger)' }}>Erreur : {baseError}</div>;

  return (
    <>
      {/* ── Header ── */}
      <div className="hdr">
        <div className="hdr-l">
          <span className="hdr-logo">CHU</span>
          <span className="hdr-title">Planning — Pôle Gériatrie</span>
        </div>
        <div className="hdr-r">
          <span>{planLoading ? 'Chargement…' : `Semaine ${weekKey}`}</span>
          <LockButton
            isSecretary={isSecretary}
            onLock={handleLock}
            onUnlock={() => setPwdModal(true)}
          />
        </div>
      </div>

      <div className="main">
        {/* ── Tabs ── */}
        <div className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={`tab${tab===t.id?' active':''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Planning ── */}
        {tab === 'planning' && (
          <>
            <div className="print-hide">
              <WeekNav
                monday={monday}
                onChange={setMonday}
                onCopy={handleCopyWeek}
                onGoToday={() => setMonday(getMonday(new Date()))}
                isSecretary={isSecretary}
              />
            </div>
            {planLoading && !planningData && (
              <div style={{ fontFamily:'sans-serif', fontSize:12, color:'var(--text2)', padding:'1rem 0' }}>
                Chargement du planning…
              </div>
            )}
            {planningData && (
              <div style={{ opacity: planLoading ? 0.55 : 1, transition: 'opacity .15s', pointerEvents: planLoading ? 'none' : undefined }}>
                <PlanningGrid
                  monday={monday}
                  planningData={planningData}
                  absences={absences}
                  medecins={medecins}
                  isSecretary={isSecretary}
                  onCellClick={(poste, dayIso) => isSecretary && setModal({ poste, dayIso })}
                />
              </div>
            )}
          </>
        )}

        {/* ── Vue mensuelle ── */}
        {tab === 'mois' && (
          <MonthView medecins={medecins} absences={absences} />
        )}

        {/* ── Équipe ── */}
        {tab === 'equipe' && (
          <TeamTab medecins={medecins} isSecretary={isSecretary} onReload={reloadBase} onToast={showToast} />
        )}

        {/* ── Absences ── */}
        {tab === 'absences' && (
          <AbsencesTab medecins={medecins} absences={absences} isSecretary={isSecretary} onReload={reloadBase} onToast={showToast} />
        )}

        {/* ── Stats ── */}
        {tab === 'stats' && (
          <StatsTab medecins={medecins} />
        )}

        <div className="foot">
          Pôle Gériatrie — Planning interne · Base de données SQLite
        </div>
      </div>

      {/* ── Toasts ── */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'ok' ? '✓' : '⚠'} {t.msg}
          </div>
        ))}
      </div>

      {/* ── Modal affectation (secrétaires seulement) ── */}
      {modal && isSecretary && (
        <AssignModal
          poste={modal.poste}
          dayIso={modal.dayIso}
          monday={monday}
          planningData={planningData}
          medecins={medecins}
          absences={absences}
          onClose={() => setModal(null)}
          onAction={handleAction}
        />
      )}

      {/* ── Modal mot de passe ── */}
      {pwdModal && (
        <PasswordModal
          onClose={() => setPwdModal(false)}
          onSuccess={handleUnlock}
        />
      )}
    </>
  );
}
