import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getTeamCode, updateTeamCode, changePassword,
  getGestionnaires, createGestionnaire, updateGestionnaire, deleteGestionnaire,
  getAuditLog,
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

function IcoClock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
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

// ── Sous-composants ────────────────────────────────────────────────────────────

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

// ── Section Identifiants ───────────────────────────────────────────────────────

function SectionIdentifiants({ showToast }) {
  // --- Code équipe ---
  const [teamCode, setTeamCode]         = useState('');
  const [newCode, setNewCode]           = useState('');
  const [codeLoading, setCodeLoading]   = useState(false);
  const [codeErr, setCodeErr]           = useState('');
  const [codeSuccess, setCodeSuccess]   = useState(false);

  // --- Mot de passe ---
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
        {/* Card — Code équipe */}
        <div className="mcard">
          <div className="card-title">Code équipe</div>
          <p className="card-desc">
            Ce code permet aux praticiens de se connecter en lecture seule.
          </p>
          <form onSubmit={handleCodeSave}>
            <label className="field-label" htmlFor="team-code">Code d'accès</label>
            <PasswordInput
              id="team-code"
              value={newCode}
              onChange={v => { setNewCode(v); setCodeErr(''); setCodeSuccess(false); }}
              placeholder="Code équipe"
              autoComplete="off"
            />
            {codeErr && <div className="field-err">{codeErr}</div>}
            {codeSuccess && <div className="field-ok">Code mis à jour ✓</div>}
            <button
              type="submit"
              className="btn-primary"
              disabled={codeLoading || !codeChanged}
              style={{ marginTop: 12 }}
            >
              {codeLoading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </div>

        {/* Card — Mon mot de passe */}
        <div className="mcard">
          <div className="card-title">Mon mot de passe</div>
          <p className="card-desc">
            Modifiez le mot de passe de votre compte gestionnaire.
          </p>
          <form onSubmit={handlePwdSave}>
            <label className="field-label" htmlFor="cur-pwd">Mot de passe actuel</label>
            <PasswordInput
              id="cur-pwd"
              value={curPwd}
              onChange={v => { setCurPwd(v); setPwdErr(''); setPwdSuccess(false); }}
              placeholder="Mot de passe actuel"
              autoComplete="current-password"
            />

            <label className="field-label" htmlFor="new-pwd" style={{ marginTop: 10 }}>Nouveau mot de passe</label>
            <PasswordInput
              id="new-pwd"
              value={newPwd}
              onChange={v => { setNewPwd(v); setPwdErr(''); setPwdSuccess(false); }}
              placeholder="Min. 6 caractères"
              autoComplete="new-password"
            />

            <label className="field-label" htmlFor="confirm-pwd" style={{ marginTop: 10 }}>Confirmer le mot de passe</label>
            <PasswordInput
              id="confirm-pwd"
              value={confirmPwd}
              onChange={v => { setConfirmPwd(v); setPwdErr(''); setPwdSuccess(false); }}
              placeholder="Confirmer"
              autoComplete="new-password"
            />

            {pwdErr && <div className="field-err">{pwdErr}</div>}
            {pwdSuccess && <div className="field-ok">Mot de passe modifié ✓</div>}
            <button
              type="submit"
              className="btn-primary"
              disabled={pwdLoading || !curPwd || !newPwd || !confirmPwd}
              style={{ marginTop: 12 }}
            >
              {pwdLoading ? 'Modification…' : 'Modifier'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Section Gestionnaires (F3) ────────────────────────────────────────────────

const DELETE_DELAY = 3000;

function SectionGestionnaires({ showToast }) {
  const [list, setList]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showNew, setShowNew]       = useState(false);
  const [newErr, setNewErr]         = useState('');
  const [newForm, setNewForm]       = useState({ nom: '', email: '', password: '' });
  const [newPwdConf, setNewPwdConf] = useState('');
  const [creating, setCreating]     = useState(false);

  // Édition inline : id de la ligne en cours d'édition
  const [editId, setEditId]         = useState(null);
  const [editForm, setEditForm]     = useState({ nom: '', email: '' });
  const [editErr, setEditErr]       = useState('');
  const [saving, setSaving]         = useState(false);

  // Suppression : { id, timer }
  const [confirm, setConfirm]       = useState(null);
  const timerRef                    = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    getGestionnaires()
      .then(setList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Nettoyage timer à l'unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // ── Créer un gestionnaire ──────────────────────────────
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

  // ── Lancer l'édition inline ────────────────────────────
  const startEdit = useCallback((g) => {
    setEditId(g.id);
    setEditForm({ nom: g.nom, email: g.email });
    setEditErr('');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditId(null);
    setEditErr('');
  }, []);

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

  // ── Suppression avec confirmation 3 s ─────────────────
  const requestDelete = useCallback((id) => {
    if (confirm?.id === id) {
      // 2ème clic : confirmer
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
        <button
          className="btn-xs bsec"
          onClick={() => { setShowNew(v => !v); setNewErr(''); }}
        >
          {showNew ? '× Annuler' : '+ Nouveau gestionnaire'}
        </button>
      </div>

      {/* Formulaire nouveau gestionnaire (toggle) */}
      {showNew && (
        <form className="new-mgr-form" onSubmit={handleCreate}>
          <div className="fld">
            <label className="field-label">Nom</label>
            <input
              className="form-input"
              value={newForm.nom}
              onChange={e => setNewForm(f => ({ ...f, nom: e.target.value }))}
              placeholder="Nom complet"
              required
            />
          </div>
          <div className="fld">
            <label className="field-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={newForm.email}
              onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
              placeholder="email@chu.fr"
              required
            />
          </div>
          <div className="fld">
            <label className="field-label">Mot de passe</label>
            <PasswordInput
              value={newForm.password}
              onChange={v => setNewForm(f => ({ ...f, password: v }))}
              placeholder="Min. 6 caractères"
            />
          </div>
          <div className="fld">
            <label className="field-label">Confirmer</label>
            <PasswordInput
              value={newPwdConf}
              onChange={setNewPwdConf}
              placeholder="Confirmer"
            />
          </div>
          {newErr && <div className="field-err new-mgr-err">{newErr}</div>}
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? 'Création…' : 'Créer le compte'}
          </button>
        </form>
      )}

      {/* Tableau */}
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
                    <tr
                      key={g.id}
                      className={`trow-hover${isPendingDel ? ' tr-delete' : ''}`}
                    >
                      <td>{g.nom}</td>
                      <td>{g.email}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>
                        {g.created_at ? g.created_at.slice(0, 10) : '—'}
                      </td>
                      <td className="row-actions">
                        <button
                          className="btn-xs bsec"
                          onClick={() => isEditing ? cancelEdit() : startEdit(g)}
                        >
                          {isEditing ? 'Annuler' : 'Modifier'}
                        </button>
                        <button
                          className={`btn-xs bdanger${isPendingDel ? ' bconfirm' : ''}`}
                          onClick={() => requestDelete(g.id)}
                          title={isPendingDel ? 'Cliquer pour confirmer' : 'Supprimer'}
                        >
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
                              <input
                                className="form-input"
                                value={editForm.nom}
                                onChange={e => setEditForm(f => ({ ...f, nom: e.target.value }))}
                                required
                              />
                            </div>
                            <div className="fld">
                              <label className="field-label">Email</label>
                              <input
                                type="email"
                                className="form-input"
                                value={editForm.email}
                                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                                required
                              />
                            </div>
                            {editErr && <div className="field-err">{editErr}</div>}
                            <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
                              <button type="submit" className="btn-primary" disabled={saving}>
                                {saving ? 'Enregistrement…' : 'Enregistrer'}
                              </button>
                              <button type="button" className="btn-xs" onClick={cancelEdit}>
                                Annuler
                              </button>
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

// ── Section Historique (F4) ───────────────────────────────────────────────────

const ACTION_COLORS = {
  CREATE: { bg: '#dcfce7', color: '#15803d' },
  UPDATE: { bg: '#dbeafe', color: '#1d4ed8' },
  DELETE: { bg: '#fee2e2', color: '#b91c1c' },
};

function ActionBadge({ action }) {
  const style = ACTION_COLORS[action] || { bg: '#f3f4f6', color: '#374151' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
      background: style.bg,
      color: style.color,
    }}>
      {action}
    </span>
  );
}

function SvgEmptyLog() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}

function SectionHistorique({ showToast }) {
  const [rows, setRows]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);

  // Filtres en attente (avant "Appliquer")
  const [fAction, setFAction]     = useState('');
  const [fTable, setFTable]       = useState('');
  const [fFrom, setFFrom]         = useState('');
  const [fTo, setFTo]             = useState('');

  // Filtres appliqués
  const [applied, setApplied]     = useState({});

  const hasFilter = Object.values(applied).some(Boolean);
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetch_ = useCallback((params) => {
    setLoading(true);
    getAuditLog(params)
      .then(d => { setRows(d.rows || []); setTotal(d.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch_({ ...applied, page });
  }, [applied, page, fetch_]);

  const applyFilters = () => {
    const f = {};
    if (fAction) f.action = fAction;
    if (fTable)  f.table  = fTable;
    if (fFrom)   f.from   = fFrom;
    if (fTo)     f.to     = fTo;
    setApplied(f);
    setPage(1);
  };

  const clearFilters = () => {
    setFAction(''); setFTable(''); setFFrom(''); setFTo('');
    setApplied({});
    setPage(1);
  };

  return (
    <div className="sec-body">
      <h2 className="sec-title">Historique</h2>
      <p className="sec-desc">Toutes les actions effectuées par les gestionnaires.</p>

      {/* Barre de filtres */}
      <div className="filter-bar">
        <div className="flt-item">
          <label className="field-label">Action</label>
          <select
            className="form-input"
            value={fAction}
            onChange={e => setFAction(e.target.value)}
          >
            <option value="">Toutes</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div className="flt-item">
          <label className="field-label">Table</label>
          <input
            className="form-input"
            value={fTable}
            onChange={e => setFTable(e.target.value)}
            placeholder="ex. medecins"
          />
        </div>
        <div className="flt-item">
          <label className="field-label">Du</label>
          <input
            type="date"
            className="form-input"
            value={fFrom}
            onChange={e => setFFrom(e.target.value)}
          />
        </div>
        <div className="flt-item">
          <label className="field-label">Au</label>
          <input
            type="date"
            className="form-input"
            value={fTo}
            onChange={e => setFTo(e.target.value)}
          />
        </div>
        <div className="flt-item flt-btns">
          <button className="btn-primary" style={{ marginTop: 'auto' }} onClick={applyFilters}>
            Appliquer
          </button>
          {hasFilter && (
            <button
              className="btn-xs"
              style={{ marginTop: 'auto' }}
              onClick={clearFilters}
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      {/* Tableau */}
      <div className="table-wrap">
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>Chargement…</p>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <SvgEmptyLog />
            <span>Aucune entrée{hasFilter ? ' pour ces filtres' : ''}.</span>
          </div>
        ) : (
          <table className="data-table hist-table">
            <colgroup>
              <col style={{ width: 145 }} />
              <col style={{ width: 138 }} />
              <col style={{ width: 82 }} />
              <col style={{ width: 165 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Gestionnaire</th>
                <th>Date</th>
                <th>Action</th>
                <th>Table / id</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr
                  key={r.id}
                  className={`trow-hover${r.action === 'DELETE' ? ' tr-delete' : ''}`}
                >
                  <td>{r.gestionnaire_nom || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {r.created_at ? r.created_at.replace('T', ' ').slice(0, 19) : '—'}
                  </td>
                  <td><ActionBadge action={r.action} /></td>
                  <td style={{ fontSize: 12 }}>
                    {r.table_name}{r.record_id ? ` #${r.record_id}` : ''}
                  </td>
                  <td style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    maxWidth: 260,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {r.payload_after || r.payload_before || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="pagination-bar">
          <span className="pg-info">
            {total} entrée{total > 1 ? 's' : ''}
            {hasFilter && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>· filtre actif</span>}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="btn-xs"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              ‹ Préc.
            </button>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              {page} / {totalPages}
            </span>
            <button
              className="btn-xs"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Suiv. ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'identifiants',  label: 'Identifiants',  Icon: IcoLock  },
  { id: 'gestionnaires', label: 'Gestionnaires', Icon: IcoUsers },
  { id: 'historique',    label: 'Historique',    Icon: IcoClock },
];

export default function SettingsTab({ showToast }) {
  const [section, setSection] = useState('identifiants');

  return (
    <div className="settings-layout">
      {/* ── Sidebar navigation ── */}
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

      {/* ── Contenu de la section ── */}
      <div className="settings-content">
        {section === 'identifiants'  && <SectionIdentifiants  showToast={showToast} />}
        {section === 'gestionnaires' && <SectionGestionnaires showToast={showToast} />}
        {section === 'historique'    && <SectionHistorique    showToast={showToast} />}
      </div>
    </div>
  );
}
