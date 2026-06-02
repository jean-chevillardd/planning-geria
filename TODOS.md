# TODOS — Planning Gériatrie

## P1 — Règle métier affectations : contrainte "1 médecin = 1 poste max" + double tâche
**What:** Définir et enforcer la règle d'affectation complète : (1) nombre minimal de PH requis par ligne de service pour éviter la "tension", (2) modéliser le concept de "double tâche" — quand une ligne est en tension, un PH déjà affecté ailleurs peut être ajouté en backup (disponible par téléphone en urgence).
**Why:** La règle actuelle dans AssignModal (`takenThisWeek`) est simpliste. Elle ne modélise pas les double tâches légitimes ni le seuil minimal de couverture. Une contrainte UNIQUE en base sans avoir clarifié ces règles métier créerait des faux positifs (bloque des double tâches légitimes).
**Pros:** Modèle de données correct dès le départ, pas de contrainte UNIQUE à défaire plus tard.
**Cons:** Nécessite un retour des 3 médecins sur la définition exacte : "combien de PH minimum par ligne de service ?" et "dans quels cas une double tâche est-elle autorisée ?"
**Context:** Découvert en CEO review du 2026-05-29. L'outside voice a remarqué que le seed.js insère des médecins sur plusieurs services la même semaine (TNC coexiste avec poste clinique). L'utilisateur a confirmé que le concept de "double tâche" est une règle métier réelle non documentée. Questions pour le test médecins :
- "Quel est le minimum de PH requis pour que la ligne SSR / CSG / consultation soit 'couverte' ?"
- "Dans quels cas peut-on mettre un médecin en 'double tâche' sur une ligne en tension ?"
**Effort:** M (human: ~2h / CC: ~30min) une fois les règles claires.
**Priority:** P1
**Depends on:** Retour test utilisateurs sur les seuils de couverture et la définition de double tâche.

## P2 — Alerte couverture minimale
**What:** Afficher une alerte visuelle (ligne rouge ou icône) sur les lignes de service sans médecin assigné dans la grille semaine.
**Why:** Les médecins doivent actuellement scanner le planning ligne par ligne pour détecter les trous de couverture — exactement comme avec l'Excel. Ce delight réduirait à 0 secondes la détection des gaps.
**Pros:** Effort XS (~15min CC), impact immédiat sur la valeur perçue, feature logique dans tout outil de planning.
**Cons:** Nécessite de définir ce qu'est "couverture suffisante" (1 médecin par ligne ? par demi-journée ? par service ?). Attendre le retour des médecins pour ne pas sur-builder.
**Context:** Décidé en CEO review du 2026-05-29 — différé explicitement pour attendre le feedback du test utilisateur. Quand les médecins confirment la définition de "couverture ok", l'implémentation est triviale (calcul dans PlanningGrid.jsx + style CSS conditionnel).
**Effort:** XS (human: ~20min / CC: ~5min) quand la définition métier est claire.
**Priority:** P2
**Depends on:** Retour test utilisateurs + décision métier sur la définition de couverture minimale.

## P3 — Export PDF planning semaine (dédié)
**What:** Bouton "Exporter PDF" générant un PDF de la semaine courante avec mise en page correcte, distinct du CSS @media print existant.
**Why:** L'impression physique du planning est une pratique courante dans les services hospitaliers (affichage au tableau, transmission au secrétariat). La vue mensuelle est déjà améliorée dans ce plan ; la vue semaine pourrait nécessiter un rendu PDF dédié si @media print ne suffit pas.
**Pros:** Complet l'expérience d'impression, répond à un besoin hospitalier réel.
**Cons:** Effort M (CC: ~45min), complexité de mise en page, puppeteer ou librairie PDF à évaluer.
**Context:** Décidé en CEO review du 2026-05-29. Les médecins ont confirmé que le bouton Imprimer existe déjà ; une amélioration de la mise en page @media print est dans le scope actuel. Le PDF dédié est différé jusqu'au feedback du test.
**Effort:** M (human: ~4h / CC: ~45min)
**Priority:** P3
**Depends on:** Feedback des médecins sur le besoin réel vs la vue @media print améliorée.

## P4-bis — Règles métier activités & effectifs (source : email 2026-06-01)

