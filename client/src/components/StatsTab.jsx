// components/StatsTab.jsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { POSTES, TYPE_LBL, getMonday } from '../utils';
import * as api from '../api';

const TYPE_COLORS = {
  'Congé annuel (CA)':              '#2272f0',
  'Formation / DPC':                '#059669',
  'Congé maladie':                  '#e11d48',
  'Temps non clinique':             '#9333ea',
  'RTT':                            '#4f46e5',
  'Récupération de garde':          '#ea580c',
  'Congé formation (CF)':           '#0891b2',
  'Activité externe (CM2R / MTG…)': '#d97706',
};
function typeColor(t) { return TYPE_COLORS[t] ?? '#6A6A66'; }

// ── Helpers ────────────────────────────────────────────────

/** Nombre total de semaines de travail dans l'année (premier lundi → dernier lundi) */
function getTotalWeeksYear() {
  const year  = new Date().getFullYear();
  const jan1  = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);

  // Premier lundi >= 1er janvier
  let start = getMonday(jan1);
  if (start < jan1) start.setDate(start.getDate() + 7);

  // Dernier lundi de l'année
  const lastMon = getMonday(dec31);
  if (lastMon < start) return 1;

  return Math.round((lastMon - start) / (7 * 864e5)) + 1;
}

/** Jours ouvrés entre deux dates ISO (inclusif) */
function countWorkingDays(d1, d2) {
  let n = 0;
  const end = new Date(d2 + 'T12:00:00');
  for (let d = new Date(d1 + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow > 0 && dow < 6) n++;
  }
  return n;
}

/** Formate une date ISO en "jj/mm/aaaa" */
function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Groupes de services dans l'ordre du planning
const SERVICE_GROUPS = [
  'Court séjour 1',
  'Court séjour 2',
  'Hôpital de jour',
  'Extra-hospitalier',
  'SSR',
  'UCC / EMCC',
  'EHPAD',
  'Consultations',
];

const POSTES_BY_GROUP = SERVICE_GROUPS.map(grp => ({
  grp,
  postes: POSTES.filter(p => p.grp === grp),
}));

// ── Composant principal ────────────────────────────────────

const MED_GROUPS = [
  { key:'ph',      label:'Praticiens Hospitaliers' },
  { key:'padhue',  label:'PADHUE' },
  { key:'ipa',     label:'IPA' },
  { key:'interne', label:'Internes' },
  { key:'externe', label:'Externes' },
];

