// components/TeamTab.jsx — redesign Équipe & Présences (V1 Cartes Grille)
import { useState, useEffect, useMemo } from 'react';
import * as api from '../api';

const CATS = [
  { id:'ph',        label:'Praticiens Hospitaliers', short:'PH', color:'#2272f0', bg:'#eef3ff' },
  { id:'padhue',    label:'PADHUE',                  short:'PA', color:'#7c3aed', bg:'#f5f0ff' },
  { id:'internes',  label:'Internes',                short:'IN', color:'#ea580c', bg:'#fff4ed' },
  { id:'ipa',       label:'IPA',                     short:'IP', color:'#059669', bg:'#edfdf5' },
  { id:'externes',  label:'Externes',                short:'EX', color:'#0891b2', bg:'#f0fbff' },
  { id:'astreinte', label:"Médecins d'astreinte",    short:'AS', color:'#d97706', bg:'#fffbeb' },
];

const STATUTS = {
  present: { label:'Présent·e', color:'#059669', bg:'#ecfdf5', dot:'#059669' },
  absent:  { label:'Absent·e',  color:'#e11d48', bg:'#fff1f2', dot:'#e11d48' },
  conge:   { label:'En congé',  color:'#d97706', bg:'#fffbeb', dot:'#d97706' },
};

const DAYS_SHORT = ['L', 'Ma', 'Me', 'J', 'V'];
const DAYS_FULL  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

// Maps old singular type keys ↔ new plural category keys
const TYPE_TO_CAT = { ph:'ph', ipa:'ipa', padhue:'padhue', interne:'internes', externe:'externes' };
const CAT_TO_TYPE = { ph:'ph', ipa:'ipa', padhue:'padhue', internes:'interne', externes:'externe', astreinte:'externe' };

function getCat(id) { return CATS.find(c => c.id === id) || CATS[0]; }

// Convert server medecin (flat sched, combined nom, type key) to design shape
function normalizeMedecin(m, localStatuts = {}) {
  const isAstreinte = m.service && m.service !== 'geriatrie';
  const cat = isAstreinte ? 'astreinte' : (TYPE_TO_CAT[m.type] || 'ph');
  const lastSpace = (m.nom || '').lastIndexOf(' ');
  const prenom = lastSpace >= 0 ? m.nom.slice(0, lastSpace) : '';
  const nom    = lastSpace >= 0 ? m.nom.slice(lastSpace + 1) : (m.nom || '');
  const sched  = m.sched || Array(10).fill(0);
  const presence = Array.from({ length: 5 }, (_, i) => [sched[i * 2] || 0, sched[i * 2 + 1] || 0]);
  return {
    id: m.id, prenom, nom, cat,
    service: isAstreinte ? m.service : undefined,
    tel: m.tel,
    statut: isAstreinte ? undefined : (localStatuts[m.id] || 'present'),
    presence: isAstreinte ? undefined : presence,
    // raw fields preserved for API undo
    _rawNom: m.nom, _rawType: m.type, _rawSched: [...sched], _rawService: m.service,
  };
}

// Convert design shape back to API payload
function denormalizeMedecin(data, existingMember) {
  const nom = [data.prenom, data.nom].filter(Boolean).join(' ');
  const type = CAT_TO_TYPE[data.cat] || 'ph';
  const isAstreinte = data.cat === 'astreinte';
  const sched = isAstreinte ? Array(10).fill(0) : data.presence.flat();
  const service = isAstreinte ? (data.service || '') : 'geriatrie';
  return { nom, type, sched, service, tel: existingMember?.tel || '' };
}

