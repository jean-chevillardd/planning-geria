// components/TeamTab.jsx — Équipe & Présences, itération 3
import { useState, useEffect, useMemo } from 'react';
import * as api from '../api';

const CATS = [
  { id:'ph',        label:'Praticiens Hospitaliers', color:'#2272f0', bg:'#eef3ff' },
  { id:'padhue',    label:'PADHUE',                  color:'#7c3aed', bg:'#f5f0ff' },
  { id:'internes',  label:'Internes',                color:'#ea580c', bg:'#fff4ed' },
  { id:'ipa',       label:'IPA',                     color:'#059669', bg:'#edfdf5' },
  { id:'externes',  label:'Externes',                color:'#0891b2', bg:'#f0fbff' },
  { id:'astreinte', label:"Médecins d'astreinte",    color:'#d97706', bg:'#fffbeb' },
];

const DAYS_SHORT = ['L', 'Ma', 'Me', 'J', 'V'];
const DAYS_FULL  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

const TYPE_TO_CAT = { ph:'ph', ipa:'ipa', padhue:'padhue', interne:'internes', externe:'externes' };
const CAT_TO_TYPE = { ph:'ph', ipa:'ipa', padhue:'padhue', internes:'interne', externes:'externe', astreinte:'externe' };

function getCat(id) { return CATS.find(c => c.id === id) || CATS[0]; }

function normalizeMedecin(m) {
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
    presence: isAstreinte ? undefined : presence,
    _rawNom: m.nom, _rawType: m.type, _rawSched: [...sched], _rawService: m.service,
  };
}

function denormalizeMedecin(data, existingMember) {
  const nom = [data.prenom, data.nom].filter(Boolean).join(' ');
  const type = CAT_TO_TYPE[data.cat] || 'ph';
  const isAstreinte = data.cat === 'astreinte';
  const sched = isAstreinte ? Array(10).fill(0) : data.presence.flat();
  const service = isAstreinte ? (data.service || '') : 'geriatrie';
  return { nom, type, sched, service, tel: existingMember?.tel || '' };
}

// ── Avatar ───────────────────────────────────────────────────
function Avatar({ member, size = 36 }) {
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

// ── PresenceStrips — full card width ─────────────────────────
function PresenceStrips({ presence, color }) {
  const count = presence.flat().reduce((a, b) => a + b, 0);
  const pct   = Math.round(count / 10 * 100);
  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', width: '100%' }}>
      {/* Day labels */}
      <div style={{ display: 'grid', gridTemplateColumns: '14px repeat(5, 1fr)', gap: 3, marginBottom: 3 }}>
        <div />
        {DAYS_SHORT.map(d => (
          <div key={d} style={{ fontSize: 8, color: 'var(--text3)', textAlign: 'center', fontWeight: 700 }}>{d}</div>
        ))}
      </div>
      {/* M row and A row */}
      {[0, 1].map(pi => (
        <div key={pi} style={{ display: 'grid', gridTemplateColumns: '14px repeat(5, 1fr)', gap: 3, marginBottom: 3 }}>
          <div style={{ fontSize: 8, color: 'var(--text3)', fontWeight: 700, display: 'flex', alignItems: 'center' }}>
            {pi === 0 ? 'M' : 'A'}
          </div>
          {presence.map((day, di) => (
            <div key={di} style={{
              height: 10, borderRadius: 4,
              background: day[pi] ? `${color}cc` : '#eeecea',
            }} />
          ))}
        </div>
      ))}
      {/* Progress bar + count */}
      <div style={{ marginTop: 5 }}>
        <div style={{ height: 3, borderRadius: 2, background: '#eeecea', overflow: 'hidden', marginBottom: 2 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `${color}cc`, borderRadius: 2 }} />
        </div>
        <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600 }}>
          {count}/10 demi-journées · {pct}%
        </div>
      </div>
    </div>
  );
}

