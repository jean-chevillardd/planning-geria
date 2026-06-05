// components/AssignModal.jsx
import { useMemo, useState, useEffect } from 'react';
import { TYPE_LBL, worksDay, worksWeekAny, isAbsent, toIso, weekDays, getDisponiblesPH } from '../utils';

export default function AssignModal({ poste, dayIso, monday, planningData, medecins, absences, onClose, onAction }) {
  const [search, setSearch] = useState('');

  const weekKey    = toIso(monday);
  const byPoste    = planningData?.affectations || {};
  const exclusions = planningData?.exclusions   || [];
  const extras     = planningData?.extras       || [];
  const renforts   = planningData?.renforts     || [];

  const combineWith = poste?.combineWith ?? null;

  // Memoïsé car utilisé comme dépendance dans takenThisWeek
  const allPosteIds = useMemo(
    () => poste ? [poste.id, ...(combineWith ? [combineWith] : [])] : [],
    [poste?.id, combineWith],
  );

  // Fusion postes combinés (ex. csg1a + csg1i1) avec tag _posteId pour les opérations
  const assigned = [
    ...(byPoste[poste?.id]?.medecins  || []).map(m => ({ ...m, _posteId: poste?.id })),
    ...(combineWith ? (byPoste[combineWith]?.medecins || []).map(m => ({ ...m, _posteId: combineWith })) : []),
  ];

  // Cible correcte pour les affectations : internes → combineWith, autres → poste principal
  function targetPosteId(m) {
    if (combineWith && m.type === 'interne') return combineWith;
    return poste.id;
  }

  // Un PH avec affectation régulière ou renfort dans un AUTRE poste cette semaine ne peut pas
  // être affecté à la semaine ici. Les extras (remplaçants ponctuels) sont tolérés : les jours
  // concernés seront automatiquement exclus à la confirmation.
  const takenThisWeek = useMemo(() => {
    const set = new Set();
    Object.values(byPoste).forEach(p => p.medecins?.forEach(m => set.add(m.id)));
    renforts.forEach(r => { if (!allPosteIds.includes(r.poste_id)) set.add(r.med_id); });
    return set;
  }, [byPoste, renforts, allPosteIds]);

  // Jours où le praticien est déjà remplaçant (extra) dans un AUTRE poste cette semaine
  const extraConflictsThisWeek = useMemo(() => {
    const map = new Map();
    extras.forEach(e => {
      if (allPosteIds.includes(e.poste_id)) return;
      if (!map.has(e.med_id)) map.set(e.med_id, []);
      map.get(e.med_id).push(e.jour);
    });
    return map;
  }, [extras, allPosteIds]);

  // Esc → fermer
  useEffect(() => {
    function h(e) { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  if (!poste || !dayIso) return null;

  const isExcluded = m => exclusions.some(e => e.poste_id === m._posteId && e.med_id === m.id && e.jour === dayIso);

  const dayLabel = new Date(dayIso + 'T12:00:00')
    .toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });

  const excludedToday = assigned.filter(m => isExcluded(m));
  const extrasToday   = extras.filter(e => allPosteIds.includes(e.poste_id) && e.jour === dayIso);
  const renfortsToday = renforts.filter(r => allPosteIds.includes(r.poste_id) && r.jour === dayIso);

  // Présents à CE poste (ou ses sous-postes) ce jour
  const presentToday = new Set([
    ...assigned.filter(m => worksDay(m, dayIso, absences) && !isExcluded(m)).map(m => m.id),
    ...extrasToday.map(e => e.med_id),
  ]);

  // En poste AILLEURS ce jour (exclut le poste principal ET combineWith)
  const takenToday = new Set();
  Object.entries(byPoste).forEach(([pid, data]) => {
    if (allPosteIds.includes(pid)) return;
    data.medecins?.forEach(m => {
      const excl = exclusions.some(e => e.poste_id === pid && e.med_id === m.id && e.jour === dayIso);
      if (!excl && worksDay(m, dayIso, absences)) takenToday.add(m.id);
    });
  });
  extras.forEach(e => { if (!allPosteIds.includes(e.poste_id) && e.jour === dayIso) takenToday.add(e.med_id); });

  // ── PH disponibles cette semaine (même source que le panneau latéral) ──
  const days = useMemo(() => weekDays(monday), [monday]);
  const disponibles = useMemo(
    () => getDisponiblesPH(medecins, absences, days, byPoste, exclusions, extras),
    [medecins, absences, days, byPoste, exclusions, extras],
  );

  // ── Recherche ──────────────────────────────────────────────
  const q         = search.trim().toLowerCase();
  const searching = q.length > 0;

  // Tous les praticiens actifs sont cherchables ; pour les postes combinés (csg1a+csg1i1)
  // toutes les catégories sont affichées — la fonction targetPosteId route au bon sous-poste.
  // Recherche sur le nom ET sur le type (ex : "interne", "externe", "padhue", "ph").
  const candidates    = medecins.filter(m => m.type !== 'externe');
  const searchResults = searching ? candidates.filter(m =>
    m.nom.toLowerCase().includes(q) ||
    m.type.toLowerCase().includes(q) ||
    (TYPE_LBL[m.type] || '').toLowerCase().includes(q)
  ) : [];

  // ── Disponibilité "Affecter ce jour" (remplacement ponctuel) ──
  // Bloqué si : déjà présent ici aujourd'hui, en congé, ou en poste ailleurs ce jour
  function dayAvail(m) {
    if (presentToday.has(m.id))           return { ok:false, reason:'Déjà présent à ce poste aujourd\'hui' };
    if (isAbsent(m.id, dayIso, absences)) return { ok:false, reason:'En congé ce jour' };
    if (takenToday.has(m.id))             return { ok:false, reason:'Déjà en poste ailleurs — utiliser Renfort' };
    return { ok:true };
  }

  // ── Disponibilité "Renfort" ──
  // Possible uniquement si le médecin est déjà en poste ailleurs ce jour
  function renfortAvail(m) {
    if (!takenToday.has(m.id))            return { ok:false, reason:'Le médecin doit déjà être en poste ce jour' };
    if (presentToday.has(m.id))           return { ok:false, reason:'Déjà présent à ce poste aujourd\'hui' };
    if (isAbsent(m.id, dayIso, absences)) return { ok:false, reason:'En congé ce jour' };
    if (renfortsToday.some(r => r.med_id === m.id)) return { ok:false, reason:'Déjà en renfort ici ce jour' };
    return { ok:true };
  }

  // ── Disponibilité "Affecter à la semaine" ──
  // Bloqué si : déjà affecté à ce poste, affecté/renfort ailleurs cette semaine,
  // déjà remplaçant ou renfort ICI (doublon sur le(s) jour(s) concerné(s)),
  // ou n'a aucun jour travaillé cette semaine.
  // Si remplaçant ponctuel ailleurs → autorisé avec auto-exclusion sur ces jours.
  function weekAvail(m) {
    if (assigned.find(a => a.id === m.id)) return { ok:false, reason:'Déjà affecté cette semaine' };
    if (takenThisWeek.has(m.id))           return { ok:false, reason:'Déjà affecté ailleurs cette semaine' };
    if (extras.some(e => allPosteIds.includes(e.poste_id) && e.med_id === m.id))
      return { ok:false, reason:'Déjà remplaçant ici ce(s) jour(s) — retirer le remplacement avant d\'affecter à la semaine' };
    if (renforts.some(r => allPosteIds.includes(r.poste_id) && r.med_id === m.id))
      return { ok:false, reason:'Déjà en renfort ici ce(s) jour(s) — retirer le renfort avant d\'affecter à la semaine' };
    if (!worksWeekAny(m, monday, absences)) return { ok:false, reason:'Aucun jour disponible cette semaine' };
    const autoExcludeDays = extraConflictsThisWeek.get(m.id) || [];
    return { ok:true, autoExcludeDays };
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
              const excl   = isExcluded(m);
              const works  = worksDay(m, dayIso, absences);
              const absent = isAbsent(m.id, dayIso, absences);
              return (
                <div key={m.id + m._posteId} className="mitem" style={{ cursor:'default' }}>
                  <span style={{ fontSize:12 }}>{m.nom}
                    {m._posteId === combineWith && (
                      <span className="mtag" style={{ marginLeft:4 }}>interne</span>
                    )}
                  </span>
                  <span style={{ display:'flex', gap:6, alignItems:'center' }}>
                    {excl                          && <span className="minfo">Retiré ce jour</span>}
                    {absent && !excl               && <span className="minfo">Absent (congé)</span>}
                    {works  && !excl               && <span className="mok">✓ présent</span>}
                    {!works && !excl && !absent    && <span className="minfo">Jour non travaillé</span>}
                    {excl
                      ? <button className="btn-xs btn-ok"
                          onClick={() => onAction('del_exclusion', { week_key:weekKey, poste_id:m._posteId, med_id:m.id, jour:dayIso })}>
                          Restaurer
                        </button>
                      : works && <button className="btn-xs btn-warn"
                          onClick={() => onAction('add_exclusion', { week_key:weekKey, poste_id:m._posteId, med_id:m.id, jour:dayIso })}>
                          Retirer ce jour
                        </button>
                    }
                    <button className="btn-xs btn-danger"
                      onClick={() => onAction('del_affectation', { week_key:weekKey, poste_id:m._posteId, med_id:m.id })}>
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

        {/* ── Renforts déjà ajoutés ce jour ── */}
        {renfortsToday.length > 0 && (
          <>
            <div className="msep" style={{ color:'#d97706' }}>Renforts ce jour</div>
            {renfortsToday.map(r => (
              <div key={r.med_id} className="mitem" style={{ cursor:'default' }}>
                <span style={{ fontSize:12 }}>
                  {r.nom}
                  <span style={{
                    marginLeft:5, fontSize:9, borderRadius:3, padding:'1px 5px',
                    background:'#d9770618', border:'1px solid #d9770655', color:'#b45309', fontWeight:700,
                  }}>renfort</span>
                </span>
                <button className="btn-xs btn-danger"
                  onClick={() => onAction('del_renfort', { week_key:weekKey, poste_id:poste.id, med_id:r.med_id, jour:dayIso })}>
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
              searchResults.map(m => <CandidateRow key={m.id} m={m} subtitle={TYPE_LBL[m.type]}
                dayAvail={dayAvail} weekAvail={weekAvail} renfortAvail={renfortAvail}
                takenToday={takenToday} weekKey={weekKey} dayIso={dayIso}
                targetPosteId={targetPosteId} onAction={onAction} />)
            )}
          </>
        )}

        {/* ── PH disponibles (liste par défaut quand pas de recherche) ── */}
        {!searching && (
          <>
            {disponibles.full.length > 0 && (
              <>
                <div className="msep">PH disponibles — présents toute la semaine</div>
                {disponibles.full.map(m => <CandidateRow key={m.id} m={m} subtitle={m.schedNote || TYPE_LBL[m.type]}
                  dayAvail={dayAvail} weekAvail={weekAvail} renfortAvail={renfortAvail}
                  takenToday={takenToday} weekKey={weekKey} dayIso={dayIso}
                  targetPosteId={targetPosteId} onAction={onAction} />)}
              </>
            )}
            {disponibles.partial.length > 0 && (
              <>
                <div className="msep">PH disponibles — présents partiellement</div>
                {disponibles.partial.map(m => <CandidateRow key={m.id} m={m} subtitle={m.joursPresents?.join(' ')}
                  dayAvail={dayAvail} weekAvail={weekAvail} renfortAvail={renfortAvail}
                  takenToday={takenToday} weekKey={weekKey} dayIso={dayIso}
                  targetPosteId={targetPosteId} onAction={onAction} />)}
              </>
            )}
            {disponibles.full.length === 0 && disponibles.partial.length === 0 && (
              <p style={{ fontSize:11, fontFamily:'sans-serif', color:'var(--text3)', padding:'4px 8px' }}>
                Aucun PH disponible cette semaine. Rechercher un praticien ci-dessus.
              </p>
            )}
          </>
        )}

      </div>
    </div>
  );
}

function fmtExcludeDays(dayIsos) {
  return dayIsos
    .map(d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'short', day:'numeric' }))
    .join(', ');
}

// ── Ligne candidat (search + liste disponibles) ──────────────
function CandidateRow({ m, subtitle, dayAvail, weekAvail, renfortAvail, takenToday, weekKey, dayIso, targetPosteId, onAction }) {
  const wa = weekAvail(m);
  const da = dayAvail(m);
  const ra = renfortAvail(m);
  const hasAutoExclude = wa.ok && wa.autoExcludeDays?.length > 0;
  return (
    <div className="mitem" style={{ cursor:'default', flexWrap:'nowrap' }}>
      <span style={{ fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', minWidth:0, flex:'1 1 0' }}>
        {m.nom}
        {subtitle && <span className="mtag" style={{ marginLeft:4 }}>{subtitle}</span>}
      </span>
      <span style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0 }}>
        {(ra.ok || takenToday.has(m.id)) && (
          <button
            className="btn-xs btn-renfort"
            disabled={!ra.ok}
            title={ra.ok ? 'Ajouter en double tâche (déjà en poste ailleurs ce jour)' : ra.reason}
            onClick={ra.ok ? () => onAction('add_renfort', { week_key:weekKey, poste_id:targetPosteId(m), med_id:m.id, jour:dayIso }) : undefined}
          >
            Renfort
          </button>
        )}
        <button
          className="btn-xs btn-primary"
          disabled={!da.ok}
          title={da.ok ? 'Remplacement ponctuel ce jour' : da.reason}
          onClick={da.ok ? () => onAction('add_extra', { week_key:weekKey, poste_id:targetPosteId(m), med_id:m.id, jour:dayIso }) : undefined}
        >
          Ce jour
        </button>
        <button
          className="btn-xs btn-primary"
          disabled={!wa.ok}
          title={wa.ok
            ? (hasAutoExclude
                ? `Affecter à la semaine — sera exclu automatiquement le ${fmtExcludeDays(wa.autoExcludeDays)} (déjà remplaçant)`
                : 'Affecter pour toute la semaine')
            : wa.reason}
          onClick={wa.ok ? () => onAction('add_affectation', {
            week_key:weekKey, poste_id:targetPosteId(m), med_id:m.id,
            ...(hasAutoExclude ? { auto_exclude_days: wa.autoExcludeDays } : {}),
          }) : undefined}
        >
          À la semaine{hasAutoExclude ? ' *' : ''}
        </button>
      </span>
    </div>
  );
}
