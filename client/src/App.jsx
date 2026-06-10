// App.jsx — PATCHED: emoji removed from tabs, header refreshed, palette updated
import { useState, useCallback, useRef, useEffect } from 'react';
import { getMonday, toIso, addDays, worksWeekAny } from './utils';
import { useBaseData, usePlanning } from './hooks/useData';
import * as api from './api';

import WeekNav       from './components/WeekNav';
import PlanningGrid  from './components/PlanningGrid';
import AssignModal   from './components/AssignModal';
import TeamTab       from './components/TeamTab';
import CongesTab     from './components/CongesTab';
import StatsTab      from './components/StatsTab';
import MonthView     from './components/MonthView';
import AstreintesTab from './components/AstreintesTab';
import SettingsTab  from './components/SettingsTab';

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
  parametres: (active) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={active ? '#2563eb' : '#c8c5bc'} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
};

const TABS = [
  { id:'planning',   label:'Planning',    gestionnaireOnly: false },
  { id:'equipe',     label:'Équipe',      gestionnaireOnly: true  },
  { id:'absences',   label:'Congés',      gestionnaireOnly: false },
  { id:'stats',      label:'Synthèse',    gestionnaireOnly: false },
  { id:'astreintes', label:'Astreintes',  gestionnaireOnly: false, disabled: true },
  { id:'parametres', label:'Paramètres',  gestionnaireOnly: true  },
];

const PLANNING_VIEWS = [
  { id:'semaine',  label:'Semaine',  desc:'Cette semaine en grand', gestionnaireOnly: false },
  { id:'rotation', label:'Rotation', desc:'Postes × semaines',     gestionnaireOnly: true  },
  { id:'mois',     label:'Mois',     desc:'Vue mensuelle',         gestionnaireOnly: false },
];