// ── Carte membre — clic sur toute la carte pour éditer ───────
function V1Card({ member, isSecretary, onEdit }) {
  const cat = getCat(member.cat);
  const isAstreinte = member.cat === 'astreinte';
  const [hovered, setHovered] = useState(false);
  const fullName = [member.prenom, member.nom].filter(Boolean).join(' ');
  const active = hovered && isSecretary;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={isSecretary ? () => onEdit(member) : undefined}
      style={{
        background: active ? '#fafafa' : '#fff',
        borderRadius: 8, padding: '11px 12px',
        borderTop:    `1px solid ${active ? cat.color + '44' : 'var(--border)'}`,
        borderRight:  `1px solid ${active ? cat.color + '44' : 'var(--border)'}`,
        borderBottom: `1px solid ${active ? cat.color + '44' : 'var(--border)'}`,
        borderLeft:   `3px solid ${cat.color}`,
        boxShadow: active ? `0 3px 10px ${cat.color}22` : '0 1px 3px rgba(0,0,0,.05)',
        transition: 'box-shadow .15s, background .13s',
        cursor: isSecretary ? 'pointer' : 'default',
      }}
    >
      {/* Avatar + nom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Avatar member={member} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, fontFamily: 'system-ui,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fullName}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text2)', fontFamily: 'system-ui,sans-serif', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cat.label}{member.service ? ` · ${member.service}` : ''}
          </div>
        </div>
      </div>
      {/* Présence ou note astreinte */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 7 }}>
        {isAstreinte ? (
          <div style={{ fontSize: 9, fontStyle: 'italic', color: 'var(--text3)', fontFamily: 'system-ui,sans-serif', lineHeight: 1.5 }}>
            Astreinte uniquement
          </div>
        ) : (
          <PresenceStrips presence={member.presence} color={cat.color} />
        )}
      </div>
    </div>
  );
}

