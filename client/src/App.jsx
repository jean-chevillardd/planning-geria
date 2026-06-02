// App.jsx — PATCHED: emoji removed from tabs, header refreshed, palette updated
import { useState, useCallback, useRef, useEffect } from 'react';
import { getMonday, toIso, addDays } from './utils';
import { useBaseData, usePlanning } from './hooks/useData';
import * as api from './api';

import WeekNav       from './components/WeekNav';
import PlanningGrid  from './components/PlanningGrid';
import AssignModal   from './components/AssignModal';
import TeamTab       from './components/TeamTab';
import AbsencesTab   from './components/AbsencesTab';
import StatsTab      from './components/StatsTab';
import MonthView     from './components/MonthView';
import AstreintesTab from './components/AstreintesTab';

// ── Tab definitions — no emoji, SVG icons ──────────────────
const TAB_ICONS = {
  planning: (active) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? '#2563eb' : '#c8c5bc'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="12" height="11" rx="1.5"/>
      <path d="M1 5.5h12"/><path d="M4.5 1v3M9.5 1v3"/>
      <path d="M4 8.5h1.2M6.9 8.5h1.2M9.8 8.5h1.2"/>
    </svg>
  ),
  equipe: (active) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? '#2563eb' : '#c8c5bc'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="5" r="2.2"/>
      <path d="M1 13c0-2.2 1.8-4 4-4s4 1.8 4 4"/>
      <circle cx="10.5" cy="4.5" r="1.8"/>
      <path d="M12.8 13c0-1.9-1.5-3.5-3.3-3.5"/>
    </svg>
  ),
  absences: (active) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? '#2563eb' : '#c8c5bc'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="12" height="11" rx="1.5"/>
      <path d="M1 5.5h12"/><path d="M4.5 1v3M9.5 1v3"/>
      <path d="M4.5 9.5h5"/>
    </svg>
  ),
  stats: (active) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? '#2563eb' : '#c8c5bc'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12V7.5M5.5 12V4.5M9 12V6.5M12.5 12V2.5"/>
      <path d="M1 12h12"/>
    </svg>
  ),
  astreintes: (active) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      stroke={active ? '#2563eb' : '#c8c5bc'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1.5c.55 0 1 .45 1 1v.4a4 4 0 0 1 3 3.8V10l1 1.5H2L3 10V6.7a4 4 0 0 1 3-3.8V2.5c0-.55.45-1 1-1z"/>
      <path d="M5.5 12a1.5 1.5 0 0 0 3 0"/>
    </svg>
  ),
};

const TABS = [
  { id:'planning',   label:'Planning' },
  { id:'equipe',     label:'Équipe' },
  { id:'absences',   label:'Absences' },
  { id:'stats',      label:'Synthèse' },
  { id:'astreintes', label:'Astreintes' },
];

const PLANNING_VIEWS = [
  { id:'semaine',    label:'Semaine',    desc:'Cette semaine en grand' },
  { id:'calendrier', label:'Calendrier', desc:'Vue mensuelle'         },
];

const SESSION_KEY = 'secretary_key';

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
      const { token } = await api.checkPassword(pwd);
      onSuccess(token ?? '');
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
        <p style={{ fontSize:11, fontFamily:'inherit', color:'var(--text2)', margin:'6px 0 14px', lineHeight:1.6 }}>
          Entrez le mot de passe pour activer les modifications.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Mot de passe</label>
            <input ref={inputRef} type="password" value={pwd}
              onChange={e => { setPwd(e.target.value); setError(''); }}
              placeholder="••••••••" autoComplete="current-password" />
          </div>
          {error && <p style={{ fontSize:11, fontFamily:'inherit', color:'var(--danger)', marginBottom:10 }}>{error}</p>}
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