// ── App principale ─────────────────────────────────────────
export default function App({ role, onLogout }) {
  const isGestionnaire = role === 'gestionnaire';

  const [tab,            setTab]        = useState('planning');
  const [planningView,   setPlanningView] = useState('semaine');
  const [absencesInitNav, setAbsencesInitNav] = useState(null);
  const [monday,         setMonday]     = useState(() => getMonday(new Date()));
  const [modal,          setModal]      = useState(null);
  const [toasts,         setToasts]     = useState([]);
  const [doctorFilter,   setDoctorFilter] = useState('');
  const [astreintesDay,  setAstreintesDay] = useState(null);
  const [monthReloadKey, setMonthReloadKey] = useState(0);
  const toastId       = useRef(0);
  const undoStackRef  = useRef([]);
  const handleUndoRef = useRef(null);

  function handleOpenAstreintes(dayIso) {
    setAstreintesDay(dayIso);
    setTab('astreintes');
  }
  const weekKey = toIso(monday);

  const { medecins, absences, loading: baseLoading, error: baseError, reload: reloadBase } = useBaseData();
  const { data: planningData, setData: setPlanningData, loading: planLoading, reload: reloadPlan } = usePlanning(weekKey);
  const reload = useCallback(() => { reloadBase(); reloadPlan(); }, [reloadBase, reloadPlan]);

  const [fermetures, setFermetures] = useState([]);
  const reloadFermetures = useCallback(async () => {
    try { setFermetures(await api.getFermetures()); } catch(e) { console.error('getFermetures:', e); }
  }, []);
  useEffect(() => { reloadFermetures(); }, [reloadFermetures]);

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



  async function handleAction(type, payload) {
    try {
      let undoFn = null;
      let undoLabel = '';
      switch (type) {
        case 'add_affectation': {
          await api.addAffectation(payload);
          const autoExcludeDays = payload.auto_exclude_days || [];
          for (const jour of autoExcludeDays)
            await api.addExclusion({ week_key: payload.week_key, poste_id: payload.poste_id, med_id: payload.med_id, jour });
          undoLabel = 'Ajout affectation';
          undoFn = async () => {
            await api.deleteAffectation(payload);
            for (const jour of autoExcludeDays)
              await api.deleteExclusion({ week_key: payload.week_key, poste_id: payload.poste_id, med_id: payload.med_id, jour });
            reloadPlan();
          };
          break;
        }
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
  // Supprime instantanément (optimiste) les extras d'un médecin dans un poste,
  // puis persiste via un seul appel API bulk.
  async function cleanExtrasInPoste(weekKey, posteId, medId) {
    setPlanningData(prev => prev ? {
      ...prev,
      extras: prev.extras.filter(e => !(String(e.med_id) === String(medId) && e.poste_id === posteId)),
    } : prev);
    await api.deleteExtrasForPoste({ week_key: weekKey, poste_id: posteId, med_id: String(medId) }).catch(() => {});
  }

  async function handleMove({ mode, weekKey, sourcePid, targetPid, medId, dayIso, isExtra }) {
    try {
      let undoFn;
      if (mode === 'day') {
        if (isExtra) await api.deleteExtra({ week_key:weekKey, poste_id:sourcePid, med_id:medId, jour:dayIso });
        else         await api.addExclusion({ week_key:weekKey, poste_id:sourcePid, med_id:medId, jour:dayIso });
        // Mise à jour optimiste : retirer l'extra existant de la cible immédiatement
        setPlanningData(prev => prev ? {
          ...prev,
          extras: prev.extras.filter(e => !(String(e.med_id) === String(medId) && e.poste_id === targetPid && e.jour === dayIso)),
        } : prev);
        await api.deleteExtra({ week_key:weekKey, poste_id:targetPid, med_id:medId, jour:dayIso }).catch(() => {});
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
          await cleanExtrasInPoste(weekKey, targetPid, medId);
          undoFn = async () => {
            await api.deleteAffectation({ week_key:weekKey, poste_id:targetPid, med_id:medId });
            await api.addExtra({ week_key:weekKey, poste_id:sourcePid, med_id:medId, jour:dayIso });
            reloadPlan();
          };
        } else {
          await api.moveAffectation({ week_key:weekKey, source_poste_id:sourcePid, target_poste_id:targetPid, med_id:medId });
          await cleanExtrasInPoste(weekKey, targetPid, medId);
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

  async function handleAssign({ mode, medId, targetPid, dayIso: assignDay, weekKey: assignWk, autoExcludeDays }) {
    if (mode === 'week') {
      // Ne pas passer par handleAction (qui appelle reloadPlan() en interne non-awaité),
      // pour éviter que le reload écrase le nettoyage des extras avant qu'il soit terminé.
      try {
        await api.addAffectation({ week_key: assignWk, poste_id: targetPid, med_id: medId });
        for (const jour of (autoExcludeDays || []))
          await api.addExclusion({ week_key: assignWk, poste_id: targetPid, med_id: medId, jour });
        await cleanExtrasInPoste(assignWk, targetPid, medId); // optimiste + bulk delete AVANT reload
        pushUndo('Ajout affectation', async () => {
          await api.deleteAffectation({ week_key: assignWk, poste_id: targetPid, med_id: medId });
          for (const jour of (autoExcludeDays || []))
            await api.deleteExclusion({ week_key: assignWk, poste_id: targetPid, med_id: medId, jour });
          reloadPlan();
        });
        reloadPlan();
        showToast('Enregistré');
      } catch(e) { showToast(e.message || "Erreur lors de l'affectation", 'err'); }
    } else {
      await handleAction('add_extra', { week_key: assignWk, poste_id: targetPid, med_id: medId, jour: assignDay });
    }
  }

  // ── Affectation multi-semaines depuis MonthView (Mode Rotation) ──
  async function handleMonthAssign({ medId, posteId, weekKey, mode, nWeeks, monthY, monthM }) {
    const allKeys = [];
    if (mode === 'week') {
      allKeys.push(weekKey);
    } else if (mode === 'month') {
      let c = getMonday(new Date(monthY, monthM, 1));
      const end = new Date(monthY, monthM + 1, 0);
      while (c <= end) { allKeys.push(toIso(c)); c = addDays(c, 7); }
    } else if (mode === 'nweeks') {
      let c = new Date(weekKey + 'T12:00:00');
      for (let i = 0; i < nWeeks; i++) { allKeys.push(toIso(c)); c = addDays(c, 7); }
    }
    // Skip weeks where the doctor is entirely absent (no working day at all)
    const med = medecins.find(m => m.id === medId);
    const weekKeys = med
      ? allKeys.filter(wk => worksWeekAny(med, new Date(wk + 'T12:00:00'), absences))
      : allKeys;
    if (weekKeys.length === 0) { showToast('Aucune semaine disponible (absent sur toute la période)', 'err'); return; }
    const inserted = [];
    try {
      for (const wk of weekKeys) {
        await api.addAffectation({ week_key: wk, poste_id: posteId, med_id: medId });
        inserted.push(wk);
      }
      pushUndo(`Rotation (${inserted.length} sem.)`, async () => {
        for (const wk of inserted)
          await api.deleteAffectation({ week_key: wk, poste_id: posteId, med_id: medId }).catch(() => {});
        setMonthReloadKey(k => k + 1);
      });
      setMonthReloadKey(k => k + 1);
      showToast(`Affecté sur ${inserted.length} semaine(s)`);
    } catch(e) {
      for (const wk of inserted)
        await api.deleteAffectation({ week_key: wk, poste_id: posteId, med_id: medId }).catch(() => {});
      showToast(e.message || 'Erreur lors de l\'affectation', 'err');
    }
  }

  // ── Modification de durée depuis MonthView (Mode Rotation) ──
  async function handleMonthModify({ medId, posteId, weeksToRemove, mode, nWeeks, monthY, monthM, weekKey }) {
    const weeksToAdd = [];
    if (mode === 'week') {
      weeksToAdd.push(weekKey);
    } else if (mode === 'month') {
      let c = getMonday(new Date(monthY, monthM, 1));
      const end = new Date(monthY, monthM + 1, 0);
      while (c <= end) { weeksToAdd.push(toIso(c)); c = addDays(c, 7); }
    } else if (mode === 'nweeks') {
      let c = new Date(weekKey + 'T12:00:00');
      for (let i = 0; i < nWeeks; i++) { weeksToAdd.push(toIso(c)); c = addDays(c, 7); }
    }
    const removed = [], added = [];
    try {
      for (const wk of weeksToRemove) {
        try {
          await api.deleteAffectation({ week_key: wk, poste_id: posteId, med_id: medId });
          removed.push(wk);
        } catch { /* semaine peut-être déjà supprimée */ }
      }
      for (const wk of weeksToAdd) {
        await api.addAffectation({ week_key: wk, poste_id: posteId, med_id: medId });
        added.push(wk);
      }
      pushUndo(`Modif. rotation (${added.length} sem.)`, async () => {
        for (const wk of added)
          await api.deleteAffectation({ week_key: wk, poste_id: posteId, med_id: medId }).catch(() => {});
        for (const wk of removed)
          await api.addAffectation({ week_key: wk, poste_id: posteId, med_id: medId }).catch(() => {});
        setMonthReloadKey(k => k + 1);
      });
      setMonthReloadKey(k => k + 1);
      showToast(`Modifié : affecté sur ${added.length} semaine(s)`);
    } catch(e) {
      for (const wk of added)
        await api.deleteAffectation({ week_key: wk, poste_id: posteId, med_id: medId }).catch(() => {});
      for (const wk of removed)
        await api.addAffectation({ week_key: wk, poste_id: posteId, med_id: medId }).catch(() => {});
      showToast(e.message || 'Erreur lors de la modification', 'err');
    }
  }

  // ── Retrait multi-semaines depuis MonthView (Mode Rotation) ──
  async function handleMonthRemove({ medId, posteId, weekKey, mode, nWeeks, monthY, monthM }) {
    const weekKeys = [];
    if (mode === 'week') {
      weekKeys.push(weekKey);
    } else if (mode === 'month') {
      let c = getMonday(new Date(monthY, monthM, 1));
      const end = new Date(monthY, monthM + 1, 0);
      while (c <= end) { weekKeys.push(toIso(c)); c = addDays(c, 7); }
    } else if (mode === 'nweeks') {
      let c = new Date(weekKey + 'T12:00:00');
      for (let i = 0; i < nWeeks; i++) { weekKeys.push(toIso(c)); c = addDays(c, 7); }
    }
    const removed = [];
    try {
      for (const wk of weekKeys) {
        try {
          await api.deleteAffectation({ week_key: wk, poste_id: posteId, med_id: medId });
          removed.push(wk);
        } catch { /* semaine non affectée, on ignore */ }
      }
      if (removed.length === 0) { showToast('Aucune affectation à retirer', 'err'); return; }
      pushUndo(`Retrait rotation (${removed.length} sem.)`, async () => {
        for (const wk of removed)
          await api.addAffectation({ week_key: wk, poste_id: posteId, med_id: medId }).catch(() => {});
        setMonthReloadKey(k => k + 1);
      });
      setMonthReloadKey(k => k + 1);
      showToast(`Retiré sur ${removed.length} semaine(s)`);
    } catch(e) {
      showToast(e.message || 'Erreur lors du retrait', 'err');
    }
  }

  function handleNavigateWeek(weekKey) {
    setMonday(new Date(weekKey + 'T12:00:00'));
    setPlanningView('semaine');
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
        background: isGestionnaire
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
          <button
            onClick={onLogout}
            title="Se déconnecter"
            style={{
              background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.22)',
              color: 'rgba(255,255,255,.85)', borderRadius: 6, padding: '4px 10px',
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              letterSpacing: '0.03em', transition: 'background .12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.22)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.12)'}
          >
            Déconnexion
          </button>
        </div>
      </div>

      <div className="main">
        {/* ── Tabs ── */}
        <div className="tabs" style={{ alignItems:'center' }}>
          {TABS.filter(t => !t.gestionnaireOnly || isGestionnaire).map(t => (
            <button
              key={t.id}
              className={`tab${tab===t.id?' active':''}${t.disabled?' tab-disabled':''}`}
              onClick={() => !t.disabled && setTab(t.id)}
              title={t.disabled ? 'Module en cours de développement — contacter Sylvain Lejeune' : undefined}
              disabled={t.disabled}
            >
              {TAB_ICONS[t.id](tab === t.id)}
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Planning ── */}
        {tab === 'planning' && (
          <>
            {/* Switcher sous-vues */}
            <div className="print-hide" style={{ display:'flex', gap:6, alignItems:'center', marginBottom:16 }}>
              {PLANNING_VIEWS.filter(v => !v.gestionnaireOnly || isGestionnaire).map(v => (
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
                <div className="print-hide" style={{ marginBottom:4 }}>
                  <WeekNav monday={monday} onChange={setMonday} onCopy={handleCopyWeek}
                    onGoToday={() => setMonday(getMonday(new Date()))} isSecretary={isGestionnaire}
                    medecins={medecins} doctorFilter={doctorFilter} onDoctorFilterChange={setDoctorFilter} />
                </div>
                {planLoading && !planningData && (
                  <div style={{ fontFamily:'inherit', fontSize:12, color:'var(--text2)', padding:'1rem 0' }}>
                    Chargement du planning…
                  </div>
                )}
                {planningData && (
                  <div style={{ opacity: planLoading ? 0.55 : 1, transition:'opacity .15s', pointerEvents: planLoading ? 'none' : undefined }}>
                    <PlanningGrid monday={monday} planningData={planningData} absences={absences}
                      medecins={medecins} isSecretary={isGestionnaire} doctorFilter={doctorFilter}
                      fermetures={fermetures}
                      onCellClick={(poste, dayIso) => {
                        if (!isGestionnaire) return;
                        // HDJ programmé fermé systématiquement le mercredi
                        if (poste.id === 'hdj' && new Date(dayIso).getDay() === 3) return;
                        // Fermeture configurée pour ce service ce jour
                        if (fermetures.some(f => f.poste_id === poste.id && f.date_debut <= dayIso && f.date_fin >= dayIso)) return;
                        setModal({ poste, dayIso });
                      }}
                      onOpenAstreintes={handleOpenAstreintes}
                      onMove={handleMove}
                      onAssign={handleAssign}
                      showAvailablePanel={isGestionnaire} />
                  </div>
                )}
              </>
            )}

            {/* Sous-vues Mois et Rotation */}
            {(planningView === 'mois' || planningView === 'rotation') && (
              <MonthView medecins={medecins} absences={absences} isSecretary={isGestionnaire}
                rotationMode={planningView === 'rotation'}
                reloadKey={monthReloadKey}
                fermetures={fermetures}
                onMonthAssign={handleMonthAssign}
                onMonthRemove={handleMonthRemove}
                onMonthModify={handleMonthModify}
                onNavigateWeek={handleNavigateWeek} />
            )}
          </>
        )}
        {tab === 'equipe'   && <TeamTab medecins={medecins} isSecretary={isGestionnaire} onReload={reloadBase} onToast={showToast} onPushUndo={pushUndo} />}
        {tab === 'absences' && <CongesTab medecins={medecins} isGestionnaire={isGestionnaire} onToast={showToast} />}
        {tab === 'stats'      && <StatsTab medecins={medecins} onGoToAbsences={(medId, monthKey) => {
          setAbsencesInitNav({ medId, monthDate: new Date(monthKey + '-15'), nonce: Date.now() });
          setTab('absences');
        }} />}
        {tab === 'astreintes' && (
          <AstreintesTab
            medecins={medecins}
            isSecretary={isGestionnaire}
            onToast={showToast}
            onPushUndo={pushUndo}
            dayIso={astreintesDay}
          />
        )}

        {tab === 'parametres' && isGestionnaire && (
          <SettingsTab showToast={showToast} onFermeturesChange={reloadFermetures} />
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

      {modal && isGestionnaire && (
        <AssignModal poste={modal.poste} dayIso={modal.dayIso} monday={monday}
          planningData={planningData} medecins={medecins} absences={absences}
          onClose={() => setModal(null)} onAction={handleAction} />
      )}
    </>
  );
}
