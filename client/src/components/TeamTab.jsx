// components/TeamTab.jsx — Équipe & Présences, itération 4 (slide panel)
import { useState, useEffect, useMemo } from 'react';
import * as api from '../api';

const TYPE_LABEL = { ph:'Praticiens Hospitaliers', ipa:'IPA', padhue:'PADHUE', interne:'Internes', externe:'Externes' };

const CATS = [
  { id:'ph',        label:'Praticiens Hospitaliers', color:'#2563eb', bg:'#eff6ff' },
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
    email: m.email || '',
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
  return { nom, type, sched, service, tel: existingMember?.tel || '', email: data.email || '' };
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
      fontFamily: 'inherit', flexShrink: 0, userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

// ── PresenceStrips — full width ──────────────────────────────
function PresenceStrips({ presence, color }) {
  const count = presence.flat().reduce((a, b) => a + b, 0);
  const pct   = Math.round(count / 10 * 100);
  return (
    <div style={{ fontFamily: 'inherit', width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '14px repeat(5, 1fr)', gap: 3, marginBottom: 3 }}>
        <div />
        {DAYS_SHORT.map(d => (
          <div key={d} style={{ fontSize: 8, color: 'var(--text3)', textAlign: 'center', fontWeight: 700 }}>{d}</div>
        ))}
      </div>
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

// ── Carte membre ─────────────────────────────────────────────
function V1Card({ member, isSecretary, onEdit, isSelected }) {
  const cat = getCat(member.cat);
  const isAstreinte = member.cat === 'astreinte';
  const [hov, setHov] = useState(false);
  const fullName = [member.prenom, member.nom].filter(Boolean).join(' ');
  return (
    <div
      role={isSecretary ? 'button' : undefined}
      tabIndex={isSecretary ? 0 : undefined}
      onKeyDown={isSecretary ? e => e.key === 'Enter' && onEdit(member) : undefined}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={isSecretary ? () => onEdit(member) : undefined}
      style={{
        background: isSelected ? 'var(--accent-light)' : hov ? '#fafafa' : '#fff',
        borderRadius: 8, padding: '11px 12px',
        borderTop:    `1px solid ${isSelected ? 'var(--accent)' : hov ? cat.color + '44' : 'var(--border)'}`,
        borderRight:  `1px solid ${isSelected ? 'var(--accent)' : hov ? cat.color + '44' : 'var(--border)'}`,
        borderBottom: `1px solid ${isSelected ? 'var(--accent)' : hov ? cat.color + '44' : 'var(--border)'}`,
        borderLeft:   `3px solid ${isSelected ? 'var(--accent)' : cat.color}`,
        boxShadow: isSelected
          ? '0 0 0 3px rgba(34,114,240,.12)'
          : hov ? `0 3px 10px ${cat.color}22` : '0 1px 3px rgba(0,0,0,.05)',
        transition: 'all .15s',
        cursor: isSecretary ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Avatar member={member} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? 'var(--accent)' : 'var(--text)', lineHeight: 1.3, fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fullName}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text2)', fontFamily: 'inherit', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cat.label}{member.service ? ` · ${member.service}` : ''}
          </div>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 7 }}>
        {isAstreinte ? (
          <div style={{ fontSize: 9, fontStyle: 'italic', color: 'var(--text3)', fontFamily: 'inherit', lineHeight: 1.5 }}>
            Astreinte uniquement
          </div>
        ) : (
          <PresenceStrips presence={member.presence} color={cat.color} />
        )}
      </div>
    </div>
  );
}

// ── Section accordion — container blanc ──────────────────────
function Section({ catId, members, isSecretary, selectedId, onAdd, onEdit }) {
  const [open, setOpen] = useState(true);
  const [hdrHov, setHdrHov] = useState(false);
  const cat = getCat(catId);
  return (
    <div style={{
      marginBottom: 14,
      background: '#fff',
      borderRadius: 'var(--rl)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--sh)',
      overflow: 'hidden',
    }}>
      <div
        onMouseEnter={() => setHdrHov(true)}
        onMouseLeave={() => setHdrHov(false)}
        onClick={() => setOpen(o => !o)}
        title={open ? 'Cliquer pour replier' : 'Cliquer pour déplier'}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          background: hdrHov ? `${cat.color}18` : `${cat.color}0c`,
          borderBottom: open ? '1px solid var(--border)' : 'none',
          cursor: 'pointer', userSelect: 'none',
          transition: 'background .13s',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 10, fontFamily: 'inherit', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: cat.color }}>
          {cat.label}
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'inherit', fontWeight: 700,
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
      {open && (
        <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {members.map(m => (
            <V1Card
              key={m.id}
              member={m}
              isSecretary={isSecretary}
              isSelected={m.id === selectedId}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Panneau latéral (style Synthèse) ─────────────────────────
function MemberPanel({ selected, isSecretary, onClose, onSave, onDelete, onToast, allMembers }) {
  const isNew  = selected?.isNew === true;
  const member = isNew ? null : selected;

  const [prenom,   setPrenom]   = useState(member?.prenom  || '');
  const [nom,      setNom]      = useState(member?.nom     || '');
  const [cat,      setCat]      = useState(member?.cat     || selected?.defaultCat || 'ph');
  const [service,  setService]  = useState(member?.service || '');
  const [email,    setEmail]    = useState(member?.email   || '');
  const [presence, setPresence] = useState(
    member?.presence || Array.from({ length: 5 }, () => [1, 1])
  );

  const isAstreinte = cat === 'astreinte';
  const catObj      = getCat(cat);
  const presCount   = presence.flat().reduce((a, b) => a + b, 0);
  const fullName    = [member?.prenom, member?.nom].filter(Boolean).join(' ');

  const idx  = isNew ? -1 : (allMembers || []).findIndex(m => m.id === member?.id);
  const prev = isNew ? null : (allMembers || [])[idx - 1] ?? null;
  const next = isNew ? null : (allMembers || [])[idx + 1] ?? null;

  function togglePresence(di, pi) {
    setPresence(p => p.map((d, i) => i === di ? d.map((v, j) => j === pi ? (v ? 0 : 1) : v) : d));
  }

  function handleSave() {
    if (!nom.trim()) { onToast('Le nom est requis', 'err'); return; }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      onToast('Adresse email invalide', 'err'); return;
    }
    onSave({ prenom: prenom.trim(), nom: nom.trim(), cat, service: service.trim(), presence, email: email.trim() });
  }

  return (
    <div style={{
      width: 420, flexShrink: 0,
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* En-tête */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            {!isNew && member && <Avatar member={member} size={44} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', lineHeight: 1.3, fontFamily: 'inherit' }}>
                {isNew ? 'Nouveau membre' : fullName}
              </div>
              {!isNew && member && (
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, fontFamily: 'inherit' }}>
                  {getCat(member.cat).label}{member.service ? ` · ${member.service}` : ''}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => onClose(null)}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text2)', flexShrink: 0, marginLeft: 12,
              transition: 'all .15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Corps scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
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

        {/* Email — pour les campagnes congés */}
        <div className="form-row">
          <label>Email <span style={{ fontSize:9, color:'var(--text3)', fontWeight:400, textTransform:'none', letterSpacing:0 }}>— utilisé pour les campagnes congés</span></label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="prenom.nom@chu.fr"
          />
        </div>

        {/* Grille de présence */}
        {!isAstreinte && (
          <div className="form-row">
            <label>Présence — {presCount}/10 demi-journées</label>
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(5, 1fr)', gap: 5, marginBottom: 5 }}>
                <div />
                {DAYS_FULL.map(d => (
                  <div key={d} style={{ fontSize: 9, fontWeight: 700, textAlign: 'center', color: 'var(--text3)', fontFamily: 'inherit' }}>{d}</div>
                ))}
              </div>
              {['Matin', 'Après-midi'].map((period, pi) => (
                <div key={period} style={{ display: 'grid', gridTemplateColumns: '60px repeat(5, 1fr)', gap: 5, marginBottom: 5 }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', display: 'flex', alignItems: 'center', fontFamily: 'inherit' }}>{period}</div>
                  {presence.map((day, di) => (
                    <button
                      key={di}
                      onClick={() => togglePresence(di, pi)}
                      style={{
                        height: 34, borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: day[pi] ? catObj.color : '#e8e6df',
                        transition: 'background .1s',
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Supprimer */}
        {!isNew && onDelete && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={onDelete}
              style={{
                width: '100%', padding: '9px', borderRadius: 8,
                border: '1px solid #fda4af',
                background: 'var(--danger-bg)', color: 'var(--danger)',
                fontSize: 11, fontFamily: 'inherit', fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Archiver ce membre
            </button>
          </div>
        )}
      </div>

      {/* Pied — enregistrer */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button className="btn-primary" onClick={handleSave} style={{ width: '100%', padding: '10px' }}>
          {isNew ? 'Créer le membre' : 'Enregistrer'}
        </button>
      </div>

      {/* Navigation précédent / suivant */}
      {!isNew && (
        <div style={{
          padding: '10px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          {[[-1, prev, '← Précédent'], [1, next, 'Suivant →']].map(([, target, label]) => (
            <button
              key={label}
              onClick={() => target && onClose(target)}
              disabled={!target}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                padding: '6px 12px', cursor: target ? 'pointer' : 'not-allowed',
                color: target ? 'var(--text)' : 'var(--text3)',
                fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                transition: 'all .15s', opacity: target ? 1 : 0.4,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modale campagne congés ────────────────────────────────────
const TYPE_OPTIONS = [
  { type:'ph',      label:'Praticiens Hospitaliers' },
  { type:'padhue',  label:'PADHUE' },
  { type:'ipa',     label:'IPA' },
  { type:'interne', label:'Internes' },
  { type:'externe', label:'Externes' },
];

function CampaignModal({ medecins, onClose, onToast }) {
  const [selectedTypes, setSelectedTypes] = useState(['ph', 'padhue', 'ipa']);
  const [phase, setPhase]                 = useState('select'); // select | sending | done
  const [result, setResult]               = useState(null);

  function toggleType(t) {
    setSelectedTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  }

  // Liste des praticiens qui seraient contactés
  const previewed = medecins.filter(m => {
    const rawType = m._rawType || m.type;
    return selectedTypes.includes(rawType);
  });
  const withEmail    = previewed.filter(m => m.email);
  const withoutEmail = previewed.filter(m => !m.email);

  async function handleSend() {
    if (withEmail.length === 0) {
      onToast('Aucun praticien avec email dans la sélection', 'err');
      return;
    }
    setPhase('sending');
    try {
      const data = await api.sendCampaign(
        // Les types à cibler (types raw)
        selectedTypes,
        window.location.origin
      );
      setResult(data);
      setPhase('done');
      if (data.sent > 0) onToast(`${data.sent} email${data.sent > 1 ? 's' : ''} envoyé${data.sent > 1 ? 's' : ''}`);
    } catch(e) {
      setPhase('select');
      onToast(e.message || 'Erreur lors de l\'envoi', 'err');
    }
  }

  return (
    <div className="mbg open" onClick={e => e.target.classList.contains('mbg') && onClose()}>
      <div className="mbox" style={{ width: 440, maxHeight: '80vh' }}>

        {/* En-tête */}
        <div className="mhead">
          <div className="mttl">Campagne congés</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>

        {phase === 'done' ? (
          /* ── Résultat ── */
          <div style={{ padding: '20px 20px 8px' }}>
            <div style={{
              padding: '14px 16px', borderRadius: 8, marginBottom: 14,
              background: result?.sent > 0 ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${result?.sent > 0 ? '#86efac' : '#fca5a5'}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: result?.sent > 0 ? '#16a34a' : '#dc2626', marginBottom: 4 }}>
                {result?.sent > 0
                  ? `✓ ${result.sent} email${result.sent > 1 ? 's' : ''} envoyé${result.sent > 1 ? 's' : ''} avec succès`
                  : '⚠ Aucun email envoyé'
                }
              </div>
              {result?.errors?.length > 0 && (
                <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                  {result.errors.map((e, i) => (
                    <div key={i}>{e.nom} — {e.error}</div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: '0 0 14px', textAlign: 'right' }}>
              <button className="btn-primary" onClick={onClose}>Fermer</button>
            </div>
          </div>
        ) : (
          /* ── Sélection ── */
          <div style={{ padding: '16px 20px 8px' }}>
            <p style={{ fontSize: 12, fontFamily: 'inherit', color: 'var(--text2)', margin: '0 0 14px', lineHeight: 1.6 }}>
              Chaque praticien recevra un lien personnel (valable 72h) pour saisir ses congés.
            </p>

            {/* Types */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Catégories</div>
              {TYPE_OPTIONS.map(({ type, label }) => {
                const count = medecins.filter(m => (m._rawType || m.type) === type).length;
                const withMail = medecins.filter(m => (m._rawType || m.type) === type && m.email).length;
                const checked = selectedTypes.includes(type);
                return (
                  <label key={type} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', borderRadius: 7, marginBottom: 4,
                    cursor: 'pointer', userSelect: 'none',
                    background: checked ? 'var(--accent-light, #eff6ff)' : 'transparent',
                    border: `1px solid ${checked ? 'var(--accent, #2563eb)' : 'var(--border)'}`,
                    transition: 'all .12s',
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleType(type)}
                      style={{ accentColor: 'var(--accent, #2563eb)', width: 14, height: 14 }}
                    />
                    <span style={{ flex: 1, fontSize: 12, fontFamily: 'inherit', color: 'var(--text)', fontWeight: checked ? 700 : 400 }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 10, color: withMail > 0 ? 'var(--text2)' : 'var(--text3)' }}>
                      {withMail}/{count} avec email
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Récap */}
            {selectedTypes.length > 0 && (
              <div style={{
                padding: '10px 12px', borderRadius: 7, marginBottom: 14,
                background: '#f9f8f6', border: '1px solid var(--border)',
                fontSize: 12, fontFamily: 'inherit',
              }}>
                <div style={{ color: 'var(--text)', marginBottom: withoutEmail.length ? 4 : 0 }}>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ {withEmail.length} praticien{withEmail.length !== 1 ? 's' : ''}</span> recevront un email
                </div>
                {withoutEmail.length > 0 && (
                  <div style={{ color: 'var(--text3)' }}>
                    ⚠ {withoutEmail.length} sans adresse email (non contacté{withoutEmail.length !== 1 ? 's' : ''})
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              <button className="btn-cancel" onClick={onClose}>Annuler</button>
              <button
                className="btn-primary"
                onClick={handleSend}
                disabled={phase === 'sending' || withEmail.length === 0}
              >
                {phase === 'sending' ? 'Envoi…' : `Envoyer ${withEmail.length} email${withEmail.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section archivés ─────────────────────────────────────────
function ArchivedSection({ isSecretary, onReactivate }) {
  const [open,    setOpen]    = useState(false);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hdrHov,  setHdrHov]  = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rows = await api.getArchivedMedecins();
      setMembers(rows.map(normalizeMedecin));
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (!open && members.length === 0) load();
    setOpen(o => !o);
  }

  return (
    <div style={{
      marginBottom: 14,
      background: '#fff',
      borderRadius: 'var(--rl)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--sh)',
      overflow: 'hidden',
      opacity: 0.85,
    }}>
      <div
        onMouseEnter={() => setHdrHov(true)}
        onMouseLeave={() => setHdrHov(false)}
        onClick={toggle}
        title={open ? 'Cliquer pour replier' : 'Cliquer pour déplier'}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          background: hdrHov ? '#f0efed' : '#f9f8f6',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          cursor: 'pointer', userSelect: 'none',
          transition: 'background .13s',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#9ca3af', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 10, fontFamily: 'inherit', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#6b7280' }}>
          Archivés
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'inherit', fontWeight: 700,
          background: '#f3f4f6', color: '#6b7280', padding: '1px 8px', borderRadius: 20,
          border: '1px solid #d1d5db',
        }}>
          {open ? members.length : '…'}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .18s', flexShrink: 0, opacity: .8 }}
        >
          <path d="M5 3l4 4-4 4" />
        </svg>
      </div>
      {open && (
        <div style={{ padding: '12px 14px' }}>
          {loading && (
            <p style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'inherit', margin: 0 }}>Chargement…</p>
          )}
          {!loading && members.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'inherit', margin: 0 }}>Aucun praticien archivé.</p>
          )}
          {!loading && members.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {members.map(m => {
                const fullName = [m.prenom, m.nom].filter(Boolean).join(' ');
                const cat = getCat(m.cat);
                return (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: '#fafaf9',
                  }}>
                    <Avatar member={m} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fullName}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'inherit' }}>
                        {cat.label}{m.service ? ` · ${m.service}` : ''}
                      </div>
                    </div>
                    {isSecretary && (
                      <button
                        onClick={() => onReactivate(m, setMembers)}
                        style={{
                          padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
                          border: '1px solid #86efac',
                          background: '#f0fdf4', color: '#16a34a',
                          fontSize: 10, fontFamily: 'inherit', fontWeight: 700,
                          transition: 'all .13s', flexShrink: 0,
                        }}
                      >
                        Réactiver
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────
export default function TeamTab({ medecins, isSecretary, onReload, onToast, onPushUndo = () => {} }) {
  const [selected,      setSelected]      = useState(null); // member obj | { isNew:true, defaultCat } | null
  const [search,        setSearch]        = useState('');
  const [campaignOpen,  setCampaignOpen]  = useState(false);

  const members = useMemo(() => medecins.map(normalizeMedecin), [medecins]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? members.filter(m => `${m.prenom} ${m.nom} ${m.service || ''}`.toLowerCase().includes(q))
    : members;

  // Escape ferme le panneau
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  async function handleArchive(member) {
    const fullName = [member.prenom, member.nom].filter(Boolean).join(' ');
    if (!confirm(`Archiver ${fullName} ? Le praticien n'apparaîtra plus dans le planning mais son historique sera conservé.`)) return;
    try {
      await api.archiveMedecin(member.id);
      setSelected(null);
      onReload();
      onToast(`${member.nom} archivé(e)`);
    } catch(e) {
      onToast(e.message || "Erreur lors de l'archivage", 'err');
    }
  }

  async function handleSave(data) {
    const isNew = selected?.isNew === true;
    const apiData = denormalizeMedecin(data, isNew ? null : selected);
    try {
      if (isNew) {
        const newMed = await api.addMedecin(apiData);
        onPushUndo('Ajout personnel', async () => { await api.archiveMedecin(newMed.id); onReload(); });
      } else {
        const oldData = {
          nom: selected._rawNom, type: selected._rawType,
          sched: selected._rawSched, service: selected._rawService,
          tel: selected.tel, email: selected.email || '',
        };
        const medId = selected.id;
        await api.updateMedecin(medId, apiData);
        onPushUndo('Modification personnel', async () => { await api.updateMedecin(medId, oldData); onReload(); });
      }
      setSelected(null);
      onReload();
      onToast(isNew ? 'Personnel ajouté' : 'Modifications enregistrées');
    } catch(e) {
      onToast(e.message || "Erreur lors de l'enregistrement", 'err');
    }
  }

  // Fermeture ou navigation précédent/suivant depuis le panneau
  function handlePanelClose(nextMember) {
    if (nextMember && nextMember.id) {
      setSelected(nextMember);
    } else {
      setSelected(null);
    }
  }

  return (
    <div>
      {/* En-tête — titre + boutons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="sec-t">Équipe &amp; présences</div>
        {isSecretary && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={() => setCampaignOpen(true)}
              title="Envoyer des liens de saisie de congés aux praticiens"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 13px', fontSize: 12,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 2.5h11l-5 6v3.5l-2-1.2V8.5l-4-6z" strokeLinejoin="round"/>
              </svg>
              Campagne congés
            </button>
            <button className="btn-primary" onClick={() => setSelected({ isNew: true, defaultCat: 'ph' })}>
              + Ajouter un personnel
            </button>
          </div>
        )}
      </div>

      {/* Cadre principal — même structure que l'onglet Synthèse */}
      <div style={{
        display: 'flex',
        height: 'calc(100vh - 190px)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        borderRadius: 'var(--rl)',
        background: 'var(--bg)',
        boxShadow: 'var(--sh)',
      }}>
        {/* Zone gauche — contenu scrollable */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '0 24px' }}>

          {/* Recherche — sticky en haut */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--bg)', paddingTop: 20, paddingBottom: 14,
          }}>
            <div style={{ position: 'relative' }}>
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
                  fontSize: 13, fontFamily: 'inherit',
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
          </div>

          {/* Sections */}
          <div style={{ paddingBottom: 24 }}>
            {filtered.length === 0 && q && (
              <p className="empty-msg">Aucun praticien trouvé pour « {search} ».</p>
            )}
            {CATS.map(cat => {
              const catMembers = filtered.filter(m => m.cat === cat.id);
              if (!catMembers.length) return null;
              return (
                <Section
                  key={cat.id}
                  catId={cat.id}
                  members={catMembers}
                  isSecretary={isSecretary}
                  selectedId={selected?.id}
                  onAdd={catId => setSelected({ isNew: true, defaultCat: catId })}
                  onEdit={m => setSelected(m)}
                />
              );
            })}
          </div>
        </div>

        {/* Zone droite — panneau latéral à largeur animée */}
        <div style={{
          width: selected ? 420 : 0,
          flexShrink: 0, overflow: 'hidden',
          transition: 'width .25s ease',
          display: 'flex',
        }}>
          {selected && (
            <MemberPanel
              key={selected?.id ?? 'new'}
              selected={selected}
              isSecretary={isSecretary}
              onClose={handlePanelClose}
              onSave={handleSave}
              onDelete={!selected?.isNew && selected?.id ? () => handleArchive(selected) : undefined}
              onToast={onToast}
              allMembers={filtered}
            />
          )}
        </div>
      </div>

      {/* Modale campagne congés */}
      {campaignOpen && (
        <CampaignModal
          medecins={members}
          onClose={() => setCampaignOpen(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
