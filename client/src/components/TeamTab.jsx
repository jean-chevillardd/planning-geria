// components/TeamTab.jsx
import { useState, useEffect, useRef } from 'react';
import { TYPE_LBL, DAYS_FR, countDemiJournees } from '../utils';
import * as api from '../api';

const GROUPS = [
  { key:'ph',      label:'Praticiens hospitaliers', color:'#2272f0' },
  { key:'ipa',     label:'IPA',                     color:'#1D9E75' },
  { key:'interne', label:'Internes',                color:'#ea580c' },
  { key:'externe', label:'Externes',                color:'#6366f1' },
  { key:'padhue',  label:'PADHUE',                  color:'#d97706' },
];

export default function TeamTab({ medecins, isSecretary, onReload, onToast, onPushUndo = () => {} }) {
  const [modal,      setModal]      = useState(null); // null | { mode:'add'|'edit', med?:object }
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState(null); // null = tous, ou clé de groupe

  // ── Filtrage par nom + type ───────────────────────────
  const q = search.trim().toLowerCase();
  const filtered = medecins
    .filter(m => !q || m.nom.toLowerCase().includes(q))
    .filter(m => !typeFilter || m.type === typeFilter);

  // ── Actions ───────────────────────────────────────────
  async function handleSched(med, idx, val) {
    const oldSched = [...med.sched];
    const newSched = [...med.sched];
    newSched[idx] = val ? 1 : 0;
    try {
      await api.updateMedecin(med.id, { sched: newSched });
      const medId = med.id;
      onPushUndo('Mise à jour présences', async () => { await api.updateMedecin(medId, { sched: oldSched }); onReload(); });
      onReload();
      onToast('Planning mis à jour');
    } catch(e) {
      onToast(e.message || 'Erreur lors de la mise à jour', 'err');
    }
  }

  async function handleDelete(med) {
    if (!confirm(`Supprimer ${med.nom} ? Toutes ses affectations seront retirées.`)) return;
    try {
      await api.deleteMedecin(med.id);
      onReload();
      onToast(`${med.nom} supprimé(e)`);
    } catch(e) {
      onToast(e.message || 'Erreur lors de la suppression', 'err');
    }
  }

  return (
    <div>
      {/* ── Barre du haut ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div className="sec-t">Équipe &amp; présences</div>
        {isSecretary && (
          <button className="btn-primary" onClick={() => setModal({ mode:'add' })}>+ Ajouter un personnel</button>
        )}
      </div>

      {/* ── Recherche ── */}
      <div style={{ marginBottom:14, position:'relative' }}>
        <input
          className="team-search"
          type="text"
          placeholder="Rechercher par nom ou prénom…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:14, lineHeight:1 }}>
            ×
          </button>
        )}
      </div>

      {/* ── Filtres par type ── */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:14, alignItems:'center' }}>
        {GROUPS.map(g => {
          const active = typeFilter === g.key;
          const count  = medecins.filter(m => m.type === g.key).length;
          return (
            <button
              key={g.key}
              onClick={() => setTypeFilter(active ? null : g.key)}
              title={active ? 'Cliquer pour tout réafficher' : `${count} personnel(s)`}
              style={{
                display:'inline-flex', alignItems:'center', gap:5,
                padding:'4px 11px',
                border:`1.5px solid ${g.color}`,
                borderRadius:20,
                fontSize:10,
                fontFamily:'system-ui,-apple-system,sans-serif',
                fontWeight:700,
                letterSpacing:'.04em',
                cursor:'pointer',
                transition:'background .12s, color .12s',
                background: active ? g.color : 'transparent',
                color:      active ? '#fff'   : g.color,
                outline:'none',
              }}
            >
              <span style={{
                width:7, height:7, borderRadius:'50%', flexShrink:0,
                background: active ? 'rgba(255,255,255,.75)' : g.color,
              }} />
              {g.label}
              <span style={{
                marginLeft:2, opacity:.75,
                background: active ? 'rgba(255,255,255,.2)' : g.color+'22',
                color:      active ? '#fff' : g.color,
                borderRadius:10, padding:'0 5px', fontSize:9,
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      <p style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--text2)', marginBottom:14, lineHeight:1.6 }}>
        Cochez les demi-journées habituellement travaillées. Le taux de présence est calculé automatiquement.
      </p>

      {/* ── Résultat de recherche vide ── */}
      {filtered.length === 0 && (q || typeFilter) && (
        <p className="empty-msg">
          Aucun praticien trouvé{q ? ` pour « ${search} »` : ''}{typeFilter && q ? ' dans cette catégorie' : typeFilter ? ' dans cette catégorie' : ''}.
        </p>
      )}

      {/* ── Groupes ── */}
      {GROUPS.map(g => {
        const list = filtered.filter(m => m.type === g.key);
        if (!list.length) return null;
        return (
          <div key={g.key}>
            <div className="sec-s">{g.label}</div>
            <div className="tgrid">
              {list.map(m => (
                <MedCard key={m.id} med={m}
                  isSecretary={isSecretary}
                  onSchedChange={(idx, val) => handleSched(m, idx, val)}
                  onEdit={() => setModal({ mode:'edit', med:m })}
                  onDelete={() => handleDelete(m)} />
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Modal ajout / modification ── */}
      {modal && (
        <PersonnelModal
          mode={modal.mode}
          med={modal.med}
          onClose={() => setModal(null)}
          onToast={onToast}
          onSave={async (data) => {
            try {
              if (modal.mode === 'add') {
                const newMed = await api.addMedecin(data);
                onPushUndo('Ajout personnel', async () => { await api.deleteMedecin(newMed.id); onReload(); });
              } else {
                const oldData = { nom: modal.med.nom, type: modal.med.type, sched: [...modal.med.sched] };
                const medId = modal.med.id;
                await api.updateMedecin(medId, data);
                onPushUndo('Modification personnel', async () => { await api.updateMedecin(medId, oldData); onReload(); });
              }
              setModal(null);
              onReload();
              onToast(modal.mode === 'add' ? 'Personnel ajouté' : 'Modifications enregistrées');
            } catch(e) {
              onToast(e.message || 'Erreur lors de l\'enregistrement', 'err');
            }
          }}
        />
      )}
    </div>
  );
}

// ── Carte praticien ───────────────────────────────────────
function MedCard({ med, isSecretary, onSchedChange, onEdit, onDelete }) {
  const dj  = countDemiJournees(med);
  const pct = Math.round(dj / 10 * 100);
  const rows = ['Matin', 'Après-midi'];

  return (
    <div className="mcard">
      <div className="mc-name">{med.nom}</div>
      <div className="mc-type">{TYPE_LBL[med.type]}</div>
      <div className="mc-presence">Présence : <strong>{dj}/10 demi-journées ({pct}%)</strong></div>
      <div className="schedule-grid">
        <div></div>
        {DAYS_FR.map(d => <div key={d} className="sg-head">{d}</div>)}
        {rows.map((rl, ri) => (
          <div key={rl} style={{ display:'contents' }}>
            <div className="sg-label">{rl}</div>
            {DAYS_FR.map((_, di) => {
              const idx = di * 2 + ri;
              return (
                <div key={di} className="sg-cell">
                  <input type="checkbox" checked={!!med.sched[idx]}
                    onChange={e => isSecretary && onSchedChange(idx, e.target.checked)}
                    readOnly={!isSecretary}
                    style={{ cursor: isSecretary ? 'pointer' : 'default' }} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {isSecretary && (
        <div className="mc-actions">
          <button className="btn-sm" onClick={onEdit}>✎ Modifier</button>
          <button className="btn-sm danger" onClick={onDelete}>🗑 Supprimer</button>
        </div>
      )}
    </div>
  );
}

// ── Modal ajout / édition ─────────────────────────────────
function PersonnelModal({ mode, med, onClose, onSave, onToast }) {
  const [nom,   setNom]   = useState(med?.nom  || '');
  const [type,  setType]  = useState(med?.type || 'ph');
  const [sched, setSched] = useState(
    med?.sched ? [...med.sched] : Array(10).fill(1)
  );

  const dj  = sched.filter(Boolean).length;
  const pct = Math.round(dj / 10 * 100);
  const rows = ['Matin', 'Après-midi'];

  function toggleSched(idx) {
    setSched(s => { const n = [...s]; n[idx] = n[idx] ? 0 : 1; return n; });
  }

  function handleSubmit() {
    if (!nom.trim()) { onToast('Le nom est requis', 'err'); return; }
    onSave({ nom: nom.trim(), type, sched });
  }

  // Ref pour accéder à la version fraîche de handleSubmit sans stale closure
  const submitRef = useRef(handleSubmit);
  submitRef.current = handleSubmit;

  // Esc → fermer · Entrée → enregistrer (hors boutons et checkboxes)
  useEffect(() => {
    function h(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Enter' && !e.target.matches('button, input[type="checkbox"]')) {
        e.preventDefault();
        submitRef.current();
      }
    }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="mbg open" onClick={e => e.target.classList.contains('mbg') && onClose()}>
      <div className="mbox" style={{ width:400, maxHeight:580 }}>
        <div className="mhead">
          <div className="mttl">{mode === 'add' ? 'Ajouter un personnel' : 'Modifier'}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>

        {/* Nom */}
        <div className="form-row">
          <label>Nom / Prénom</label>
          <input type="text" value={nom} onChange={e => setNom(e.target.value)}
            placeholder="Ex. Dr Martin Pierre" autoFocus />
        </div>

        {/* Type */}
        <div className="form-row">
          <label>Type</label>
          <select value={type} onChange={e => setType(e.target.value)}>
            {Object.entries(TYPE_LBL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Journées travaillées */}
        <div className="form-row">
          <label>Journées travaillées — {dj}/10 demi-journées ({pct}%)</label>
          <div className="modal-sched">
            <div className="schedule-grid">
              <div></div>
              {DAYS_FR.map(d => <div key={d} className="sg-head">{d}</div>)}
              {rows.map((rl, ri) => (
                <div key={rl} style={{ display:'contents' }}>
                  <div className="sg-label">{rl}</div>
                  {DAYS_FR.map((_, di) => {
                    const idx = di * 2 + ri;
                    return (
                      <div key={di} className="sg-cell">
                        <input type="checkbox" checked={!!sched[idx]}
                          onChange={() => toggleSched(idx)} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, marginTop:6 }}>
            <button className="btn-sm" onClick={() => setSched(Array(10).fill(1))}>Temps plein</button>
            <button className="btn-sm" onClick={() => setSched(Array(10).fill(0))}>Tout effacer</button>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={handleSubmit}>
            {mode === 'add' ? 'Ajouter' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