export default function StatsTab({ medecins, onGoToAbsences }) {
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState(null);
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [open,      setOpen]      = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const listRef = useRef(null);

  const totalWeeks = getTotalWeeksYear();
  const year       = new Date().getFullYear();

  const q        = search.trim().toLowerCase();
  const filtered = q ? medecins.filter(m => m.nom.toLowerCase().includes(q)) : medecins;

  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIdx];
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  async function selectMed(med) {
    setSelected(med);
    setSearch(med.nom);
    setOpen(false);
    setActiveIdx(-1);
    setStats(null);
    setLoading(true);
    try {
      const data = await api.getStatsMedecin(med.id);
      setStats(data);
    } catch(e) {
      console.error('Stats error:', e);
    } finally {
      setLoading(false);
    }
  }

  function clearSelection() {
    setSelected(null);
    setSearch('');
    setStats(null);
    setActiveIdx(-1);
    setOpen(false);
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12 }}>
        <div className="sec-t">Synthèse par praticien</div>
        <span style={{ fontSize:10, fontFamily:'sans-serif', color:'var(--text2)' }}>
          Rotation {year} — semaines passées &amp; planifiées · {totalWeeks} semaines au total
        </span>
      </div>

      {/* ── Recherche ── */}
      <div style={{ position:'relative', maxWidth:380, marginBottom:20 }}>
        <input
          className="team-search"
          type="text"
          placeholder="Rechercher un praticien…"
          value={search}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); setActiveIdx(-1); }, 150)}
          onChange={e => { setSearch(e.target.value); setSelected(null); setStats(null); setActiveIdx(-1); setOpen(true); }}
          onKeyDown={e => {
            if (!open || selected) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIdx(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length > 0) selectMed(filtered[activeIdx >= 0 ? activeIdx : 0]);
            } else if (e.key === 'Escape') {
              setOpen(false); setActiveIdx(-1);
            }
          }}
        />
        {/* Bouton effacer */}
        {search && (
          <button onClick={clearSelection} style={{
            position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
            background:'none', border:'none', cursor:'pointer',
            color:'var(--text3)', fontSize:14, lineHeight:1,
          }}>×</button>
        )}

        {/* Dropdown */}
        {open && filtered.length > 0 && !selected && (
          <div ref={listRef} style={{
            position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:200,
            background:'var(--surface)', border:'1px solid var(--border2)',
            borderRadius:'var(--r)', boxShadow:'0 4px 16px rgba(0,0,0,.12)',
            maxHeight:220, overflowY:'auto',
          }}>
            {filtered.map((m, idx) => (
              <div key={m.id}
                onMouseDown={() => selectMed(m)}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseLeave={() => setActiveIdx(-1)}
                style={{
                  padding:'8px 12px', cursor:'pointer',
                  fontSize:12, fontFamily:'sans-serif',
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  borderBottom:'1px solid var(--border)',
                  background: idx === activeIdx ? 'var(--accent-light)' : '',
                }}>
                <span style={{ fontWeight:600 }}>{m.nom}</span>
                <span style={{ fontSize:10, color:'var(--text2)' }}>{TYPE_LBL[m.type]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Cards praticiens (état vide) ── */}
      {!selected && !loading && (
        <div>
          {MED_GROUPS.map(grp => {
            const members = medecins
              .filter(m => m.type === grp.key)
              .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
            if (members.length === 0) return null;
            return (
              <div key={grp.key} style={{ marginBottom:20 }}>
                <div className="sec-s" style={{ marginBottom:8 }}>{grp.label}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {members.map(m => (
                    <button
                      key={m.id}
                      onClick={() => selectMed(m)}
                      style={{
                        padding:'6px 14px',
                        borderRadius:'var(--r)',
                        border:'1px solid var(--border2)',
                        background:'var(--surface)',
                        cursor:'pointer',
                        fontSize:11,
                        fontFamily:'sans-serif',
                        fontWeight: grp.key === 'ph' ? 700 : 400,
                        fontStyle: (grp.key === 'interne' || grp.key === 'externe') ? 'italic' : 'normal',
                        color:'var(--text)',
                        boxShadow:'0 1px 3px rgba(0,0,0,.06)',
                        whiteSpace:'nowrap',
                        transition:'background .1s, border-color .1s, color .1s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background    = 'var(--accent-light)';
                        e.currentTarget.style.borderColor   = 'var(--accent)';
                        e.currentTarget.style.color         = 'var(--accent)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background    = 'var(--surface)';
                        e.currentTarget.style.borderColor   = 'var(--border2)';
                        e.currentTarget.style.color         = 'var(--text)';
                      }}
                    >
                      {m.nom}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Chargement ── */}
      {loading && (
        <div style={{ fontFamily:'sans-serif', fontSize:12, color:'var(--text2)', padding:'1rem 0' }}>
          Chargement…
        </div>
      )}

      {/* ── Fiche praticien ── */}
      {selected && stats && (
        <MedecinStats med={selected} stats={stats} totalWeeks={totalWeeks} year={year} onGoToAbsences={onGoToAbsences} />
      )}
    </div>
  );
}

// ── Fiche de synthèse ──────────────────────────────────────

function MedecinStats({ med, stats, totalWeeks, year, onGoToAbsences }) {
  const { affectations, absences } = stats;

  const affMap = {};
  affectations.forEach(a => { affMap[a.poste_id] = Number(a.semaines); });

  const totalSemaines = affectations.reduce((s, a) => s + Number(a.semaines), 0);
  const groupsCovered = new Set(
    affectations.map(a => POSTES.find(p => p.id === a.poste_id)?.grp).filter(Boolean)
  );
  const totalAbsDays = absences.reduce((n, a) => n + countWorkingDays(a.date_debut, a.date_fin), 0);
  const barPct = s => Math.min(Math.round((s / Math.max(totalWeeks, 1)) * 100), 100);

  // Regroupement des congés : mois → liste des absences individuelles
  const absencesByMonth = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 7);
    const months = {};
    absences.forEach(a => {
      const key = a.date_debut.slice(0, 7);
      if (!months[key]) months[key] = { total: 0, items: [] };
      const days = countWorkingDays(a.date_debut, a.date_fin);
      months[key].total += days;
      months[key].items.push({ ...a, days });
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { total, items }]) => ({
        key,
        label: new Date(key + '-15').toLocaleDateString('fr-FR', { month:'long', year:'numeric' }),
        isPast: key < todayKey,
        items: items.slice().sort((a, b) => a.date_debut.localeCompare(b.date_debut)),
        total,
      }));
  }, [absences]);

  return (
    <div>
      {/* ── Carte en-tête ── */}
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:'var(--rl)', padding:'14px 18px', marginBottom:20,
        boxShadow:'var(--sh)', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:12,
      }}>
        <div>
          <div style={{ fontSize:16, fontWeight:'bold' }}>{med.nom}</div>
          <div style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--text2)', marginTop:2 }}>
            {TYPE_LBL[med.type]}
          </div>
        </div>
        <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
          <Kpi value={groupsCovered.size} label="services couverts" />
          <Kpi value={totalSemaines}       label="semaines affectées" />
          <Kpi value={totalWeeks}          label={`semaines ${year}`} color="var(--text3)" />
          {totalAbsDays > 0 && <Kpi value={totalAbsDays} label="jours d'absence" color="var(--warn)" />}
        </div>
      </div>

      {/* ── Mise en page 2 colonnes (responsive) ── */}
      <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>

        {/* ── Colonne gauche : Rotation ── */}
        <div style={{ flex:'1 1 300px', minWidth:0 }}>
          <div className="sec-s" style={{ marginBottom:10 }}>Rotation par service — {year}</div>
          {affectations.length === 0 && (
            <p style={{ fontFamily:'sans-serif', fontSize:12, color:'var(--text3)' }}>
              Aucune affectation enregistrée depuis le 01/01/{year}.
            </p>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {POSTES_BY_GROUP.map(({ grp, postes }) => (
              <GroupBlock
                key={grp} grp={grp} postes={postes}
                relevant={postes.filter(p => affMap[p.id])}
                affMap={affMap} barPct={barPct}
              />
            ))}
          </div>
        </div>

        {/* ── Colonne droite : Absences par mois ── */}
        {absences.length > 0 && (
          <div style={{ flex:'1 1 240px', minWidth:0 }}>
            <div className="sec-s" style={{ marginBottom:10 }}>
              Absences {year}
              <span style={{ fontWeight:400, color:'var(--text2)', marginLeft:6 }}>
                — {totalAbsDays} j. ouvré{totalAbsDays > 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {absencesByMonth.map(mo => (
                <div key={mo.key} style={{
                  background:'var(--surface)', border:'1px solid var(--border)',
                  borderRadius:'var(--r)', overflow:'hidden',
                }}>
                  {/* En-tête mois — cliquable → onglet absences */}
                  <div
                    title={onGoToAbsences ? 'Voir dans le calendrier des absences' : undefined}
                    onClick={() => onGoToAbsences && onGoToAbsences(med.id, mo.key)}
                    style={{
                      background: mo.isPast ? 'var(--surface2)' : 'var(--accent-light)',
                      padding:'5px 10px',
                      display:'flex', justifyContent:'space-between', alignItems:'center',
                      borderBottom:'1px solid var(--border)',
                      cursor: onGoToAbsences ? 'pointer' : 'default',
                      userSelect:'none',
                    }}
                  >
                    <span style={{
                      fontSize:10, fontFamily:'Trebuchet MS,sans-serif', fontWeight:700,
                      letterSpacing:'.05em', textTransform:'uppercase',
                      color: mo.isPast ? 'var(--text2)' : 'var(--accent)',
                      display:'flex', alignItems:'center', gap:5,
                    }}>
                      {mo.isPast ? '✓ ' : ''}{mo.label}
                      {onGoToAbsences && (
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none"
                          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                          style={{ opacity:.45, flexShrink:0 }}>
                          <path d="M2 8 8 2M4 2h4v4"/>
                        </svg>
                      )}
                    </span>
                    <span style={{
                      fontSize:11, fontFamily:'sans-serif', fontWeight:700,
                      color: mo.isPast ? 'var(--text3)' : 'var(--accent)',
                    }}>
                      {mo.total} j.
                    </span>
                  </div>
                  {/* Lignes individuelles (une par absence) */}
                  <div style={{ padding:'6px 10px', display:'flex', flexDirection:'column', gap:5 }}>
                    {mo.items.map((item, idx) => (
                      <div key={idx} style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{
                          width:9, height:9, borderRadius:2, flexShrink:0,
                          background: typeColor(item.type_abs) + '33',
                          border:`1.5px solid ${typeColor(item.type_abs)}99`,
                        }} />
                        <span style={{ flex:1, fontSize:10, fontFamily:'sans-serif', color:'var(--text2)', minWidth:0 }}>
                          {item.type_abs}
                          {(item.date_debut !== item.date_fin) && (
                            <span style={{ color:'var(--text3)', marginLeft:5, whiteSpace:'nowrap' }}>
                              {fmtDate(item.date_debut)} → {fmtDate(item.date_fin)}
                            </span>
                          )}
                          {(item.date_debut === item.date_fin) && (
                            <span style={{ color:'var(--text3)', marginLeft:5, whiteSpace:'nowrap' }}>
                              {fmtDate(item.date_debut)}
                            </span>
                          )}
                        </span>
                        <span style={{
                          fontSize:11, fontFamily:'sans-serif', fontWeight:700,
                          color: typeColor(item.type_abs), whiteSpace:'nowrap',
                        }}>
                          {item.days} j.
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bloc d'un groupe de services ───────────────────────────

function GroupBlock({ grp, postes, relevant, affMap, barPct }) {
  const hasCoverage = relevant.length > 0;
  const notCovered  = postes.filter(p => !affMap[p.id]);

  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'var(--r)', overflow:'hidden',
    }}>
      {/* En-tête du groupe */}
      <div style={{
        background:'var(--surface2)', padding:'5px 12px',
        fontSize:9, fontFamily:'Trebuchet MS,sans-serif', fontWeight:700,
        letterSpacing:'.07em', textTransform:'uppercase', color:'var(--text2)',
        display:'flex', justifyContent:'space-between', alignItems:'center',
      }}>
        <span>{grp}</span>
        {hasCoverage
          ? <span style={{ color:'var(--ok)', fontWeight:600 }}>✓ couvert</span>
          : <span style={{ color:'var(--text3)' }}>non couvert</span>
        }
      </div>

      {/* Postes couverts */}
      {relevant.map(p => (
        <div key={p.id} style={{
          padding:'8px 12px', borderTop:'1px solid var(--border)',
          display:'grid', gridTemplateColumns:'1fr auto auto',
          alignItems:'center', gap:10,
        }}>
          <span style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--text)' }}>{p.lbl}</span>
          {/* Barre de progression */}
          <div style={{
            width:160, height:7, background:'var(--surface2)',
            borderRadius:4, overflow:'hidden',
          }}>
            <div style={{
              width:`${barPct(affMap[p.id])}%`, height:'100%',
              background:p.c, borderRadius:4, transition:'width .4s ease',
            }} />
          </div>
          <span style={{
            fontSize:11, fontFamily:'sans-serif', fontWeight:600,
            color:'var(--text)', minWidth:52, textAlign:'right',
          }}>
            {affMap[p.id]} sem.
          </span>
        </div>
      ))}

      {/* Postes non couverts dans ce groupe */}
      {notCovered.map(p => (
        <div key={p.id} style={{
          padding:'7px 12px', borderTop:'1px solid var(--border)',
          display:'grid', gridTemplateColumns:'1fr auto auto',
          alignItems:'center', gap:10, opacity:.45,
        }}>
          <span style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--text2)' }}>{p.lbl}</span>
          <div style={{ width:160, height:7, background:'var(--surface2)', borderRadius:4 }} />
          <span style={{ fontSize:10, fontFamily:'sans-serif', color:'var(--text3)', minWidth:52, textAlign:'right' }}>
            0 sem.
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Indicateur chiffré ─────────────────────────────────────

function Kpi({ value, label, color }) {
  return (
    <div style={{ textAlign:'center', minWidth:60 }}>
      <div style={{ fontSize:22, fontWeight:'bold', color: color || 'var(--accent)', lineHeight:1 }}>
        {value}
      </div>
      <div style={{ fontSize:9, fontFamily:'sans-serif', color:'var(--text2)', marginTop:2, lineHeight:1.3 }}>
        {label}
      </div>
    </div>
  );
}