// ── Section accordion — container blanc englobant ────────────
function Section({ catId, members, isSecretary, onAdd, onEdit }) {
  const [open, setOpen] = useState(true);
  const [hdrHovered, setHdrHovered] = useState(false);
  const cat = getCat(catId);
  return (
    <div style={{
      marginBottom: 14,
      background: '#fff',
      borderRadius: 12,
      border: '1px solid var(--border)',
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      overflow: 'hidden',
    }}>
      {/* Bandeau en-tête */}
      <div
        onMouseEnter={() => setHdrHovered(true)}
        onMouseLeave={() => setHdrHovered(false)}
        onClick={() => setOpen(o => !o)}
        title={open ? 'Cliquer pour replier' : 'Cliquer pour déplier'}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          background: hdrHovered ? `${cat.color}18` : `${cat.color}0c`,
          borderBottom: open ? '1px solid var(--border)' : 'none',
          cursor: 'pointer', userSelect: 'none',
          transition: 'background .13s',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 10, fontFamily: 'system-ui,sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: cat.color }}>
          {cat.label}
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'system-ui,sans-serif', fontWeight: 700,
          background: cat.bg, color: cat.color, padding: '1px 8px', borderRadius: 20,
          border: `1px solid ${cat.color}44`,
        }}>
          {members.length}
        </span>
        {isSecretary && (
          <button
            className="btn-primary"
            onClick={e => { e.stopPropagation(); onAdd(catId); }}
          >
            + Ajouter
          </button>
        )}
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          stroke={cat.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .18s', flexShrink: 0, opacity: .8 }}
        >
          <path d="M5 3l4 4-4 4" />
        </svg>
      </div>

      {/* Grille de cartes — 6 colonnes, à l'intérieur du container blanc */}
      {open && (
        <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {members.map(m => (
            <V1Card key={m.id} member={m} isSecretary={isSecretary} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Panneau d'édition — carte flottante style Synthèse ───────
function EditModal({ isNew, member, defaultCat, onClose, onSave, onDelete, onToast }) {
  const [prenom,   setPrenom]   = useState(member?.prenom  || '');
  const [nom,      setNom]      = useState(member?.nom     || '');
  const [cat,      setCat]      = useState(member?.cat     || defaultCat || 'ph');
  const [service,  setService]  = useState(member?.service || '');
  const [presence, setPresence] = useState(
    member?.presence || Array.from({ length: 5 }, () => [1, 1])
  );

  const isAstreinte = cat === 'astreinte';
  const catColor    = getCat(cat).color;
  const presCount   = presence.flat().reduce((a, b) => a + b, 0);

  function togglePresence(di, pi) {
    setPresence(prev => prev.map((d, i) => i === di ? d.map((v, j) => j === pi ? (v ? 0 : 1) : v) : d));
  }

  function handleSave() {
    if (!nom.trim()) { onToast('Le nom est requis', 'err'); return; }
    onSave({ prenom: prenom.trim(), nom: nom.trim(), cat, service: service.trim(), presence });
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
        background: 'rgba(0,0,0,.18)',
        display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start',
      }}
    >
      <div style={{
        width: 420,
        margin: '16px 16px 16px 0',
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 8px 40px rgba(0,0,0,.18)',
        display: 'flex', flexDirection: 'column',
        animation: 'eq-slide-in 220ms ease-out',
        overflow: 'hidden',
        maxHeight: 'calc(100vh - 32px)',
      }}>
        {/* En-tête */}
        <div style={{
          padding: '16px 18px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'system-ui,sans-serif' }}>
            {isNew ? 'Nouveau membre' : 'Modifier le membre'}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--bg)', border: '1px solid var(--border)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, color: 'var(--text3)', lineHeight: 1,
            }}
          >✕</button>
        </div>

        {/* Formulaire */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
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

          {/* Service d'origine — astreinte uniquement */}
          {isAstreinte && (
            <div className="form-row">
              <label>Service d'origine</label>
              <input type="text" value={service} onChange={e => setService(e.target.value)} placeholder="Ex. Cardiologie" />
            </div>
          )}

          {/* Grille de présence */}
          {!isAstreinte && (
            <div className="form-row">
              <label>Présence — {presCount}/10 demi-journées</label>
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(5, 1fr)', gap: 5, marginBottom: 5 }}>
                  <div />
                  {DAYS_FULL.map(d => (
                    <div key={d} style={{ fontSize: 9, fontWeight: 700, textAlign: 'center', color: 'var(--text3)', fontFamily: 'system-ui,sans-serif' }}>{d}</div>
                  ))}
                </div>
                {['Matin', 'Après-midi'].map((period, pi) => (
                  <div key={period} style={{ display: 'grid', gridTemplateColumns: '60px repeat(5, 1fr)', gap: 5, marginBottom: 5 }}>
                    <div style={{ fontSize: 10, color: 'var(--text2)', display: 'flex', alignItems: 'center', fontFamily: 'system-ui,sans-serif' }}>{period}</div>
                    {presence.map((day, di) => (
                      <button
                        key={di}
                        onClick={() => togglePresence(di, pi)}
                        style={{
                          height: 34, borderRadius: 6, border: 'none', cursor: 'pointer',
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

          {/* Bouton supprimer — membres existants, en bas du formulaire */}
          {!isNew && onDelete && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={onDelete}
                style={{
                  width: '100%', padding: '9px', borderRadius: 8,
                  border: '1px solid #fda4af',
                  background: 'var(--danger-bg)', color: 'var(--danger)',
                  fontSize: 11, fontFamily: 'system-ui,sans-serif', fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Supprimer ce membre
              </button>
            </div>
          )}
        </div>

        {/* Pied de page — bouton enregistrer uniquement */}
        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <button className="btn-primary" onClick={handleSave} style={{ width: '100%', padding: '10px' }}>
            {isNew ? 'Créer le membre' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────
export default function TeamTab({ medecins, isSecretary, onReload, onToast, onPushUndo = () => {} }) {
  const [modal,  setModal]  = useState(null);
  const [search, setSearch] = useState('');

  const members = useMemo(() => medecins.map(normalizeMedecin), [medecins]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? members.filter(m => `${m.prenom} ${m.nom} ${m.service || ''}`.toLowerCase().includes(q))
    : members;

  async function handleDelete(member) {
    const fullName = [member.prenom, member.nom].filter(Boolean).join(' ');
    if (!confirm(`Supprimer ${fullName} ? Toutes ses affectations seront retirées.`)) return;
    try {
      await api.deleteMedecin(member.id);
      setModal(null);
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
      setModal(null);
      onReload();
      onToast(modal.isNew ? 'Personnel ajouté' : 'Modifications enregistrées');
    } catch(e) {
      onToast(e.message || "Erreur lors de l'enregistrement", 'err');
    }
  }

  return (
    <div>
      {/* En-tête de page */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div className="sec-t">Équipe &amp; présences</div>
        {isSecretary && (
          <button className="btn-primary" onClick={() => setModal({ isNew: true, defaultCat: 'ph' })}>
            + Ajouter un personnel
          </button>
        )}
      </div>

      {/* Champ de recherche — standalone, bien visible */}
      <div style={{ position: 'relative', marginBottom: 18 }}>
        <svg
          width="15" height="15" viewBox="0 0 15 15" fill="none"
          stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round"
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="6.5" cy="6.5" r="4.5" />
          <line x1="10" y1="10" x2="13.5" y2="13.5" />
        </svg>
        <input
          type="text"
          placeholder="Rechercher un praticien…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 34px 9px 32px',
            border: '1px solid var(--border)',
            borderRadius: 8, background: '#fff',
            fontSize: 13, fontFamily: 'system-ui,sans-serif',
            color: 'var(--text)', outline: 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,.06)',
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: 0,
            }}
          >×</button>
        )}
      </div>

      {/* Recherche vide */}
      {filtered.length === 0 && q && (
        <p className="empty-msg">Aucun praticien trouvé pour « {search} ».</p>
      )}

      {/* Sections par catégorie */}
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
          />
        );
      })}

      {/* Panneau d'édition */}
      {modal && (
        <EditModal
          isNew={modal.isNew}
          member={modal.member}
          defaultCat={modal.defaultCat}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={!modal.isNew && modal.member ? () => handleDelete(modal.member) : undefined}
          onToast={onToast}
        />
      )}
    </div>
  );
}
