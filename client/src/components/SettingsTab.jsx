import { useState, useEffect, useCallback, useRef } from 'react';
import { POSTES } from '../utils.js';
import {
  getTeamCode, updateTeamCode, changePassword,
  getGestionnaires, createGestionnaire, updateGestionnaire, deleteGestionnaire,
  getFermetures, createFermeture, updateFermeture, deleteFermeture,
} from '../api.js';

// ── Icônes SVG inline ──────────────────────────────────────────────────────────

function IcoLock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function IcoUsers() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IcoCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
    </svg>
  );
}

function IcoEye({ visible }) {
  return visible ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

// ── Sous-composants partagés ───────────────────────────────────────────────────

function PasswordInput({ id, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pwd-wrap">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className="form-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        autoComplete={autoComplete || 'off'}
      />
      <button
        type="button"
        className="pwd-eye"
        onClick={() => setShow(s => !s)}
        tabIndex={-1}
        title={show ? 'Masquer' : 'Afficher'}
      >
        <IcoEye visible={show} />
      </button>
    </div>
  );
}

// ── Sélecteur de plage de dates ────────────────────────────────────────────────
// debut / fin = chaînes 'YYYY-MM-DD' ou null
// onChange({ debut, fin })

const MONTHS_FR_SHORT = ['Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'];
const DAYS_HDR        = ['L','M','M','J','V','S','D'];

function isoDay(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isoWeek(y, m, d) {
  const date = new Date(y, m, d);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const jan1 = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - jan1) / 86400000) + 1) / 7);
}