// ── Avatar ───────────────────────────────────────────────────
function Avatar({ member, size = 38 }) {
  const cat = getCat(member.cat);
  const initials = ((member.prenom?.[0] || '') + (member.nom?.[0] || '')).toUpperCase() || '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: cat.bg, border: `1.5px solid ${cat.color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.33), fontWeight: 800, color: cat.color,
      fontFamily: 'system-ui,sans-serif', flexShrink: 0, userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

// ── StatusBadge ──────────────────────────────────────────────
function StatusBadge({ statut }) {
  const s = STATUTS[statut];
  if (!s) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20,
      background: s.bg, color: s.color,
      fontSize: 10, fontWeight: 700, fontFamily: 'system-ui,sans-serif', lineHeight: 1.5,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ── PresenceStrips ───────────────────────────────────────────
function PresenceStrips({ presence, color }) {
  const count = presence.flat().reduce((a, b) => a + b, 0);
  const pct   = Math.round(count / 10 * 100);
  return (
    <div style={{ fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ display: 'flex', gap: 4, paddingLeft: 14, marginBottom: 2 }}>
        {DAYS_SHORT.map(d => (
          <div key={d} style={{ width: 16, fontSize: 8, color: 'var(--text3)', textAlign: 'center', fontWeight: 700 }}>{d}</div>
        ))}
      </div>
      {[0, 1].map(pi => (
        <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: pi === 0 ? 2 : 0 }}>
          <div style={{ width: 10, fontSize: 8, color: 'var(--text3)', fontWeight: 700 }}>{pi === 0 ? 'M' : 'A'}</div>
          {presence.map((day, di) => (
            <div key={di} style={{
              width: 16, height: 5, borderRadius: 2,
              background: day[pi] ? `${color}bb` : '#eeecea',
            }} />
          ))}
        </div>
      ))}
      <div style={{ marginTop: 5 }}>
        <div style={{ height: 3, borderRadius: 2, background: '#eeecea', overflow: 'hidden', marginBottom: 2 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `${color}bb`, borderRadius: 2 }} />
        </div>
        <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600 }}>
          {count}/10 demi-journées · {pct}%
        </div>
      </div>
    </div>
  );
}

// ── SummaryBar ───────────────────────────────────────────────
function SummaryBar({ members }) {
  const totals = CATS
    .map(c => ({ ...c, count: members.filter(m => m.cat === c.id).length }))
    .filter(c => c.count > 0);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
      padding: '8px 0 12px', borderBottom: '1px solid var(--border)', marginBottom: 16,
    }}>
      {totals.map(c => (
        <span key={c.id} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 20,
          border: `1px solid ${c.color}44`, background: c.bg,
          fontSize: 10, fontWeight: 700, fontFamily: 'system-ui,sans-serif',
          color: c.color, whiteSpace: 'nowrap',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color }} />
          {c.short} · {c.count}
        </span>
      ))}
      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)', fontFamily: 'system-ui,sans-serif', whiteSpace: 'nowrap' }}>
        {members.length} membre{members.length > 1 ? 's' : ''} au total
      </span>
    </div>
  );
}

// ── V1 Card ──────────────────────────────────────────────────
function V1Card({ member, isSecretary, onEdit, onDelete }) {
  const cat = getCat(member.cat);
  const isAstreinte = member.cat === 'astreinte';
  const [hovered, setHovered] = useState(false);
  const fullName = [member.prenom, member.nom].filter(Boolean).join(' ');
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff', borderRadius: 8, padding: '12px 14px',
        borderTop: `1px solid ${hovered ? cat.color + '44' : 'var(--border)'}`,
        borderRight: `1px solid ${hovered ? cat.color + '44' : 'var(--border)'}`,
        borderBottom: `1px solid ${hovered ? cat.color + '44' : 'var(--border)'}`,
        borderLeft: `3px solid ${cat.color}`,
        boxShadow: hovered
          ? `0 2px 8px ${cat.color}22, 0 1px 3px rgba(0,0,0,.07)`
          : '0 1px 3px rgba(0,0,0,.07)',
        transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
        <Avatar member={member} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, marginBottom: 3, fontFamily: 'system-ui,sans-serif' }}>
            {fullName}
          </div>
          {!isAstreinte && <StatusBadge statut={member.statut} />}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'system-ui,sans-serif', marginBottom: member.service ? 2 : 8, lineHeight: 1.4 }}>
        {cat.label}
      </div>
      {member.service && (
        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'system-ui,sans-serif', marginBottom: 8, lineHeight: 1.4 }}>
          {member.service}
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        {isAstreinte ? (
          <div style={{ fontSize: 9, fontStyle: 'italic', color: 'var(--text3)', fontFamily: 'system-ui,sans-serif', lineHeight: 1.5 }}>
            Astreinte uniquement — pas de planning hebdomadaire fixe.
          </div>
        ) : (
          <PresenceStrips presence={member.presence} color={cat.color} />
        )}
      </div>
      {isSecretary && (
        <div style={{ display: 'flex', gap: 4, marginTop: 8, opacity: hovered ? 1 : 0, transition: 'opacity .15s' }}>
          <button className="btn-sm" onClick={() => onEdit(member)}>✎ Modifier</button>
          <button className="btn-sm danger" onClick={() => onDelete(member)}>🗑 Supprimer</button>
        </div>
      )}
    </div>
  );
}