// ── Bouton mode édition (tab bar) ─────────────────────────
function LockButton({ isSecretary, onLock, onUnlock }) {
  return (
    <button
      onClick={isSecretary ? onLock : onUnlock}
      title={isSecretary ? 'Mode édition actif — cliquer pour verrouiller' : 'Activer le mode édition'}
      style={{
        display:'flex', alignItems:'center', gap:7,
        padding:'6px 14px', borderRadius:9, marginLeft:'auto', margin:'5px 0 7px auto',
        border: isSecretary
          ? '1.5px solid #f43f5e'
          : '1.5px solid var(--border)',
        background: isSecretary ? 'rgba(244,63,94,.06)' : 'transparent',
        cursor:'pointer',
        color: isSecretary ? '#f43f5e' : 'var(--text2)',
        fontSize:12, fontFamily:'inherit', fontWeight:700,
        transition:'all .15s',
      }}
    >
      <span style={{ fontSize:13 }}>✎</span>
      <span>Mode édition</span>
      {isSecretary && (
        <span style={{
          background:'#f43f5e', color:'#fff',
          fontSize:9, fontWeight:700,
          padding:'1px 6px', borderRadius:8, letterSpacing:'0.04em',
        }}>ACTIF</span>
      )}
    </button>
  );
}

// ── App principale ─────────────────────────────────────────
export default function App() {
  const [tab,            setTab]        = useState('planning');
  const [planningView,   setPlanningView] = useState('semaine');
  const [absencesInitNav, setAbsencesInitNav] = useState(null);
  const [monday,         setMonday]     = useState(() => getMonday(new Date()));
  const [modal,          setModal]      = useState(null);
  const [toasts,         setToasts]     = useState([]);
  const [isSecretary,    setIsSecretary] = useState(false);
  const [pwdModal,       setPwdModal]   = useState(false);
  const [doctorFilter,   setDoctorFilter] = useState('');
  const [astreintesDay,  setAstreintesDay] = useState(null);
  const [showAvailablePanel, setShowAvailablePanel] = useState(false);
  const toastId       = useRef(0);
  const undoStackRef  = useRef([]);
  const handleUndoRef = useRef(null);

  function handleOpenAstreintes(dayIso) {
    setAstreintesDay(dayIso);
    setTab('astreintes');
  }
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

  // ── Undo global ────────────────────────────────────────
  function pushUndo(label, undoFn) {
    undoStackRef.current = [...undoStackRef.current.slice(-29), { label, undo: undoFn }];
  }

  function handleUndo() {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    entry.undo()
      .then(() => showToast(`Annulé : ${entry.label}`))
      .catch(e => showToast(e.message || "Erreur lors de l'annulation", 'err'));
  }
  handleUndoRef.current = handleUndo;

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        handleUndoRef.current?.();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function handleUnlock(password) {
    api.setSecretaryKey(password);
    sessionStorage.setItem(SESSION_KEY, password);
    setIsSecretary(true); setPwdModal(false);
    showToast('Mode secrétariat activé');
  }

  function handleLock() {
    api.setSecretaryKey(''); sessionStorage.removeItem(SESSION_KEY);
    setIsSecretary(false); setModal(null);
    undoStackRef.current = [];
    showToast('Planning verrouillé');
  }

  async function handleAction(type, payload) {
    try {
      let undoFn = null;
      let undoLabel = '';
      switch (type) {
        case 'add_affectation':
          await api.addAffectation(payload);
          undoLabel = 'Ajout affectation';
          undoFn = async () => { await api.deleteAffectation(payload); reloadPlan(); };
          break;
        case 'del_affectation': {
          const excls = (planningData?.exclusions || [])
            .filter(e => e.poste_id === payload.poste_id && e.med_id === payload.med_id);
          await api.deleteAffectation(payload);
          undoLabel = 'Suppression affectation';
          undoFn = async () => {
            await api.addAffectation(payload);
            for (const ex of excls)
              await api.addExclusion({ week_key: payload.week_key, poste_id: ex.poste_id, med_id: ex.med_id, jour: ex.jour });
            reloadPlan();
          };
          break;
        }
        case 'add_exclusion':
          await api.addExclusion(payload);
          undoLabel = 'Ajout exclusion';
          undoFn = async () => { await api.deleteExclusion(payload); reloadPlan(); };
          break;
        case 'del_exclusion':
          await api.deleteExclusion(payload);
          undoLabel = 'Suppression exclusion';
          undoFn = async () => { await api.addExclusion(payload); reloadPlan(); };
          break;
        case 'add_extra':
          await api.addExtra(payload);
          undoLabel = 'Ajout extra';
          undoFn = async () => { await api.deleteExtra(payload); reloadPlan(); };
          break;
        case 'del_extra':
          await api.deleteExtra(payload);
          undoLabel = 'Suppression extra';
          undoFn = async () => { await api.addExtra(payload); reloadPlan(); };
          break;
        case 'add_renfort':
          await api.addRenfort(payload);
          undoLabel = 'Ajout renfort';
          undoFn = async () => { await api.deleteRenfort(payload); reloadPlan(); };
          break;
        case 'del_renfort':
          await api.deleteRenfort(payload);
          undoLabel = 'Suppression renfort';
          undoFn = async () => { await api.addRenfort(payload); reloadPlan(); };
          break;
        default: console.warn('Action inconnue:', type);
      }
      if (undoFn) pushUndo(undoLabel, undoFn);
      setModal(null); reloadPlan(); showToast('Enregistré');
    } catch(e) { showToast(e.message || "Erreur lors de l'enregistrement", 'err'); }
  }

  // ── Drag & Drop : déplacement d'un praticien vers un autre poste ──
  async function handleMove({ mode, weekKey, sourcePid, targetPid, medId, dayIso, isExtra }) {
    try {
      let undoFn;
      if (mode === 'day') {
        if (isExtra) await api.deleteExtra({ week_key:weekKey, poste_id:sourcePid, med_id:medId, jour:dayIso });
        else         await api.addExclusion({ week_key:weekKey, poste_id:sourcePid, med_id:medId, jour:dayIso });
        await api.addExtra({ week_key:weekKey, poste_id:targetPid, med_id:medId, jour:dayIso });
        undoFn = async () => {
          await api.deleteExtra({ week_key:weekKey, poste_id:targetPid, med_id:medId, jour:dayIso });
          if (isExtra) await api.addExtra({ week_key:weekKey, poste_id:sourcePid, med_id:medId, jour:dayIso });
          else         await api.deleteExclusion({ week_key:weekKey, poste_id:sourcePid, med_id:medId, jour:dayIso });
          reloadPlan();
        };
      } else {
        if (isExtra) {
          await api.deleteExtra({ week_key:weekKey, poste_id:sourcePid, med_id:medId, jour:dayIso });
          await api.addAffectation({ week_key:weekKey, poste_id:targetPid, med_id:medId });
          undoFn = async () => {
            await api.deleteAffectation({ week_key:weekKey, poste_id:targetPid, med_id:medId });
            await api.addExtra({ week_key:weekKey, poste_id:sourcePid, med_id:medId, jour:dayIso });
            reloadPlan();
          };
        } else {
          await api.moveAffectation({ week_key:weekKey, source_poste_id:sourcePid, target_poste_id:targetPid, med_id:medId });
          undoFn = async () => {
            await api.moveAffectation({ week_key:weekKey, source_poste_id:targetPid, target_poste_id:sourcePid, med_id:medId });
            reloadPlan();
          };
        }
      }
      pushUndo('Déplacement', undoFn);
      reloadPlan();
      showToast('Déplacement enregistré');
    } catch(e) { showToast(e.message || 'Erreur lors du déplacement', 'err'); }
  }

  async function handleCopyWeek() {
    const prevKey = toIso(addDays(monday, -7));
    if (!confirm('Copier les affectations de la semaine précédente ? Les affectations actuelles seront écrasées.')) return;
    try { await api.copyWeek(prevKey, weekKey); reloadPlan(); showToast('Semaine copiée'); }
    catch(e) { showToast(e.message || 'Erreur lors de la copie', 'err'); }
  }

  if (baseLoading && medecins.length === 0)
    return <div style={{ padding:'2rem', fontFamily:'inherit', color:'var(--text2)' }}>Chargement…</div>;
  if (baseError)
    return <div style={{ padding:'2rem', fontFamily:'inherit', color:'var(--danger)' }}>Erreur : {baseError}</div>;

  return (
    <>
      {/* ── Header ── */}
      <div className="hdr" style={{
        background: isSecretary
          ? 'linear-gradient(135deg,#1d4ed8,#2563eb)'
          : '#1d4ed8',
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
        </div>
      </div>

      <div className="main">
        {/* ── Tabs ── */}
        <div className="tabs" style={{ alignItems:'center' }}>
          {TABS.map(t => (
            <button key={t.id} className={`tab${tab===t.id?' active':''}`} onClick={() => setTab(t.id)}>
              {TAB_ICONS[t.id](tab === t.id)}
              {t.label}
            </button>
          ))}
          <LockButton isSecretary={isSecretary} onLock={handleLock} onUnlock={() => setPwdModal(true)} />
        </div>

        {/* ── Planning ── */}
        {tab === 'planning' && (
          <>
            {/* Switcher sous-vues */}
            <div className="print-hide" style={{ display:'flex', gap:6, alignItems:'center', marginBottom:16 }}>
              {PLANNING_VIEWS.map(v => (
                <button key={v.id} onClick={() => setPlanningView(v.id)} style={{
                  display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2,
                  padding:'8px 16px', borderRadius:'var(--r)',
                  border:`1.5px solid ${planningView===v.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: planningView===v.id ? 'var(--accent-light)' : 'transparent',
                  cursor:'pointer', fontFamily:'inherit', transition:'all .15s', minWidth:90,
                }}>
                  <span style={{ fontSize:12, fontWeight:700, color: planningView===v.id ? 'var(--accent)' : 'var(--text)' }}>
                    {v.label}
                  </span>
                  <span style={{ fontSize:10, color: planningView===v.id ? 'rgba(34,114,240,.6)' : 'var(--text3)' }}>
                    {v.desc}
                  </span>
                </button>
              ))}
            </div>

            {/* Sous-vue Semaine */}
            {planningView === 'semaine' && (
              <>
                <div className="print-hide" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginBottom:4 }}>
                  <div style={{ flex:1 }}>
                    <WeekNav monday={monday} onChange={setMonday} onCopy={handleCopyWeek}
                      onGoToday={() => setMonday(getMonday(new Date()))} isSecretary={isSecretary}
                      medecins={medecins} doctorFilter={doctorFilter} onDoctorFilterChange={setDoctorFilter} />
                  </div>
                  <button
                    className={`btn-toggle-available${showAvailablePanel ? ' active' : ''}`}
                    onClick={() => setShowAvailablePanel(v => !v)}
                    title="Afficher / masquer les PH disponibles cette semaine"
                  >
                    PH dispo {showAvailablePanel ? '◀' : '▶'}
                  </button>
                </div>
                {planLoading && !planningData && (
                  <div style={{ fontFamily:'inherit', fontSize:12, color:'var(--text2)', padding:'1rem 0' }}>
                    Chargement du planning…
                  </div>
                )}
                {planningData && (
                  <div style={{ opacity: planLoading ? 0.55 : 1, transition:'opacity .15s', pointerEvents: planLoading ? 'none' : undefined }}>
                    <PlanningGrid monday={monday} planningData={planningData} absences={absences}
                      medecins={medecins} isSecretary={isSecretary} doctorFilter={doctorFilter}
                      onCellClick={(poste, dayIso) => {
                        if (!isSecretary) return;
                        // HDJ programmé fermé systématiquement le mercredi
                        if (poste.id === 'hdj' && new Date(dayIso).getDay() === 3) return;
                        setModal({ poste, dayIso });
                      }}
                      onOpenAstreintes={handleOpenAstreintes}
                      onMove={handleMove}
                      showAvailablePanel={showAvailablePanel} />
                  </div>
                )}
              </>
            )}

            {/* Sous-vue Calendrier */}
            {planningView === 'calendrier' && (
              <MonthView medecins={medecins} absences={absences} />
            )}
          </>
        )}
        {tab === 'equipe'   && <TeamTab medecins={medecins} isSecretary={isSecretary} onReload={reloadBase} onToast={showToast} onPushUndo={pushUndo} />}
        {tab === 'absences' && <AbsencesTab medecins={medecins} absences={absences} isSecretary={isSecretary} onReload={reloadBase} onToast={showToast} onPushUndo={pushUndo} initNav={absencesInitNav} />}
        {tab === 'stats'      && <StatsTab medecins={medecins} onGoToAbsences={(medId, monthKey) => {
          setAbsencesInitNav({ medId, monthDate: new Date(monthKey + '-15'), nonce: Date.now() });
          setTab('absences');
        }} />}
        {tab === 'astreintes' && (
          <AstreintesTab
            medecins={medecins}
            isSecretary={isSecretary}
            onToast={showToast}
            onPushUndo={pushUndo}
            dayIso={astreintesDay}
          />
        )}

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
