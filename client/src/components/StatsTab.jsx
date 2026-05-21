// components/StatsTab.jsx
import { useState } from 'react';
import { POSTES, TYPE_LBL, getMonday } from '../utils';
import * as api from '../api';

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

export default function StatsTab({ medecins }) {
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState(null); // med object
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [open,     setOpen]     = useState(false); // dropdown visible

  const totalWeeks = getTotalWeeksYear();
  const year       = new Date().getFullYear();

  // Filtre de la dropdown
  const q        = search.trim().toLowerCase();
  const filtered = q ? medecins.filter(m => m.nom.toLowerCase().includes(q)) : medecins;

  async function selectMed(med) {
    setSelected(med);
    setSearch(med.nom);
    setOpen(false);
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
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => { setSearch(e.target.value); setSelected(null); setStats(null); setOpen(true); }}
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
          <div style={{
            position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:200,
            background:'var(--surface)', border:'1px solid var(--border2)',
            borderRadius:'var(--r)', boxShadow:'0 4px 16px rgba(0,0,0,.12)',
            maxHeight:220, overflowY:'auto',
          }}>
            {filtered.map(m => (
              <div key={m.id}
                onMouseDown={() => selectMed(m)}
                style={{
                  padding:'8px 12px', cursor:'pointer',
                  fontSize:12, fontFamily:'sans-serif',
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  borderBottom:'1px solid var(--border)',
                }}>
                <span style={{ fontWeight:600 }}>{m.nom}</span>
                <span style={{ fontSize:10, color:'var(--text2)' }}>{TYPE_LBL[m.type]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── État vide ── */}
      {!selected && !loading && (
        <div style={{
          textAlign:'center', padding:'3rem 1rem',
          fontFamily:'sans-serif', color:'var(--text3)', fontSize:13,
        }}>
          <div style={{ fontSize:32, marginBottom:8 }}>👤</div>
          Recherchez un praticien pour afficher son récapitulatif de rotation depuis le début de l'année.
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
        <MedecinStats med={selected} stats={stats} totalWeeks={totalWeeks} year={year} />
      )}
    </div>
  );
}

// ── Fiche de synthèse ──────────────────────────────────────

function MedecinStats({ med, stats, totalWeeks, year }) {
  const { affectations, absences } = stats;

  // Map poste_id → semaines
  const affMap = {};
  affectations.forEach(a => { affMap[a.poste_id] = Number(a.semaines); });

  const totalSemaines = affectations.reduce((s, a) => s + Number(a.semaines), 0);
  const groupsCovered = new Set(
    affectations.map(a => POSTES.find(p => p.id === a.poste_id)?.grp).filter(Boolean)
  );
  const totalAbsDays = absences.reduce((n, a) => n + countWorkingDays(a.date_debut, a.date_fin), 0);

  // Pour les barres : base = totalWeeks, cap à 100 %
  const barPct = (s) => Math.min(Math.round((s / Math.max(totalWeeks, 1)) * 100), 100);

  return (
    <div>

      {/* ── Carte d'en-tête ── */}
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
          <Kpi value={groupsCovered.size}  label="services couverts" />
          <Kpi value={totalSemaines}        label="semaines affectées" />
          <Kpi value={totalWeeks}           label={`semaines ${year}`}    color="var(--text3)" />
          {totalAbsDays > 0 && <Kpi value={totalAbsDays} label="jours d'absence" color="var(--warn)" />}
        </div>
      </div>

      {/* ── Rotation par service ── */}
      <div className="sec-s" style={{ marginBottom:12 }}>Rotation par service — {year}</div>

      {affectations.length === 0 && (
        <p style={{ fontFamily:'sans-serif', fontSize:12, color:'var(--text3)', marginBottom:16 }}>
          Aucune affectation enregistrée depuis le 01/01/{year}.
        </p>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:24 }}>
        {POSTES_BY_GROUP.map(({ grp, postes }) => {
          // N'afficher que les postes de ce groupe qui ont des données
          const relevant = postes.filter(p => affMap[p.id]);
          const uncovered = postes.filter(p => !affMap[p.id]);
          if (relevant.length === 0 && uncovered.length === postes.length && affectations.length > 0) {
            // Groupe non couvert → on l'affiche en gris pour signaler le manque
          }
          return (
            <GroupBlock
              key={grp}
              grp={grp}
              postes={postes}
              relevant={relevant}
              affMap={affMap}
              barPct={barPct}
            />
          );
        })}
      </div>

      {/* ── Absences ── */}
      {absences.length > 0 && (
        <>
          <div className="sec-s" style={{ marginBottom:10 }}>
            Absences {year} — {totalAbsDays} jour{totalAbsDays > 1 ? 's' : ''} ouvré{totalAbsDays > 1 ? 's' : ''}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:16 }}>
            {absences.map((a, i) => (
              <div key={i} style={{
                background:'var(--warn-bg)', border:'1px solid var(--warn-bd)',
                borderRadius:'var(--r)', padding:'5px 10px',
                fontSize:11, fontFamily:'sans-serif',
                display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
              }}>
                <span style={{ color:'var(--warn)', fontWeight:600 }}>{a.type_abs}</span>
                <span style={{ color:'var(--text2)' }}>
                  {fmtDate(a.date_debut)} → {fmtDate(a.date_fin)}
                  {' '}({countWorkingDays(a.date_debut, a.date_fin)} jour{countWorkingDays(a.date_debut, a.date_fin) > 1 ? 's' : ''})
                </span>
              </div>
            ))}
          </div>
        </>
      )}
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
