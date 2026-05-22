// components/AssignModal.jsx
import { useMemo, useState, useEffect } from 'react';
import { TYPE_LBL, worksDay, worksWeekAny, isAbsent, toIso } from '../utils';

export default function AssignModal({ poste, dayIso, monday, planningData, medecins, absences, onClose, onAction }) {
  const [search, setSearch] = useState('');

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

  const excludedToday = assigned.filter(m => isExcluded(m.id));
  const extrasToday   = extras.filter(e => e.poste_id === poste.id && e.jour === dayIso);

  const presentToday = new Set([
    ...assigned.filter(m => worksDay(m, dayIso, absences) && !isExcluded(m.id)).map(m => m.id),
    ...extrasToday.map(e => e.med_id),
  ]);

  // ── Recherche ──────────────────────────────────────────────
  const q         = search.trim().toLowerCase();
  const searching = q.length > 0;

  const candidates    = medecins.filter(m => poste.intern ? m.type === 'interne' : m.type !== 'interne');
  const searchResults = searching ? candidates.filter(m => m.nom.toLowerCase().includes(q)) : [];

  // Disponibilité pour "Affecter à la semaine"
  function weekAvail(m) {
    if (assigned.find(a => a.id === m.id))   return { ok:false, reason:'Déjà affecté cette semaine' };
    if (isExtra(m.id))                        return { ok:false, reason:'Remplaçant ponctuel ce jour' };
    if (takenThisWeek.has(m.id))              return { ok:false, reason:'Déjà affecté ailleurs cette semaine' };
    if (!worksWeekAny(m, monday, absences))   return { ok:false, reason:'Absent toute la semaine' };
    return { ok:true };
  }

  // Disponibilité pour "Affecter ce jour"
  function dayAvail(m) {
    if (presentToday.has(m.id))               return { ok:false, reason:'Déjà présent à ce poste' };
    if (isAbsent(m.id, dayIso, absences))     return { ok:false, reason:'En congé ce jour' };
    return { ok:true };
  }

  return (
    <div className="mbg open" onClick={e => e.target.classList.contains('mbg') && onClose()}>
      <div className="mbox">

        {/* ── En-tête ── */}
        <div className="mhead">
          <div className="mttl">{poste.lbl}</div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>
        <div className="msub">
          <strong>{dayLabel}</strong>
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
                    {excl                          && <span className="minfo">Retiré ce jour</span>}
                    {absent && !excl               && <span className="minfo">Absent (congé)</span>}
                    {works  && !excl               && <span className="mok">✓ présent</span>}
                    {!works && !excl && !absent    && <span className="minfo">Jour non travaillé</span>}
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

        {/* ── Bandeau praticien retiré ce jour ── */}
        {excludedToday.length > 0 && (
          <div style={{
            margin:'8px 0 2px', padding:'6px 10px',
            background:'var(--warn-bg)', border:'1px solid var(--warn-bd)',
            borderRadius:'var(--r)', fontSize:10, fontFamily:'sans-serif',
            color:'var(--warn)', lineHeight:1.5,
          }}>
            ⚠ {excludedToday.map(m => m.nom).join(', ')} {excludedToday.length > 1 ? 'sont retirés' : 'est retiré(e)'} ce jour.
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
        <div style={{ padding:'8px 0 4px', position:'relative' }}>
          <input
            type="text"
            className="team-search"
            placeholder="Rechercher un praticien…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer',
              color:'var(--text3)', fontSize:14, lineHeight:1,
            }}>×</button>
          )}
        </div>

        {/* ── Résultats de recherche ── */}
        {searching && (
          <>
            {searchResults.length === 0 ? (
              <p style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--text3)', padding:'4px 8px' }}>
                Aucun résultat.
              </p>
            ) : (
              searchResults.map(m => {
                const wa = weekAvail(m);
                const da = dayAvail(m);
                return (
                  <div key={m.id} className="mitem" style={{ cursor:'default', flexWrap:'nowrap' }}>
                    <span style={{ fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', minWidth:0, flex:'1 1 0' }}>
                      {m.nom} <span className="mtag">{TYPE_LBL[m.type]}</span>
                    </span>
                    <span style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0 }}>
                      <button
                        className="btn-xs btn-primary"
                        disabled={!da.ok}
                        title={da.ok ? 'Remplacement ponctuel ce jour' : da.reason}
                        onClick={da.ok ? () => onAction('add_extra', { week_key:weekKey, poste_id:poste.id, med_id:m.id, jour:dayIso }) : undefined}
                      >
                        Ce jour
                      </button>
                      <button
                        className="btn-xs btn-primary"
                        disabled={!wa.ok}
                        title={wa.ok ? 'Affecter pour toute la semaine' : wa.reason}
                        onClick={wa.ok ? () => onAction('add_affectation', { week_key:weekKey, poste_id:poste.id, med_id:m.id }) : undefined}
                      >
                        À la semaine
                      </button>
                    </span>
                  </div>
                );
              })
            )}
          </>
        )}

      </div>
    </div>
  );
}