// ── Section (accordion) ──────────────────────────────────────
function Section({ catId, members, isSecretary, onAdd, onEdit, onDelete }) {
  const [open, setOpen] = useState(true);
  const cat = getCat(catId);
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          padding: '8px 0', borderBottom: '1px solid var(--border)',
          marginBottom: open ? 10 : 0, userSelect: 'none',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 10, fontFamily: 'system-ui,sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: cat.color }}>
          {cat.label}
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'system-ui,sans-serif', fontWeight: 700,
          background: cat.bg, color: cat.color, padding: '1px 7px', borderRadius: 20,
          border: `1px solid ${cat.color}44`,
        }}>
          {members.length}
        </span>
        {isSecretary && (
          <button
            className="btn-sm"
            onClick={e => { e.stopPropagation(); onAdd(catId); }}
            style={{ fontSize: 9, padding: '2px 8px' }}
          >
            + Ajouter
          </button>
        )}
        <span style={{
          fontSize: 14, color: 'var(--text3)',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform .15s', display: 'inline-block', lineHeight: 1,
        }}>›</span>
      </div>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {members.map(m => (
            <V1Card key={m.id} member={m} isSecretary={isSecretary} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── EditModal (slide-in drawer) ──────────────────────────────
function EditModal({ isNew, member, defaultCat, onClose, onSave, onToast }) {
  const [prenom,   setPrenom]   = useState(member?.prenom   || '');
  const [nom,      setNom]      = useState(member?.nom      || '');
  const [cat,      setCat]      = useState(member?.cat      || defaultCat || 'ph');
  const [service,  setService]  = useState(member?.service  || '');
  const [statut,   setStatut]   = useState(member?.statut   || 'present');
  const [presence, setPresence] = useState(
    member?.presence || Array.from({ length: 5 }, () => [1, 1])
  );

  const isAstreinte  = cat === 'astreinte';
  const showService  = cat === 'externes' || cat === 'astreinte';
  const catColor     = getCat(cat).color;
  const presCount    = presence.flat().reduce((a, b) => a + b, 0);

  function togglePresence(di, pi) {
    setPresence(prev => prev.map((d, i) => i === di ? d.map((v, j) => j === pi ? (v ? 0 : 1) : v) : d));
  }

  function handleSave() {
    if (!nom.trim()) { onToast('Le nom est requis', 'err'); return; }
    onSave({ prenom: prenom.trim(), nom: nom.trim(), cat, service: service.trim(), statut, presence });
  }

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(3px)',
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div style={{
        width: 420, height: '100%', background: '#fff',
        boxShadow: '-8px 0 40px rgba(0,0,0,.18)',
        display: 'flex', flexDirection: 'column',
        animation: 'eq-slide-in 220ms ease-out',
        overflow: 'hidden',
      }}>
        {/* Drawer header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'system-ui,sans-serif' }}>
            {isNew ? 'Nouveau membre' : 'Modifier le membre'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text3)', lineHeight: 1, padding: 0 }}>✕</button>
        </div>

        {/* Form body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* Prénom / Nom */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Prénom</label>
              <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Prénom" autoFocus />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Nom</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom" />
            </div>
          </div>

          {/* Catégorie */}
          <div className="form-row">
            <label>Catégorie</label>
            <select value={cat} onChange={e => setCat(e.target.value)}>
              {CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          {/* Service d'origine */}
          {showService && (
            <div className="form-row">
              <label>Service d'origine</label>
              <input type="text" value={service} onChange={e => setService(e.target.value)} placeholder="Ex. Cardiologie" />
            </div>
          )}

          {/* Statut */}
          {!isAstreinte && (
            <div className="form-row">
              <label>Statut</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {Object.entries(STATUTS).map(([key, s]) => (
                  <button
                    key={key}
                    onClick={() => setStatut(key)}
                    style={{
                      flex: 1, padding: '7px 4px', borderRadius: 8, cursor: 'pointer',
                      fontSize: 10, fontFamily: 'system-ui,sans-serif', fontWeight: 700, border: '1.5px solid',
                      borderColor: statut === key ? s.color : 'var(--border)',
                      background: statut === key ? s.bg : 'transparent',
                      color: statut === key ? s.color : 'var(--text3)',
                      transition: 'all .12s',
                    }}
                  >
                    <span style={{ display: 'block', width: 5, height: 5, borderRadius: '50%', background: s.dot, margin: '0 auto 3px' }} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Présence grid */}
          {!isAstreinte && (
            <div className="form-row">
              <label>Présence — {presCount}/10 demi-journées</label>
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(5, 1fr)', gap: 4, marginBottom: 4 }}>
                  <div />
                  {DAYS_FULL.map(d => (
                    <div key={d} style={{ fontSize: 9, fontWeight: 700, textAlign: 'center', color: 'var(--text3)', fontFamily: 'system-ui,sans-serif' }}>{d}</div>
                  ))}
                </div>
                {['Matin', 'Après-midi'].map((period, pi) => (
                  <div key={period} style={{ display: 'grid', gridTemplateColumns: '52px repeat(5, 1fr)', gap: 4, marginBottom: 4 }}>
                    <div style={{ fontSize: 9, color: 'var(--text2)', display: 'flex', alignItems: 'center', fontFamily: 'system-ui,sans-serif' }}>{period}</div>
                    {presence.map((day, di) => (
                      <button
                        key={di}
                        onClick={() => togglePresence(di, pi)}
                        style={{
                          height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: day[pi] ? catColor : '#e8e6df',
                          transition: 'background .1s',
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn-cancel" onClick={onClose} style={{ flex: 1 }}>Annuler</button>
          <button className="btn-primary" onClick={handleSave} style={{ flex: 2 }}>
            {isNew ? 'Créer le membre' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────
export default function TeamTab({ medecins, isSecretary, onReload, onToast, onPushUndo = () => {} }) {
  const [localStatuts, setLocalStatuts] = useState({});
  const [modal,  setModal]  = useState(null); // null | { isNew, member?, defaultCat? }
  const [search, setSearch] = useState('');

  const members = useMemo(
    () => medecins.map(m => normalizeMedecin(m, localStatuts)),
    [medecins, localStatuts]
  );

  const q = search.trim().toLowerCase();
  const filtered = q
    ? members.filter(m =>
        `${m.prenom} ${m.nom} ${m.service || ''}`.toLowerCase().includes(q)
      )
    : members;

  async function handleDelete(member) {
    const fullName = [member.prenom, member.nom].filter(Boolean).join(' ');
    if (!confirm(`Supprimer ${fullName} ? Toutes ses affectations seront retirées.`)) return;
    try {
      await api.deleteMedecin(member.id);
      onReload();
      onToast(`${member.nom} supprimé(e)`);
    } catch(e) {
      onToast(e.message || 'Erreur lors de la suppression', 'err');
    }
  }

  async function handleSave(data) {
    const apiData = denormalizeMedecin(data, modal.member);
    try {
      if (modal.isNew) {
        const newMed = await api.addMedecin(apiData);
        onPushUndo('Ajout personnel', async () => { await api.deleteMedecin(newMed.id); onReload(); });
      } else {
        const oldData = {
          nom: modal.member._rawNom, type: modal.member._rawType,
          sched: modal.member._rawSched, service: modal.member._rawService, tel: modal.member.tel,
        };
        const medId = modal.member.id;
        await api.updateMedecin(medId, apiData);
        onPushUndo('Modification personnel', async () => { await api.updateMedecin(medId, oldData); onReload(); });
      }
      if (!modal.isNew && modal.member?.id && data.statut) {
        setLocalStatuts(s => ({ ...s, [modal.member.id]: data.statut }));
      }
      setModal(null);
      onReload();
      onToast(modal.isNew ? 'Personnel ajouté' : 'Modifications enregistrées');
    } catch(e) {
      onToast(e.message || "Erreur lors de l'enregistrement", 'err');
    }
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="sec-t">Équipe &amp; présences</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input
              className="team-search" type="text" placeholder="Rechercher…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: 200 }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:14, lineHeight:1 }}
              >×</button>
            )}
          </div>
          {isSecretary && (
            <button className="btn-primary" onClick={() => setModal({ isNew: true, defaultCat: 'ph' })}>
              + Ajouter un personnel
            </button>
          )}
        </div>
      </div>

      {/* Summary bar */}
      {filtered.length > 0 && <SummaryBar members={filtered} />}

      {/* Empty search state */}
      {filtered.length === 0 && q && (
        <p className="empty-msg">Aucun praticien trouvé pour « {search} ».</p>
      )}

      {/* Category accordion sections */}
      {CATS.map(cat => {
        const catMembers = filtered.filter(m => m.cat === cat.id);
        if (!catMembers.length) return null;
        return (
          <Section
            key={cat.id}
            catId={cat.id}
            members={catMembers}
            isSecretary={isSecretary}
            onAdd={catId => setModal({ isNew: true, defaultCat: catId })}
            onEdit={m => setModal({ isNew: false, member: m })}
            onDelete={handleDelete}
          />
        );
      })}

      {/* Slide-in edit drawer */}
      {modal && (
        <EditModal
          isNew={modal.isNew}
          member={modal.member}
          defaultCat={modal.defaultCat}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onToast={onToast}
        />
      )}
    </div>
  );
}