**What:** Modéliser dans l'application les règles d'activités et d'effectifs transmises par l'utilisatrice, et les exposer dans l'interface :
1. Distinction activités **obligatoires** vs **dispensables** (seuil d'ouverture : >12 PH, ou >11 les mercredis)
2. Effectifs minimaux par activité (cf. tableau ci-dessous)
3. Ordre de tirage : CSG → SSR → autres obligatoires → dispensables
4. Contraintes de continuité : même PH sur CSG 1,5–2 mois consécutifs, sur SSR 3 mois
5. Fermetures fixes/ponctuelles : HDJ fermé le mercredi systématiquement ; HdJNP fermable sur périodes lacunaires (validation cadre IDE requise)
6. Back-up EHPAD : Romain en priorité, vendredi obligatoire (Romain à Montaigu ce jour)

**Effectifs par activité :**
| Activité | PH min | Notes |
|---|---|---|
| CSG 1 | 2 | Continuité 1,5–2 mois |
| CSG 2 | 2 | |
| SSR | 3 (2 ponctuel OK) | Pas 2 jours consécutifs si seulement 2 PH dans le même service |
| EOPS | 1 | Back-up : SSR, HDJ, EHPAD (très ponctuel) |
| HdJNP | 1 | Fermeture périodes lacunaires (à valider avec cadre IDE) |
| HDJ | 1 | Fermé le mercredi |
| UCC | 1 | Peut être absent le mercredi |
| EHPAD | 60 % | Romain prioritaire ; back-up vendredi obligatoire |

**Internes (affectations par défaut) :**
- 2 au CSG 1 (3 si Docteur Junior présent)
- 1 au CSG 2
- 1 en HdJNP
- Reste : SSR / UCC / EOPS / CS selon projet pro (très variable → manuel)

**Why:** Ces règles étaient non documentées dans le code. Elles sont indispensables pour que l'outil aide vraiment à "tirer le planning" plutôt que de simplement l'afficher.
**Pros:** Déblocage du P1 et P2 (les seuils de couverture sont maintenant définis) ; évite de sur-builder des contraintes génériques.
**Cons:** Volume de travail significatif ; certains points (HdJNP, affectations internes) restent partiellement manuels.
**Context:** Email reçu le 2026-06-01. Résout aussi la dépendance de P1 ("retour test utilisateurs sur les seuils") et de P2 ("définition de couverture minimale").
**Effort:** L (plusieurs sous-tâches indépendantes, à décomposer)
**Priority:** P4-bis (démarrer par les données / config avant l'UI)
**Depends on:** Rien (les règles sont désormais connues).

---

## P6 — Numéro de semaine dans WeekNav (suppression du libellé date)

**What:** Remplacer le libellé « Semaine du 30 novembre » par le numéro ISO de semaine (« Semaine 48 ») dans `WeekNav` et partout où la semaine est affichée en titre.
**Why:** Le numéro de semaine est le repère naturel utilisé à l'hôpital (« je suis de garde S46 »). Le libellé « semaine du XX » est redondant avec les dates visibles dans la grille.
**Pros:** Effort XS, lisibilité immédiate, cohérence avec le vocabulaire médical.
**Cons:** Nécessite de calculer `getISOWeek(date)` — librairie `date-fns` déjà présente.
**Context:** Demande explicite de l'utilisateur (notes 2026-06-02).
**Effort:** XS (CC: ~10min)
**Priority:** P6
**Depends on:** Rien.

---

## P8 — Vue rotation astreintes : supprimer le tri automatique

**What:** Dans `AstreintesTab` vue Rotation, désactiver le tri automatique des lignes. L'ordre d'affichage doit respecter l'ordre de saisie/insertion, ou être manuellement ajustable.
**Why:** Le tri auto perturbe la lecture des rotations planifiées ; les médecins s'attendent à retrouver les lignes dans l'ordre où ils les ont définies.
**Pros:** Effort XS, correction de comportement indésirable signalé.
**Cons:** Vérifier que le retrait du tri ne casse pas le rendu (doublons éventuels à gérer).
**Context:** Demande explicite de l'utilisateur (notes 2026-06-02).
**Effort:** XS (CC: ~10min)
**Priority:** P8
**Depends on:** Rien.

---

## P9 — AssignModal : scope étendu + taux de présence praticiens

**What:** Deux améliorations liées de `AssignModal` :
1. **Scope d'affectation étendu** : en plus de "ce jour" et "cette semaine", ajouter "ce mois" et "les X prochaines semaines" (saisie numérique 1–12). Même logique pour le retrait : ce jour / cette semaine / ce mois.
2. **Taux de présence visible** : dans la liste des praticiens du modal, afficher le taux de présence de chaque praticien (calculé depuis `jours_presence` ou la colonne dédiée) — ex. « 80 % » ou « 4j/5 » — pour aider au choix.

**Why:**
- Le scope "semaine entière" est insuffisant pour placer un praticien sur plusieurs semaines consécutives (rotation longue, remplacement maladie prolongé). Ajouter "mois" et "X semaines" couvre les cas réels sans réécrire l'architecture.
- La liste actuelle n'indique pas qui est à temps partiel. Afficher le taux évite d'affecter par erreur un 50 % sur 5 jours.

**Pros:** Gain de temps significatif pour la saisie de rotations longues. Taux de présence : lecture immédiate sans aller dans l'onglet Équipe.
**Cons:** Scope "mois" et "X semaines" génère potentiellement beaucoup d'insertions en base — penser à une transaction et un feedback de progression. Taux de présence : calcul à exposer côté API ou à dériver côté client depuis `useBaseData`.
**Context:** Demande explicite de l'utilisateur (notes 2026-06-02). Lié à P1/P4-bis : les nouvelles règles de couverture minimale devront être vérifiées par vacation insérée.
**Effort:** M (CC: ~1h)
**Priority:** P9
**Depends on:** P4-bis (règles métier couverture) utile mais non bloquant.

---

## P11 — Refonte onglet Absences

**What:** Refonte complète de `AbsencesTab` : UX, hiérarchie visuelle, et potentiellement les flux de saisie. Périmètre exact à définir avec l'utilisateur (navigation, formulaire inline vs modal, synthèse par agent, export, etc.).
**Why:** L'onglet actuel (calendrier mensuel + vue semestre + DateRangePicker custom) est fonctionnel mais peu intuitif. Signalé comme point de friction dans les notes utilisateur du 2026-06-02.
**Pros:** Amélioration de l'adoption ; l'onglet est utilisé en autonomie par les secrétaires et les médecins via magic link.
**Cons:** Périmètre flou — nécessite une session de spécification avant d'implémenter. Risque de re-travail si les besoins changent après P10 (demi-journées pourraient affecter la saisie d'absences).
**Context:** Demande explicite de l'utilisateur (notes 2026-06-02). À préciser : quels écrans sont conservés, lesquels sont repensés, nouveau parcours de saisie ?
**Effort:** L (à affiner après spec — CC: ~2h min)
**Priority:** P11
**Depends on:** Session de spécification UX. Idéalement après P10 (demi-journées).

---

## ~~P5 — Vue disponibilités praticiens (semaine)~~ ✅ DONE 2026-06-02

**Implémenté :**
- `getDisponiblesPH(medecins, absences, days)` dans `utils.js` : filtre **PH uniquement** (`type='ph'`), exclut absents, groupe en **Présents 5j** / **Présents partiellement** avec jours affichés pour les partiels
- Prop `showAvailablePanel` dans `PlanningGrid.jsx`, bouton toggle label fixe "PH dispo ▶/◀"
- Column fixe 188px à droite de la grille, masquée automatiquement sous 900px (`@media`)
- Badge compteur avec ARIA label (`aria-label="N praticiens PH disponibles cette semaine"`)
- Bug détecté et documenté : `actif === true` toujours faux (SQLite integer) → `!!m.actif`, couvert par tests Vitest
- **Reste hors scope :** vue mensuelle, tooltip affectations au survol, praticiens "pleins" (affectés 5/5j)

## ~~P4 — UI désarchivage praticien (TeamTab)~~ ✅ DONE 2026-05-30
**What:** Section "Archivés" repliable en bas de l'onglet Équipe (mode secrétariat uniquement), listant les médecins `actif=0` avec un bouton "Réactiver" qui appelle `PATCH /api/medecins/:id/desarchiver`.
**Implémenté :**
- `GET /api/medecins/archives` — nouvelle route serveur
- `getArchivedMedecins()` dans `api.js`
- Composant `ArchivedSection` dans `TeamTab.jsx` : lazy-load au premier dépliage, retirage optimiste de la liste après réactivation + `onReload()` pour rafraîchir le reste de l'app.
