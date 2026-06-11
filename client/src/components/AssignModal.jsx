// components/AssignModal.jsx
import { useMemo, useState, useEffect } from 'react';
import { TYPE_LBL, TYPE_RANK, worksDay, worksWeekAny, isAbsent, toIso, weekDays, getDisponiblesPH } from '../utils';

export default function AssignModal({ poste, dayIso, monday, planningData, medecins, absences, onClose, onAction }) {
  const [search,    setSearch]    = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);

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
  ].sort((a, b) => (TYPE_RANK[a.type] ?? 99) - (TYPE_RANK[b.type] ?? 99));

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

  // Esc → fermer + verrouillage scroll body pendant ouverture
  useEffect(() => {
    const saved = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top      = `-${saved}px`;
    document.body.style.width    = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top      = '';
      document.body.style.width    = '';
      window.scrollTo(0, saved);
    };
  }, []);

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

  // Filtre date : praticien présent à la date de la semaine visualisée
  const medecinsPourCetteSemaine = useMemo(
    () => medecins.filter(m =>
      (!m.date_arrivee || m.date_arrivee <= dayIso) &&
      (!m.date_depart  || m.date_depart  >  dayIso)
    ),
    [medecins, dayIso],
  );

  // ── PH disponibles cette semaine (même source que le panneau latéral) ──
  const days = useMemo(() => weekDays(monday), [monday]);
  const disponibles = useMemo(
    () => getDisponiblesPH(medecinsPourCetteSemaine, absences, days, byPoste, exclusions, extras),
    [medecinsPourCetteSemaine, absences, days, byPoste, exclusions, extras],
  );

  // ── Recherche ──────────────────────────────────────────────
  const q         = search.trim().toLowerCase();
  const searching = q.length > 0;

  // Tous les praticiens actifs sont cherchables ; pour les postes combinés (csg1a+csg1i1)
  // toutes les catégories sont affichées — la fonction targetPosteId route au bon sous-poste.
  // Recherche sur le nom ET sur le type (ex : "interne", "externe", "padhue", "ph").
  const candidates    = medecinsPourCetteSemaine.filter(m => m.type !== 'externe');
  const searchResults = searching ? candidates.filter(m =>
    m.nom.toLowerCase().includes(q) ||
    m.type.toLowerCase().includes(q) ||
    (TYPE_LBL[m.type] || '').toLowerCase().includes(q)
  ) : [];

  // ── Disponibilité "Affecter ce jour" (remplacement ponctuel) ──
  // Bloqué si : déjà présent ici aujourd'hui, en congé, en poste ailleurs, ou date_depart atteinte
  function dayAvail(m) {
    if (m.date_depart && dayIso >= m.date_depart) return { ok:false, reason:'Praticien parti à cette date' };
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
  // Si date_depart dans la semaine → auto-exclusion des jours à partir du départ.
  function weekAvail(m) {
    if (assigned.find(a => a.id === m.id)) return { ok:false, reason:'Déjà affecté cette semaine' };
    if (takenThisWeek.has(m.id))           return { ok:false, reason:'Déjà affecté ailleurs cette semaine' };
    if (extras.some(e => allPosteIds.includes(e.poste_id) && e.med_id === m.id))
      return { ok:false, reason:'Déjà remplaçant ici ce(s) jour(s) — retirer le remplacement avant d\'affecter à la semaine' };
    if (renforts.some(r => allPosteIds.includes(r.poste_id) && r.med_id === m.id))
      return { ok:false, reason:'Déjà en renfort ici ce(s) jour(s) — retirer le renfort avant d\'affecter à la semaine' };
    const autoExcludeDays = [...(extraConflictsThisWeek.get(m.id) || [])];
    if (m.date_depart) {
      days.forEach(d => {
        const iso = toIso(d);
        if (iso >= m.date_depart && !autoExcludeDays.includes(iso)) autoExcludeDays.push(iso);
      });
    }
    const daysLeft = days.filter(d => {
      const iso = toIso(d);
      return !autoExcludeDays.includes(iso) && worksDay(m, iso, absences);
    });
    if (daysLeft.length === 0) return { ok:false, reason:'Aucun jour disponible cette semaine' };
    return { ok:true, autoExcludeDays };
  }


  return (
    <div className="mbg open" onClick={e => e.target.classList.contains('mbg') && onClose()}>
      <div className="mbox" style={{ width:440, maxHeight:'88vh' }}>

        {/* ── En-tête ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700 }}>
              Affecter → <span style={{ color: poste.c }}>{poste.lbl}</span>
            </div>
            <div style={{ fontSize:11, color:'var(--text2)', marginTop:3 }}>{dayLabel}</div>
          </div>
          <button className="mclose" onClick={onClose}>×</button>
        </div>

        {/* ── Affectés cette semaine ── */}
        {assigned.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{
              fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
              color:'var(--text2)', paddingBottom:6, marginBottom:6,
              borderBottom:'1px solid var(--border)',
            }}>
              Affectés cette semaine
            </div>
            {assigned.map(m => {
              const excl   = isExcluded(m);
              const works  = worksDay(m, dayIso, absences);
              const absent = isAbsent(m.id, dayIso, absences);
              return (
                <div key={m.id + m._posteId} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0' }}>
                  <span style={{
                    flex:1, fontSize:12,
                    fontWeight: m.type === 'ph' ? 700 : 400,
                    fontStyle:  m.type === 'ph' ? 'normal' : 'italic',
                  }}>
                    {m.nom}
                    {m._posteId === combineWith
                      ? <em style={{ fontSize:10, opacity:.65, fontStyle:'italic', marginLeft:5 }}>interne</em>
                      : TYPE_LBL[m.type] && <em style={{ fontSize:10, opacity:.65, fontStyle:'italic', marginLeft:5 }}>{TYPE_LBL[m.type]}</em>
                    }
                  </span>
                  <span style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                    {excl                          && <span className="minfo">Retiré ce jour</span>}
                    {absent && !excl               && <span className="minfo">Absent (congé)</span>}
                    {works  && !excl               && <span style={{ fontSize:11, color:'#16a34a', fontWeight:600, whiteSpace:'nowrap' }}>✓ présent</span>}
                    {!works && !excl && !absent    && <span className="minfo">Jour non travaillé</span>}
                    {excl
                      ? <button style={pillBtn('var(--ok)', 'var(--ok-bg)')}
                          onClick={() => onAction('del_exclusion', { week_key:weekKey, poste_id:m._posteId, med_id:m.id, jour:dayIso })}>
                          Restaurer
                        </button>
                      : works
                        ? <button style={pillBtn('var(--warn)', 'var(--warn-bg)')}
                            onClick={() => onAction('add_exclusion', { week_key:weekKey, poste_id:m._posteId, med_id:m.id, jour:dayIso })}>
                            Retirer ce jour
                          </button>
                        : !absent && <button style={pillBtn('var(--accent)', 'var(--accent-light)')}
                            title="Jour hors planning habituel — forcer la présence ce jour"
                            onClick={() => onAction('add_extra', { week_key:weekKey, poste_id:m._posteId, med_id:m.id, jour:dayIso })}>
                            Forcer ce jour
                          </button>
                    }
                    <button style={pillBtn('var(--danger)', 'var(--danger-bg)')}
                      onClick={() => onAction('del_affectation', { week_key:weekKey, poste_id:m._posteId, med_id:m.id })}>
                      Retirer sem.
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
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
          <div style={{ marginBottom:12 }}>
            <div style={{
              fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
              color:'var(--text2)', paddingBottom:6, marginBottom:6,
              borderBottom:'1px solid var(--border)',
            }}>Remplaçants ce jour</div>
            {extrasToday.map(e => (
              <div key={e.med_id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0' }}>
                <span style={{ flex:1, fontSize:12 }}>{e.nom}
                  <em style={{ fontSize:10, opacity:.65, fontStyle:'italic', marginLeft:5 }}>remplac.</em>
                </span>
                <button style={pillBtn('var(--danger)', 'var(--danger-bg)')}
                  onClick={() => onAction('del_extra', { week_key:weekKey, poste_id:poste.id, med_id:e.med_id, jour:dayIso })}>
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Renforts déjà ajoutés ce jour ── */}
        {renfortsToday.length > 0 && (
          <div style={{ marginBottom:12 }}>
            <div style={{
              fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
              color:'#b45309', paddingBottom:6, marginBottom:6,
              borderBottom:'1px solid #d9770644',
            }}>Renforts ce jour</div>
            {renfortsToday.map(r => (
              <div key={r.med_id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0' }}>
                <span style={{ flex:1, fontSize:12 }}>
                  {r.nom}
                  <em style={{ fontSize:10, opacity:.65, fontStyle:'italic', marginLeft:5 }}>renfort</em>
                </span>
                <button style={pillBtn('var(--danger)', 'var(--danger-bg)')}
                  onClick={() => onAction('del_renfort', { week_key:weekKey, poste_id:poste.id, med_id:r.med_id, jour:dayIso })}>
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Zone ajout / recherche ── */}
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
          <div style={{
            fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
            color:'var(--text2)', marginBottom:8,
          }}>
            Ajouter un praticien
          </div>
          <div style={{ position:'relative' }}>
            <input
              type="text"
              className="team-search"
              placeholder="Nom, ou type : ph · interne · padhue · ipa…"
              value={search}
              onChange={e => { setSearch(e.target.value); setActiveIdx(-1); }}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, searchResults.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
                else if (e.key === 'Enter' && searchResults.length > 0) {
                  e.preventDefault();
                  const m = searchResults[activeIdx >= 0 ? activeIdx : 0];
                  const wa = weekAvail(m);
                  const da = dayAvail(m);
                  if (wa.ok) onAction('add_affectation', { week_key: weekKey, poste_id: targetPosteId(m), med_id: m.id, ...(wa.autoExcludeDays?.length ? { auto_exclude_days: wa.autoExcludeDays } : {}) });
                  else if (da.ok) onAction('add_extra', { week_key: weekKey, poste_id: targetPosteId(m), med_id: m.id, jour: dayIso });
                }
              }}
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
                searchResults.map((m, idx) => <CandidateRow key={m.id} m={m} subtitle={TYPE_LBL[m.type]}
                  dayAvail={dayAvail} weekAvail={weekAvail} renfortAvail={renfortAvail}
                  takenToday={takenToday} weekKey={weekKey} dayIso={dayIso}
                  targetPosteId={targetPosteId} onAction={onAction} highlighted={idx === activeIdx} />)
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
        </div>{/* /Zone ajout */}

      </div>
    </div>
  );
}

function fmtExcludeDays(dayIsos) {
  return dayIsos
    .map(d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'short', day:'numeric' }))
    .join(', ');
}

function pillBtn(color, bg) {
  return {
    fontSize:11, padding:'3px 10px', borderRadius:20,
    border:`1.5px solid ${color}`, cursor:'pointer',
    fontFamily:'inherit', fontWeight:600, whiteSpace:'nowrap',
    background: bg ?? 'transparent', color, transition:'background .1s, color .1s',
  };
}

// ── Ligne candidat (search + liste disponibles) ──────────────
function CandidateRow({ m, subtitle, dayAvail, weekAvail, renfortAvail, takenToday, weekKey, dayIso, targetPosteId, onAction, highlighted = false }) {
  const wa = weekAvail(m);
  const da = dayAvail(m);
  const ra = renfortAvail(m);
  const hasAutoExclude = wa.ok && wa.autoExcludeDays?.length > 0;
  return (
    <div className="mitem" style={{ cursor:'default', flexWrap:'nowrap', background: highlighted ? 'var(--surface2)' : undefined, outline: highlighted ? '1px solid var(--border2)' : undefined }}>
      <span style={{ fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', minWidth:0, flex:'1 1 0' }}>
        {m.nom}
        {subtitle && <span className="mtag" style={{ marginLeft:4 }}>{subtitle}</span>}
      </span>
      <span style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0 }}>
        {(ra.ok || takenToday.has(m.id)) && (
          <button
            className="btn-xs"
            style={pillBtn('#7c3aed', '#f3e8ff')}
            disabled={!ra.ok}
            title={ra.ok ? 'Ajouter en double tâche (déjà en poste ailleurs ce jour)' : ra.reason}
            onClick={ra.ok ? () => onAction('add_renfort', { week_key:weekKey, poste_id:targetPosteId(m), med_id:m.id, jour:dayIso }) : undefined}
          >
            Renfort
          </button>
        )}
        <button
          className="btn-xs"
          style={pillBtn('var(--accent)', 'var(--accent-light)')}
          disabled={!da.ok}
          title={da.ok ? 'Remplacement ponctuel ce jour' : da.reason}
          onClick={da.ok ? () => onAction('add_extra', { week_key:weekKey, poste_id:targetPosteId(m), med_id:m.id, jour:dayIso }) : undefined}
        >
          Ce jour
        </button>
        <button
          className="btn-xs"
          style={pillBtn('var(--accent)', 'var(--accent-light)')}
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
