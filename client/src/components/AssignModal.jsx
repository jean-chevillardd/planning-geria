// components/AssignModal.jsx
import { useMemo, useState, useEffect } from 'react';
import { TYPE_LBL, worksDay, worksWeekAny, isAbsent,
         countDemiJournees, toIso } from '../utils';

// ── Helpers de rendu (définis hors composant pour stabilité React) ──

function MedRow({ m, label, warn, onClick }) {
  return (
    <div className="mitem" onClick={onClick}>
      <span style={{ fontSize:12 }}>{m.nom} <span className="mtag">{TYPE_LBL[m.type]}</span></span>
      <span className={warn ? 'mwarn' : 'minfo'}>{label}</span>
    </div>
  );
}

function MedRowOff({ m, reason }) {
  return (
    <div className="mitem dis" style={{ cursor:'not-allowed' }}>
      <span style={{ fontSize:12 }}>{m.nom} <span className="mtag">{TYPE_LBL[m.type]}</span></span>
      <span className="minfo">{reason}</span>
    </div>
  );
}

function ToggleOff({ count, open, onToggle }) {
  if (!count) return null;
  return (
    <button onClick={onToggle} style={{
      width:'100%', textAlign:'left', background:'none', border:'none',
      borderTop:'1px dashed var(--border)', marginTop:2,
      padding:'5px 8px', cursor:'pointer',
      fontSize:10, fontFamily:'sans-serif', color:'var(--text3)',
      display:'flex', alignItems:'center', gap:4,
    }}>
      <span style={{ fontSize:8 }}>{open ? '▲' : '▼'}</span>
      {open ? 'Masquer' : `Voir ${count}`} praticien{count > 1 ? 's' : ''} indisponible{count > 1 ? 's' : ''}
    </button>
  );
}