function DateRangePicker({ debut, fin, onChange }) {
  const [open,     setOpen]     = useState(false);
  const [step,     setStep]     = useState('debut');
  const [hover,    setHover]    = useState(null);
  const [viewYear, setViewYear] = useState(() => {
    if (debut) return parseInt(debut.split('-')[0], 10);
    return new Date().getFullYear();
  });
  const [viewMo, setViewMo] = useState(() => {
    if (debut) return parseInt(debut.split('-')[1], 10) - 1;
    return new Date().getMonth();
  });
  // Position du popover en fixed
  const [popPos, setPopPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  function updatePos() {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPopPos({ top: r.bottom + 6, left: r.left });
  }

  // Fermer sur clic extérieur
  useEffect(() => {
    if (!open) return;
    function h(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        popoverRef.current  && !popoverRef.current.contains(e.target)
      ) { setOpen(false); setHover(null); }
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Fermer sur Escape
  useEffect(() => {
    if (!open) return;
    function h(e) { if (e.key === 'Escape') { setOpen(false); setHover(null); } }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open]);

  // Recalculer position sur scroll/resize
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => { window.removeEventListener('scroll', updatePos, true); window.removeEventListener('resize', updatePos); };
  }, [open]);

  // Navigation mois
  function prevMo() {
    if (viewMo === 0) { setViewYear(y => y - 1); setViewMo(11); }
    else setViewMo(m => m - 1);
  }
  function nextMo() {
    if (viewMo === 11) { setViewYear(y => y + 1); setViewMo(0); }
    else setViewMo(m => m + 1);
  }

  function handleDayClick(iso) {
    if (step === 'debut') {
      onChange({ debut: iso, fin: null });
      setStep('fin');
    } else {
      if (iso >= debut) {
        onChange({ debut, fin: iso });
      } else {
        // clic avant le début → permutation
        onChange({ debut: iso, fin: debut });
      }
      setStep('debut');
      setOpen(false);
      setHover(null);
    }
  }

  // Range à afficher (en hover ou définitive)
  const rangeStart = debut;
  const rangeEnd   = step === 'fin' ? (hover ?? fin) : fin;
  const [lo, hi]   = rangeStart && rangeEnd
    ? (rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart])
    : [null, null];

  // Libellé du bouton déclencheur
  function displayLabel() {
    const fmt = iso => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
    if (!debut) return 'Sélectionner une période…';
    if (debut && !fin) return `Du ${fmt(debut)} → …`;
    return `Du ${fmt(debut)} au ${fmt(fin)}`;
  }

  // Construction de la grille calendrier (rows de 7, avec n° semaine)
  const daysInMo = new Date(viewYear, viewMo + 1, 0).getDate();
  const firstDow = (new Date(viewYear, viewMo, 1).getDay() + 6) % 7; // lun=0
  const flatCells = [];
  for (let i = 0; i < firstDow; i++) flatCells.push(null);
  for (let d = 1; d <= daysInMo; d++) flatCells.push(d);
  while (flatCells.length % 7 !== 0) flatCells.push(null);
  const calRows = [];
  for (let i = 0; i < flatCells.length; i += 7) calRows.push(flatCells.slice(i, i + 7));

  const todayIso = isoDay(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  return (
    <div style={{ position:'relative' }}>
      {/* Déclencheur */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          const opening = !open;
          if (opening) updatePos();
          setOpen(opening);
          if (opening) {
            setStep(debut && fin ? 'debut' : debut ? 'fin' : 'debut');
            if (debut) {
              setViewYear(parseInt(debut.split('-')[0], 10));
              setViewMo(parseInt(debut.split('-')[1], 10) - 1);
            }
          } else {
            setHover(null);
          }
        }}
        style={{
          width:'100%', textAlign:'left', padding:'7px 10px',
          border:`1px solid ${open ? 'var(--accent)' : 'var(--border2)'}`,
          borderRadius:'var(--r)', background:'var(--surface)',
          color: debut ? 'var(--text)' : 'var(--text3)', cursor:'pointer',
          fontSize:12, fontFamily:'inherit',
          boxShadow: open ? '0 0 0 2px var(--accent-light)' : 'none',
          transition:'border-color .1s, box-shadow .1s',
          display:'flex', alignItems:'center', gap:8,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, opacity:.5 }}>
          <rect x="1" y="2" width="12" height="11" rx="1.5"/>
          <path d="M1 5.5h12M4.5 1v3M9.5 1v3"/>
        </svg>
        <span style={{ flex:1 }}>{displayLabel()}</span>
      </button>

      {/* Popover calendrier — position:fixed pour échapper aux overflow:hidden parents */}
      {open && (
        <div
          ref={popoverRef}
          style={{
            position:'fixed', top: popPos.top, left: popPos.left, zIndex:1200,
            background:'var(--surface)', border:'1px solid var(--border2)',
            borderRadius:'var(--rl)', boxShadow:'0 8px 28px rgba(0,0,0,.18)',
            padding:'12px 14px', minWidth:272, userSelect:'none',
          }}
        >
          {/* Navigation mois */}
          <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:10 }}>
            <button className="wn-btn" type="button" onClick={prevMo}>‹</button>
            <span style={{ flex:1, textAlign:'center', fontSize:12, fontWeight:700 }}>
              {MONTHS_FR_SHORT[viewMo]} {viewYear}
            </span>
            <button className="wn-btn" type="button" onClick={nextMo}>›</button>
          </div>

          {/* Indication de l'étape */}
          <div style={{
            fontSize:10, color:'var(--text3)', marginBottom:8,
            textAlign:'center', fontStyle:'italic',
          }}>
            {step === 'fin' && debut
              ? `Début : ${new Date(debut + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' })} — cliquez la date de fin`
              : 'Cliquez la date de début'}
          </div>

          {/* En-tête : colonne S# + 7 jours */}
          <div style={{ display:'grid', gridTemplateColumns:'20px repeat(7,1fr)', gap:2, marginBottom:3 }}>
            <div style={{ textAlign:'center', fontSize:9, fontWeight:700, color:'var(--text3)', opacity:.4, padding:'1px 0' }}>S</div>
            {DAYS_HDR.map((d, i) => (
              <div key={i} style={{ textAlign:'center', fontSize:9, fontWeight:700, color:'var(--text3)', padding:'1px 0' }}>{d}</div>
            ))}
          </div>

          {/* Grille par lignes */}
          {calRows.map((row, ri) => {
            const firstDay = row.find(d => d !== null);
            const weekNum  = firstDay != null ? isoWeek(viewYear, viewMo, firstDay) : null;
            return (
              <div key={ri} style={{ display:'grid', gridTemplateColumns:'20px repeat(7,1fr)', gap:2, marginBottom:1 }}>
                {/* Numéro de semaine */}
                <div style={{
                  textAlign:'center', fontSize:9, color:'var(--text3)', opacity:.45,
                  fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {weekNum ?? ''}
                </div>
                {/* 7 cellules jours */}
                {row.map((d, ci) => {
                  if (!d) return <div key={ci} />;
                  const iso      = isoDay(viewYear, viewMo, d);
                  const isStart  = iso === debut;
                  const isEnd    = iso === (step === 'fin' ? (hover ?? fin) : fin);
                  const inRange  = lo && hi && iso > lo && iso < hi;
                  const isToday  = iso === todayIso;
                  const isHover  = iso === hover && step === 'fin';
                  const selected = isStart || isEnd;
                  return (
                    <div
                      key={ci}
                      onClick={() => handleDayClick(iso)}
                      onMouseEnter={() => step === 'fin' && setHover(iso)}
                      onMouseLeave={() => step === 'fin' && setHover(null)}
                      style={{
                        textAlign:'center', fontSize:11, padding:'4px 2px',
                        borderRadius:4, cursor:'pointer',
                        fontWeight: selected ? 700 : isToday ? 600 : 400,
                        background: selected
                          ? 'var(--accent)'
                          : isHover
                            ? 'var(--accent-mid)'
                            : inRange
                              ? 'var(--accent-light)'
                              : 'transparent',
                        color: selected
                          ? '#fff'
                          : (isHover || inRange)
                            ? 'var(--accent)'
                            : isToday
                              ? 'var(--accent)'
                              : 'var(--text)',
                        border: isToday && !selected ? '1px solid var(--accent-mid)' : '1px solid transparent',
                        transition:'background .06s',
                      }}
                    >
                      {d}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Bouton réinitialiser */}
          {(debut || fin) && (
            <button
              type="button"
              onClick={() => { onChange({ debut: null, fin: null }); setStep('debut'); setHover(null); }}
              style={{
                marginTop:10, width:'100%', fontSize:10, padding:'4px',
                border:'1px solid var(--border2)', borderRadius:'var(--r)',
                background:'transparent', cursor:'pointer',
                color:'var(--text3)', fontFamily:'inherit',
              }}
            >
              Réinitialiser la période
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section Identifiants ───────────────────────────────────────────────────────

function SectionIdentifiants({ showToast }) {
  const [teamCode, setTeamCode]         = useState('');
  const [newCode, setNewCode]           = useState('');
  const [codeLoading, setCodeLoading]   = useState(false);
  const [codeErr, setCodeErr]           = useState('');
  const [codeSuccess, setCodeSuccess]   = useState(false);

  const [curPwd, setCurPwd]             = useState('');
  const [newPwd, setNewPwd]             = useState('');
  const [confirmPwd, setConfirmPwd]     = useState('');
  const [pwdLoading, setPwdLoading]     = useState(false);
  const [pwdErr, setPwdErr]             = useState('');
  const [pwdSuccess, setPwdSuccess]     = useState(false);

  useEffect(() => {
    getTeamCode()
      .then(d => { setTeamCode(d.code); setNewCode(d.code); })
      .catch(() => {});
  }, []);

  const handleCodeSave = useCallback(async (e) => {
    e.preventDefault();
    setCodeErr('');
    if (newCode.length < 4) { setCodeErr('4 caractères minimum'); return; }
    setCodeLoading(true);
    try {
      await updateTeamCode(newCode);
      setTeamCode(newCode);
      setCodeSuccess(true);
      showToast('Code équipe mis à jour', 'success');
      setTimeout(() => setCodeSuccess(false), 2500);
    } catch (err) {
      setCodeErr(err.message || 'Erreur');
    } finally {
      setCodeLoading(false);
    }
  }, [newCode, showToast]);

  const handlePwdSave = useCallback(async (e) => {
    e.preventDefault();
    setPwdErr('');
    if (newPwd.length < 6) { setPwdErr('6 caractères minimum'); return; }
    if (newPwd !== confirmPwd) { setPwdErr('Les mots de passe ne correspondent pas'); return; }
    setPwdLoading(true);
    try {
      await changePassword(curPwd, newPwd);
      setCurPwd(''); setNewPwd(''); setConfirmPwd('');
      setPwdSuccess(true);
      showToast('Mot de passe modifié', 'success');
      setTimeout(() => setPwdSuccess(false), 2500);
    } catch (err) {
      setPwdErr(err.message || 'Erreur');
    } finally {
      setPwdLoading(false);
    }
  }, [curPwd, newPwd, confirmPwd, showToast]);

  const codeChanged = newCode !== teamCode;

  return (
    <div className="sec-body">
      <h2 className="sec-title">Identifiants</h2>
      <p className="sec-desc">Gérez le code d'accès de l'équipe et votre mot de passe administrateur.</p>

      <div className="cards-row">
        <div className="mcard">
          <div className="card-title">Code équipe</div>
          <p className="card-desc">Ce code permet aux praticiens de se connecter en lecture seule.</p>
          <form onSubmit={handleCodeSave}>
            <label className="field-label" htmlFor="team-code">Code d'accès</label>
            <PasswordInput
              id="team-code" value={newCode}
              onChange={v => { setNewCode(v); setCodeErr(''); setCodeSuccess(false); }}
              placeholder="Code équipe" autoComplete="off"
            />
            {codeErr && <div className="field-err">{codeErr}</div>}
            {codeSuccess && <div className="field-ok">Code mis à jour ✓</div>}
            <button type="submit" className="btn-primary" disabled={codeLoading || !codeChanged} style={{ marginTop: 12 }}>
              {codeLoading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </div>

        <div className="mcard">
          <div className="card-title">Mon mot de passe</div>
          <p className="card-desc">Modifiez le mot de passe de votre compte gestionnaire.</p>
          <form onSubmit={handlePwdSave}>
            <label className="field-label" htmlFor="cur-pwd">Mot de passe actuel</label>
            <PasswordInput id="cur-pwd" value={curPwd} onChange={v => { setCurPwd(v); setPwdErr(''); setPwdSuccess(false); }} placeholder="Mot de passe actuel" autoComplete="current-password" />
            <label className="field-label" htmlFor="new-pwd" style={{ marginTop: 10 }}>Nouveau mot de passe</label>
            <PasswordInput id="new-pwd" value={newPwd} onChange={v => { setNewPwd(v); setPwdErr(''); setPwdSuccess(false); }} placeholder="Min. 6 caractères" autoComplete="new-password" />
            <label className="field-label" htmlFor="confirm-pwd" style={{ marginTop: 10 }}>Confirmer le mot de passe</label>
            <PasswordInput id="confirm-pwd" value={confirmPwd} onChange={v => { setConfirmPwd(v); setPwdErr(''); setPwdSuccess(false); }} placeholder="Confirmer" autoComplete="new-password" />
            {pwdErr && <div className="field-err">{pwdErr}</div>}
            {pwdSuccess && <div className="field-ok">Mot de passe modifié ✓</div>}
            <button type="submit" className="btn-primary" disabled={pwdLoading || !curPwd || !newPwd || !confirmPwd} style={{ marginTop: 12 }}>
              {pwdLoading ? 'Modification…' : 'Modifier'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Section Gestionnaires ──────────────────────────────────────────────────────

const DELETE_DELAY = 3000;

function SectionGestionnaires({ showToast }) {
  const [list, setList]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showNew, setShowNew]       = useState(false);
  const [newErr, setNewErr]         = useState('');
  const [newForm, setNewForm]       = useState({ nom: '', email: '', password: '' });
  const [newPwdConf, setNewPwdConf] = useState('');
  const [creating, setCreating]     = useState(false);

  const [editId, setEditId]         = useState(null);
  const [editForm, setEditForm]     = useState({ nom: '', email: '' });
  const [editErr, setEditErr]       = useState('');
  const [saving, setSaving]         = useState(false);

  const [confirm, setConfirm]       = useState(null);
  const timerRef                    = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    getGestionnaires().then(setList).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleCreate = useCallback(async (e) => {
    e.preventDefault();
    setNewErr('');
    if (newForm.password !== newPwdConf) { setNewErr('Les mots de passe ne correspondent pas'); return; }
    setCreating(true);
    try {
      await createGestionnaire(newForm);
      showToast(`Compte "${newForm.nom}" créé`, 'success');
      setNewForm({ nom: '', email: '', password: '' });
      setNewPwdConf('');
      load();
      setTimeout(() => setShowNew(false), 900);
    } catch (err) {
      setNewErr(err.message || 'Erreur');
    } finally {
      setCreating(false);
    }
  }, [newForm, newPwdConf, showToast, load]);

  const startEdit  = useCallback((g) => { setEditId(g.id); setEditForm({ nom: g.nom, email: g.email }); setEditErr(''); }, []);
  const cancelEdit = useCallback(() => { setEditId(null); setEditErr(''); }, []);

  const handleSaveEdit = useCallback(async (e) => {
    e.preventDefault();
    setEditErr('');
    setSaving(true);
    try {
      await updateGestionnaire(editId, editForm);
      showToast('Compte mis à jour', 'success');
      setEditId(null);
      load();
    } catch (err) {
      setEditErr(err.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }, [editId, editForm, showToast, load]);

  const requestDelete = useCallback((id) => {
    if (confirm?.id === id) {
      clearTimeout(timerRef.current);
      setConfirm(null);
      deleteGestionnaire(id)
        .then(() => { showToast('Compte supprimé', 'success'); load(); })
        .catch(err => showToast(err.message || 'Erreur suppression', 'error'));
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirm({ id });
      timerRef.current = setTimeout(() => setConfirm(null), DELETE_DELAY);
    }
  }, [confirm, showToast, load]);

  return (
    <div className="sec-body">
      <div className="sec-s-row">
        <div>
          <h2 className="sec-title" style={{ margin: 0 }}>Gestionnaires</h2>
          <p className="sec-desc" style={{ margin: 0 }}>Comptes administrateurs de l'application.</p>
        </div>
        <button className="btn-primary" onClick={() => { setShowNew(v => !v); setNewErr(''); }}>
          {showNew ? '× Annuler' : '+ Nouveau gestionnaire'}
        </button>
      </div>

      {showNew && (
        <form className="new-mgr-form" onSubmit={handleCreate}>
          <div className="fld">
            <label className="field-label">Nom</label>
            <input className="form-input" value={newForm.nom} onChange={e => setNewForm(f => ({ ...f, nom: e.target.value }))} placeholder="Nom complet" required />
          </div>
          <div className="fld">
            <label className="field-label">Email</label>
            <input type="email" className="form-input" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} placeholder="email@chu.fr" required />
          </div>
          <div className="fld">
            <label className="field-label">Mot de passe</label>
            <PasswordInput value={newForm.password} onChange={v => setNewForm(f => ({ ...f, password: v }))} placeholder="Min. 6 caractères" />
          </div>
          <div className="fld">
            <label className="field-label">Confirmer</label>
            <PasswordInput value={newPwdConf} onChange={setNewPwdConf} placeholder="Confirmer" />
          </div>
          {newErr && <div className="field-err new-mgr-err">{newErr}</div>}
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? 'Création…' : 'Créer le compte'}
          </button>
        </form>
      )}

      <div className="table-wrap">
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>Chargement…</p>
        ) : list.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>Aucun gestionnaire enregistré.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Créé le</th>
                <th className="row-actions-hdr">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(g => {
                const isEditing    = editId === g.id;
                const isPendingDel = confirm?.id === g.id;
                return (
                  <>
                    <tr key={g.id} className={`trow-hover${isPendingDel ? ' tr-delete' : ''}`}>
                      <td>{g.nom}</td>
                      <td>{g.email}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{g.created_at ? g.created_at.slice(0, 10) : '—'}</td>
                      <td className="row-actions">
                        <button className="btn-xs" onClick={() => isEditing ? cancelEdit() : startEdit(g)}>
                          {isEditing ? 'Annuler' : 'Modifier'}
                        </button>
                        <button className={`btn-xs bdanger${isPendingDel ? ' bconfirm' : ''}`} onClick={() => requestDelete(g.id)} title={isPendingDel ? 'Cliquer pour confirmer' : 'Supprimer'}>
                          {isPendingDel ? 'Confirmer ?' : 'Supprimer'}
                        </button>
                      </td>
                    </tr>
                    {isEditing && (
                      <tr key={`edit-${g.id}`} className="tr-inline-edit">
                        <td colSpan={4}>
                          <form className="inline-edit-bar" onSubmit={handleSaveEdit}>
                            <div className="fld">
                              <label className="field-label">Nom</label>
                              <input className="form-input" value={editForm.nom} onChange={e => setEditForm(f => ({ ...f, nom: e.target.value }))} required />
                            </div>
                            <div className="fld">
                              <label className="field-label">Email</label>
                              <input type="email" className="form-input" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} required />
                            </div>
                            {editErr && <div className="field-err">{editErr}</div>}
                            <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
                              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
                              <button type="button" className="btn-xs" onClick={cancelEdit}>Annuler</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Section Fermetures de service ─────────────────────────────────────────────

const POSTES_SELECTABLE = POSTES.filter(p => !p.intern);

function fermeturePeriod(f) {
  const fmt = iso => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
  return `du ${fmt(f.date_debut)} au ${fmt(f.date_fin)}`;
}

function SectionFermetures({ showToast, onReload }) {
  const [list, setList]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showNew, setShowNew]   = useState(false);
  const [newErr, setNewErr]     = useState('');
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm]   = useState({ poste_id: '', debut: null, fin: null, label: '' });

  const [editId, setEditId]     = useState(null);
  const [editForm, setEditForm] = useState({ poste_id: '', debut: null, fin: null, label: '' });
  const [editErr, setEditErr]   = useState('');
  const [saving, setSaving]     = useState(false);

  const [confirm, setConfirm]   = useState(null);
  const timerRef                = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    getFermetures().then(setList).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleCreate = useCallback(async (e) => {
    e.preventDefault();
    setNewErr('');
    if (!newForm.poste_id)          { setNewErr('Sélectionnez un service'); return; }
    if (!newForm.debut || !newForm.fin) { setNewErr('Sélectionnez une période complète (début et fin)'); return; }
    setCreating(true);
    try {
      await createFermeture({ poste_id: newForm.poste_id, date_debut: newForm.debut, date_fin: newForm.fin, label: newForm.label || null });
      showToast('Fermeture enregistrée', 'success');
      setNewForm({ poste_id: '', debut: null, fin: null, label: '' });
      setShowNew(false);
      load();
      onReload?.();
    } catch (err) {
      setNewErr(err.message || 'Erreur');
    } finally {
      setCreating(false);
    }
  }, [newForm, showToast, load, onReload]);

  const startEdit  = useCallback((f) => {
    setEditId(f.id);
    setEditForm({ poste_id: f.poste_id, debut: f.date_debut, fin: f.date_fin, label: f.label || '' });
    setEditErr('');
  }, []);
  const cancelEdit = useCallback(() => { setEditId(null); setEditErr(''); }, []);

  const handleSaveEdit = useCallback(async (e) => {
    e.preventDefault();
    setEditErr('');
    if (!editForm.debut || !editForm.fin) { setEditErr('Période incomplète'); return; }
    setSaving(true);
    try {
      await updateFermeture(editId, { poste_id: editForm.poste_id, date_debut: editForm.debut, date_fin: editForm.fin, label: editForm.label || null });
      showToast('Fermeture modifiée', 'success');
      setEditId(null);
      load();
      onReload?.();
    } catch (err) {
      setEditErr(err.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }, [editId, editForm, showToast, load, onReload]);

  const requestDelete = useCallback((id) => {
    if (confirm?.id === id) {
      clearTimeout(timerRef.current);
      setConfirm(null);
      deleteFermeture(id)
        .then(() => { showToast('Fermeture supprimée', 'success'); load(); onReload?.(); })
        .catch(err => showToast(err.message || 'Erreur', 'error'));
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirm({ id });
      timerRef.current = setTimeout(() => setConfirm(null), DELETE_DELAY);
    }
  }, [confirm, showToast, load, onReload]);

  const [showArchives, setShowArchives] = useState(false);

  const todayStr   = new Date().toISOString().split('T')[0];
  const posteLbl   = id => POSTES.find(p => p.id === id)?.lbl ?? id;
  const posteColor = id => POSTES.find(p => p.id === id)?.c   ?? 'var(--text2)';

  return (
    <div className="sec-body">
      <div className="sec-s-row">
        <div>
          <h2 className="sec-title" style={{ margin: 0 }}>Fermetures de service</h2>
          <p className="sec-desc" style={{ margin: 0 }}>
            Périodes où un service est fermé — les cellules correspondantes sont grisées dans le planning.
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setShowNew(v => !v); setNewErr(''); }}>
          {showNew ? '× Annuler' : '+ Ajouter'}
        </button>
      </div>

      {/* Formulaire ajout */}
      {showNew && (
        <form className="new-mgr-form" onSubmit={handleCreate}>
          <div className="fld">
            <label className="field-label">Service</label>
            <select
              className="form-input"
              value={newForm.poste_id}
              onChange={e => setNewForm(f => ({ ...f, poste_id: e.target.value }))}
            >
              <option value="">— Choisir un service —</option>
              {POSTES_SELECTABLE.map(p => (
                <option key={p.id} value={p.id}>{p.lbl}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="field-label">Période de fermeture</label>
            <DateRangePicker
              debut={newForm.debut}
              fin={newForm.fin}
              onChange={({ debut, fin }) => setNewForm(f => ({ ...f, debut, fin }))}
            />
          </div>
          <div className="fld">
            <label className="field-label">
              Motif <span style={{ fontWeight:400, color:'var(--text3)' }}>(optionnel)</span>
            </label>
            <input
              className="form-input"
              value={newForm.label}
              onChange={e => setNewForm(f => ({ ...f, label: e.target.value }))}
              placeholder="Ex : Fermeture estivale"
              maxLength={120}
            />
          </div>
          {newErr && <div className="field-err new-mgr-err">{newErr}</div>}
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}

      {/* Tableau */}
      {(() => {
        if (loading) return <p style={{ fontSize:13, color:'var(--text3)', padding:'12px 0' }}>Chargement…</p>;

        const actives  = list.filter(f => f.date_fin >= todayStr);
        const archives = list.filter(f => f.date_fin <  todayStr);

        function renderRows(rows, isArchive = false) {
          return rows.map(f => {
            const isEditing    = editId === f.id;
            const isPendingDel = confirm?.id === f.id;
            return (
              <>
                <tr key={f.id} className={`trow-hover${isPendingDel ? ' tr-delete' : ''}`}>
                  <td>
                    <span style={{ fontWeight:600, color: posteColor(f.poste_id) }}>
                      {posteLbl(f.poste_id)}
                    </span>
                  </td>
                  <td style={{ fontSize:12, whiteSpace:'nowrap' }}>
                    {fermeturePeriod(f)}
                  </td>
                  <td style={{ fontSize:12, color:'var(--text3)' }}>
                    {f.label || <em style={{ opacity:.5 }}>—</em>}
                  </td>
                  <td className="row-actions">
                    {!isArchive && (
                      <button className="btn-xs" onClick={() => isEditing ? cancelEdit() : startEdit(f)}>
                        {isEditing ? 'Annuler' : 'Modifier'}
                      </button>
                    )}
                    <button
                      className={`btn-xs bdanger${isPendingDel ? ' bconfirm' : ''}`}
                      onClick={() => requestDelete(f.id)}
                      title={isPendingDel ? 'Cliquer pour confirmer' : 'Supprimer'}
                    >
                      {isPendingDel ? 'Confirmer ?' : 'Supprimer'}
                    </button>
                  </td>
                </tr>
                {isEditing && (
                  <tr key={`edit-${f.id}`} className="tr-inline-edit">
                    <td colSpan={4}>
                      <form className="inline-edit-bar" onSubmit={handleSaveEdit}>
                        <div className="fld">
                          <label className="field-label">Service</label>
                          <select
                            className="form-input"
                            value={editForm.poste_id}
                            onChange={e => setEditForm(f => ({ ...f, poste_id: e.target.value }))}
                          >
                            {POSTES_SELECTABLE.map(p => (
                              <option key={p.id} value={p.id}>{p.lbl}</option>
                            ))}
                          </select>
                        </div>
                        <div className="fld">
                          <label className="field-label">Période</label>
                          <DateRangePicker
                            debut={editForm.debut}
                            fin={editForm.fin}
                            onChange={({ debut, fin }) => setEditForm(f => ({ ...f, debut, fin }))}
                          />
                        </div>
                        <div className="fld">
                          <label className="field-label">Motif</label>
                          <input
                            className="form-input"
                            value={editForm.label}
                            onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                            maxLength={120}
                          />
                        </div>
                        {editErr && <div className="field-err">{editErr}</div>}
                        <div style={{ display:'flex', gap:8, alignSelf:'flex-end' }}>
                          <button type="submit" className="btn-primary" disabled={saving}>
                            {saving ? 'Enregistrement…' : 'Enregistrer'}
                          </button>
                          <button type="button" className="btn-xs" onClick={cancelEdit}>Annuler</button>
                        </div>
                      </form>
                    </td>
                  </tr>
                )}
              </>
            );
          });
        }

        const tableHead = (
          <thead>
            <tr>
              <th>Service</th>
              <th>Période</th>
              <th>Motif</th>
              <th className="row-actions-hdr">Actions</th>
            </tr>
          </thead>
        );

        return (
          <>
            {/* Fermetures actives / à venir */}
            <div className="table-wrap">
              {actives.length === 0 ? (
                <p style={{ fontSize:13, color:'var(--text3)', padding:'12px 0' }}>
                  Aucune fermeture en cours ou à venir. Utilisez le bouton « Ajouter » pour en créer une.
                </p>
              ) : (
                <table className="data-table">
                  {tableHead}
                  <tbody>{renderRows(actives)}</tbody>
                </table>
              )}
            </div>

            {/* Archives (périodes passées) */}
            {archives.length > 0 && (
              <div style={{ marginTop:16 }}>
                <button
                  type="button"
                  onClick={() => setShowArchives(v => !v)}
                  style={{
                    display:'flex', alignItems:'center', gap:8, width:'100%',
                    padding:'8px 12px', borderRadius:'var(--r)',
                    border:'1px solid var(--border2)',
                    background: showArchives ? 'var(--surface2)' : 'transparent',
                    cursor:'pointer', fontFamily:'inherit', fontSize:12,
                    color:'var(--text3)', fontWeight:600, letterSpacing:'.02em',
                    transition:'background .1s',
                  }}
                  onMouseEnter={e => { if (!showArchives) e.currentTarget.style.background = 'var(--surface2)'; }}
                  onMouseLeave={e => { if (!showArchives) e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg
                    width="11" height="11" viewBox="0 0 10 10" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transition:'transform .15s', transform: showArchives ? 'rotate(180deg)' : 'none', flexShrink:0 }}
                  >
                    <path d="M2 3.5 5 6.5 8 3.5"/>
                  </svg>
                  Archives — {archives.length} fermeture{archives.length > 1 ? 's' : ''} passée{archives.length > 1 ? 's' : ''}
                </button>

                {showArchives && (
                  <div className="table-wrap" style={{ marginTop:6, opacity:.7 }}>
                    <table className="data-table">
                      {tableHead}
                      <tbody>{renderRows(archives, true)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'identifiants',  label: 'Identifiants',          Icon: IcoLock     },
  { id: 'gestionnaires', label: 'Gestionnaires',          Icon: IcoUsers    },
  { id: 'fermetures',    label: 'Fermetures de service',  Icon: IcoCalendar },
];

export default function SettingsTab({ showToast, onFermeturesChange }) {
  const [section, setSection] = useState('identifiants');

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Navigation paramètres">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`settings-nav-item${section === id ? ' active' : ''}`}
            onClick={() => setSection(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="settings-content">
        {section === 'identifiants'  && <SectionIdentifiants  showToast={showToast} />}
        {section === 'gestionnaires' && <SectionGestionnaires showToast={showToast} />}
        {section === 'fermetures'    && <SectionFermetures    showToast={showToast} onReload={onFermeturesChange} />}
      </div>
    </div>
  );
}