export default function AssignModal({ poste, dayIso, monday, planningData, medecins, absences, onClose, onAction }) {
  const [search,         setSearch]         = useState('');
  const [showWeeklyOff,  setShowWeeklyOff]  = useState(false);
  const [showDailyOff,   setShowDailyOff]   = useState(false);

  const weekKey    = toIso(monday);
  const byPoste    = planningData?.affectations || {};
  const exclusions = planningData?.exclusions   || [];
  const extras     = planningData?.extras       || [];

  const assigned = byPoste[poste?.id]?.medecins || [];

  const takenThisWeek = useMemo(() => {
    const set = new Set();
    Object.values(byPoste).forEach(p => p.medecins?.forEach(m => set.add(m.id)));
    return set;
  }, [byPoste]);

  // Esc → fermer
  useEffect(() => {
    function h(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  if (!poste || !dayIso) return null;

  const isExcluded = medId => exclusions.some(e => e.poste_id === poste.id && e.med_id === medId && e.jour === dayIso);
  const isExtra    = medId => extras.some(e => e.poste_id === poste.id && e.med_id === medId && e.jour === dayIso);

  const dayLabel = new Date(dayIso + 'T12:00:00')
    .toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });

  const groups = [
    { label:'Praticiens hospitaliers', types:['ph'] },
    { label:'IPA',                     types:['ipa'] },
    { label:'Internes',                types:['interne'] },
    { label:'Externes',                types:['externe'] },
    { label:'PADHUE',                  types:['padhue'] },
  ];

  const candidates    = medecins.filter(m => poste.intern ? m.type === 'interne' : m.type !== 'interne');
  const excludedToday = assigned.filter(m => isExcluded(m.id));
  const extrasToday   = extras.filter(e => e.poste_id === poste.id && e.jour === dayIso);

  const presentToday = new Set([
    ...assigned.filter(m => worksDay(m, dayIso, absences) && !isExcluded(m.id)).map(m => m.id),
    ...extrasToday.map(e => e.med_id),
  ]);

  // ── Filtrage par recherche ──────────────────────────────
  const q          = search.trim().toLowerCase();
  const searching  = q.length > 0;
  const filtered   = searching
    ? candidates.filter(m => m.nom.toLowerCase().includes(q))
    : candidates;

  // ── Données section "Toute la semaine" ─────────────────
  const weeklyBase = filtered.filter(m => !assigned.find(a => a.id === m.id) && !isExtra(m.id));
  const weeklyByGroup = groups.map(g => {
    const list     = weeklyBase.filter(m => g.types.includes(m.type));
    const enabled  = list.filter(m => !takenThisWeek.has(m.id) && worksWeekAny(m, monday, absences));
    const disabled = list.filter(m =>  takenThisWeek.has(m.id) || !worksWeekAny(m, monday, absences));
    return { ...g, enabled, disabled, total: list.length };
  });
  const totalWeeklyOff = weeklyByGroup.reduce((s, g) => s + g.disabled.length, 0);

  // ── Données section "Ce jour uniquement" ───────────────
  // Exclure ceux déjà présents à ce poste aujourd'hui
  const notPresentToday = filtered.filter(m => !presentToday.has(m.id));
  // "Disponibles" = pas absent ce jour, pas engagé ailleurs cette semaine
  const dailyAvail   = notPresentToday.filter(m => !isAbsent(m.id, dayIso, absences) && !takenThisWeek.has(m.id));
  // Travaille normalement ce jour (planning habituel)
  const dailyEnabled = dailyAvail.filter(m =>  worksDay(m, dayIso, absences));
  // Disponible mais hors planning habituel (peut quand même assurer un remplacement ponctuel)
  const dailyExtra   = dailyAvail.filter(m => !worksDay(m, dayIso, absences));
  // Vraiment indisponible : absent (congé) ou déjà engagé sur un autre poste cette semaine
  const dailyOff     = notPresentToday.filter(m => isAbsent(m.id, dayIso, absences) || takenThisWeek.has(m.id));

  return (
    <div className="mbg open" onClick={e => e.target.classList.contains('mbg') && onClose()}>
      <div className="mbox">

        {/* ── En-tête ── */}
        <div className="mhead">
          <div className="mttl">{poste.lbl}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="msub">
          <strong>{dayLabel}</strong><br />
          Affectation semaine entière, ou remplacement ponctuel.
        </div>

        {/* ── Affectés cette semaine ── */}
        {assigned.length > 0 && (
          <>
            <div className="msep">Affectés cette semaine</div>
            {assigned.map(m => {
              const excl   = isExcluded(m.id);
              const works  = worksDay(m, dayIso, absences);
              const absent = isAbsent(m.id, dayIso, absences);
              return (
                <div key={m.id} className="mitem" style={{ cursor:'default' }}>
                  <span style={{ fontSize:12 }}>{m.nom}</span>
                  <span style={{ display:'flex', gap:6, alignItems:'center' }}>
                    {excl              && <span className="minfo">Retiré ce jour</span>}
                    {absent && !excl   && <span className="minfo">Absent (congé)</span>}
                    {works  && !excl   && <span className="mok">✓ présent</span>}
                    {!works && !excl && !absent && <span className="minfo">Jour non travaillé</span>}
                    {excl
                      ? <button className="btn-xs btn-ok"
                          onClick={() => onAction('del_exclusion', { week_key:weekKey, poste_id:poste.id, med_id:m.id, jour:dayIso })}>
                          Restaurer
                        </button>
                      : works && <button className="btn-xs btn-warn"
                          onClick={() => onAction('add_exclusion', { week_key:weekKey, poste_id:poste.id, med_id:m.id, jour:dayIso })}>
                          Retirer ce jour
                        </button>
                    }
                    <button className="btn-xs btn-danger"
                      onClick={() => onAction('del_affectation', { week_key:weekKey, poste_id:poste.id, med_id:m.id })}>
                      Retirer sem.
                    </button>
                  </span>
                </div>
              );
            })}
          </>
        )}

        {/* ── Bandeau si praticien retiré ce jour ── */}
        {excludedToday.length > 0 && (
          <div style={{
            margin:'8px 0 2px', padding:'6px 10px',
            background:'var(--warn-bg)', border:'1px solid var(--warn-bd)',
            borderRadius:'var(--r)', fontSize:10, fontFamily:'sans-serif',
            color:'var(--warn)', lineHeight:1.5,
          }}>
            ⚠ {excludedToday.map(m => m.nom).join(', ')} {excludedToday.length > 1 ? 'sont retirés' : 'est retiré(e)'} ce jour.
            Recherchez un remplaçant ponctuel ci-dessous.
          </div>
        )}

        {/* ── Remplaçants déjà ajoutés ce jour ── */}
        {extrasToday.length > 0 && (
          <>
            <div className="msep">Remplaçants ce jour</div>
            {extrasToday.map(e => (
              <div key={e.med_id} className="mitem" style={{ cursor:'default' }}>
                <span style={{ fontSize:12 }}>{e.nom} <span className="mtag">remplac.</span></span>
                <button className="btn-xs btn-danger"
                  onClick={() => onAction('del_extra', { week_key:weekKey, poste_id:poste.id, med_id:e.med_id, jour:dayIso })}>
                  Retirer
                </button>
              </div>
            ))}
          </>
        )}

        {/* ── Barre de recherche ── */}
        <div style={{ padding:'8px 0 2px', position:'relative' }}>
          <input
            type="text"
            className="team-search"
            placeholder="Rechercher un praticien…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer',
              color:'var(--text3)', fontSize:14, lineHeight:1,
            }}>×</button>
          )}
        </div>

        {/* ═══════════════════════════════════════════════
            Section 1 — Affecter pour toute la semaine
        ════════════════════════════════════════════════ */}
        <div className="msep">Affecter pour toute la semaine</div>

        {weeklyByGroup.every(g => g.total === 0) && (
          <p style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--text3)', padding:'4px 8px' }}>
            {searching ? 'Aucun résultat.' : 'Tous les praticiens sont déjà affectés.'}
          </p>
        )}

        {weeklyByGroup.map(g => {
          if (!g.total) return null;
          const showOff = searching || showWeeklyOff;
          return (
            <div key={g.label}>
              {(g.enabled.length > 0 || showOff) && (
                <div className="msep" style={{ paddingTop:4, fontSize:9 }}>{g.label}</div>
              )}
              {g.enabled.map(m => {
                const dj        = countDemiJournees(m);
                const worksThis = worksDay(m, dayIso, absences);
                const absentToday = !worksThis && isAbsent(m.id, dayIso, absences);
                const offSched    = !worksThis && !absentToday;
                const suffix = absentToday ? ' · en congé ce jour'
                             : offSched    ? ' · hors planning ce jour'
                             : '';
                return (
                  <MedRow key={m.id} m={m}
                    label={`${Math.round(dj/10*100)}%${suffix}`}
                    onClick={() => onAction('add_affectation', { week_key:weekKey, poste_id:poste.id, med_id:m.id })}
                  />
                );
              })}
              {showOff && g.disabled.map(m => (
                <MedRowOff key={m.id} m={m}
                  reason={takenThisWeek.has(m.id) ? 'Déjà affecté ailleurs' : 'Absent cette semaine'} />
              ))}
            </div>
          );
        })}

        {!searching && (
          <ToggleOff
            count={totalWeeklyOff}
            open={showWeeklyOff}
            onToggle={() => setShowWeeklyOff(v => !v)}
          />
        )}

        {/* ═══════════════════════════════════════════════
            Section 2 — Remplaçant pour ce jour uniquement
        ════════════════════════════════════════════════ */}
        <div className="msep" style={{ marginTop:4, color: excludedToday.length > 0 ? 'var(--warn)' : undefined }}>
          Remplaçant pour ce jour uniquement
        </div>

        {dailyEnabled.length === 0 && dailyExtra.length === 0 && (searching || dailyOff.length === 0) && (
          <p style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--text3)', padding:'4px 8px' }}>
            {searching ? 'Aucun résultat.' : 'Aucun praticien disponible ce jour.'}
          </p>
        )}

        {dailyEnabled.map(m => (
          <MedRow key={m.id} m={m}
            label="Disponible"
            onClick={() => onAction('add_extra', { week_key:weekKey, poste_id:poste.id, med_id:m.id, jour:dayIso })}
          />
        ))}

        {dailyExtra.map(m => (
          <MedRow key={m.id} m={m}
            label="Hors planning habituel"
            warn
            onClick={() => onAction('add_extra', { week_key:weekKey, poste_id:poste.id, med_id:m.id, jour:dayIso })}
          />
        ))}

        {(searching || showDailyOff) && dailyOff.map(m => (
          <MedRowOff key={m.id} m={m}
            reason={
              takenThisWeek.has(m.id)           ? 'Déjà affecté ailleurs'
              :                                    'En congé ce jour'
            }
          />
        ))}

        {!searching && (
          <ToggleOff
            count={dailyOff.length}
            open={showDailyOff}
            onToggle={() => setShowDailyOff(v => !v)}
          />
        )}

      </div>
    </div>
  );
}
