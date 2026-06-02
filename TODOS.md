# TODOS — Planning Gériatrie

## ~~P1 — Contrainte serveur "1 médecin = 1 poste max"~~ ✅ DONE 2026-06-02

**État actuel :**
- ~~Double tâche~~ : **DONE** — implémentée via le mécanisme "Renfort" dans `AssignModal.jsx` (bouton "Renfort", `renfortAvail`, `add_renfort`). Un médecin déjà en poste ailleurs peut être ajouté en backup sur une ligne en tension. Tooltip explicite : *"Ajouter en double tâche (déjà en poste ailleurs ce jour)"*.
- Règle "1 médecin = 1 poste max" : **appliquée côté UI uniquement** — `takenThisWeek` bloque l'affectation semaine, `takenToday` bloque l'affectation jour. Aucune contrainte en base.

**What:** Ajouter la contrainte d'unicité côté serveur pour garantir que la règle ne peut pas être contournée via l'API (appels directs, scripts, bug futur).

**Why:** La protection UI peut être déjouée. La source de vérité doit être la base de données. Maintenant que les règles métier sont claires (P4-bis), la contrainte UNIQUE peut être posée sans risque de faux positifs — les renforts (double tâche) sont dans une table séparée (`renforts`), pas dans `affectations`, donc pas de collision.

**Pros:** Intégrité des données garantie quelle que soit la surface d'appel.
**Cons:** Migration à écrire ; tester que les renforts existants ne violent pas la contrainte.
**Context:** Initialement bloqué par l'absence de définition des règles métier (CEO review 2026-05-29). Débloqué par P4-bis (email 2026-06-01). Double tâche déjà développée.
**Effort:** S (CC: ~20min)
**Priority:** P1
**Depends on:** Rien (P4-bis a résolu la dépendance métier).

## P2 — Alerte couverture minimale

**What:** Afficher une alerte visuelle (ligne rouge ou icône) sur les lignes de service dont le nombre de PH affectés est inférieur au seuil minimal défini dans P4-bis.

**Seuils désormais connus (P4-bis) :**
| Activité | PH min | Remarque |
|---|---|---|
| CSG 1 | 2 | |
| CSG 2 | 2 | |
| SSR | 3 | 2 acceptable ponctuellement |
| EOPS / HdJNP / HDJ / UCC | 1 | |
| EHPAD | 60 % | |

**Why:** Les médecins doivent actuellement scanner le planning ligne par ligne pour détecter les trous de couverture — exactement comme avec l'Excel. Ce delight réduirait à 0 secondes la détection des gaps.
**Pros:** Effort XS, impact immédiat sur la valeur perçue. Les seuils sont désormais définis → implémentation triviale (calcul dans `PlanningGrid.jsx` + style CSS conditionnel).
**Cons:** Le seuil SSR "2 ponctuel OK" introduit une nuance (warning vs erreur ?) à trancher.
**Context:** Décidé en CEO review du 2026-05-29, différé en attente des règles métier. Débloqué par P4-bis (email 2026-06-01).
**Effort:** XS (CC: ~15min)
**Priority:** P2
**Depends on:** Rien (seuils définis dans P4-bis).

> **Note (2026-06-02) :** une première implémentation (flags POSTES, alertes enrichies, bannière dispensables) a été tentée dans le commit 85de787 puis **revertée** (commit 93fe6e5) — à reprendre proprement.

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

> **Note (2026-06-02) :** implémentation partielle (flags POSTES, alertes, bannière dispensables) tentée dans 85de787 et **revertée** (93fe6e5) — à reprendre pas à pas avec l'utilisateur.

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

## ~~P-BUG — Suppression & affectation limitées aux PH~~ ✅ DONE 2026-06-02

**Implémenté :**
- `AssignModal` : `candidates = medecins` (tous types cherchables), filtre intern/non-intern supprimé
- Postes combinés (`csg1a` + `csg1i1`, `csg2a` + `csg2i1`) : `assigned` inclut les deux sous-postes, tag `_posteId` pour router correctement les opérations (add/del/excl/renfort)
- `targetPosteId(m)` : internes → `combineWith`, autres → `poste.id`
- `isExcluded`, `extrasToday`, `renfortsToday`, `takenToday` mis à jour pour tenir compte de `allPosteIds`
- Panneau dispo (`getDisponiblesPH`) reste PH-only — comportement intentionnel inchangé

---

## ~~P12 — Panneau « PH dispo » : visibilité conditionnelle~~ ✅ DONE 2026-06-02

**Implémenté :**
- Bouton toggle `PH dispo ▶/◀` supprimé (`App.jsx`, state `showAvailablePanel` retiré, CSS `.btn-toggle-available` nettoyé)
- `showAvailablePanel={isSecretary}` : panneau visible si et seulement si mode édition actif
- `@media (max-width:900px)` nettoyé (référence au bouton supprimée)

---

## ~~P13 — Panneau « PH dispo » sur la vue calendrier (mensuelle)~~ ✅ DONE 2026-06-02

**Implémenté :**
- `MonthView` reçoit prop `isSecretary`
- `monthPhDisponibles` (`useMemo`) : calcule présence mensuelle depuis `absences` — groupe « Présents tout le mois » / « Absents partiellement » avec détail dates
- Panel `.available-panel` sticky à droite de la grille, visible en mode édition uniquement
- Granularité mensuelle : absences listées avec dates début→fin

---

## ~~P14 — Drag & drop depuis le panneau dispo vers le planning~~ ✅ DONE 2026-06-02

**Implémenté (vue semaine uniquement) :**
- Items du panneau dispo : `draggable` + handlers `onDragStart`/`onDragEnd` → `panelDragMed` state dans `PlanningGrid`
- Cellules : `handleDrop` distingue drop panel (`panelDragMed`) vs chip interne (`dragInfo`) → appel `onPanelCellDrop(poste, dayIso)`
- `pendingPanelAssign` dialog (similaire à la dialog déplacement) : « Ce jour » → `add_extra` | « Toute la semaine » → `add_affectation`
- `onAssign` prop ajoutée à `PlanningGrid`, implémentée dans `App.jsx` via `handleAssign` (réutilise `handleAction`)
- Note CSS : `.available-item[draggable="true"]` → `cursor: grab`
- Vue mensuelle : non implémentée (structure trop différente)

---

## P15 — Refonte bandeau « créneaux non couverts »

**What:** Revoir l'affichage du bandeau d'alerte listant les créneaux non couverts (ex. « ⚠ 46 créneau(x) non couvert(s) : HDJ programmé (Lun) · … »). Rendu actuel : texte dense sur fond jaune, peu hiérarchisé et difficile à scanner rapidement.
**Why:** Le bandeau est une information critique (signal d'alarme) mais sa présentation actuelle noie le message dans une liste horizontale sans structure visuelle.
**Pros:** Effort S, impact direct sur la lisibilité des alertes.
**Cons:** À spécifier : groupe par service ? par jour ? tooltip au survol ? badge numérique seul ?
**Context:** Signalé par l'utilisateur (2026-06-02, capture Image #3).
**Effort:** S (CC: ~20–30min)
**Priority:** P15
**Depends on:** Rien.

---

## ~~P16 — Filtres vue semaine : supprimer « Tout afficher », homogénéiser~~ ✅ DONE 2026-06-02

**Implémenté :**
- `{ id: null, label: 'Tout afficher', ... }` retiré de `FILTERS` dans `PlanningGrid`
- Cliquer sur un filtre actif le désélectionne (retour "tout afficher" sans bouton dédié)
- `subFilter` state + sub-pills (identiques à `MonthView`) : visibles quand le filtre parent est actif, `setFilter` reset `subFilter`
- `baseGroups` filtre aussi par `p.short === subFilter` si un sous-filtre est actif
- `FILTERS.grps` alignés avec la fusion `'Court séjour'` (CSG 1+2 fusionnés dans `utils.js`)

---

## P17 — Sélecteurs de dates : homogénéiser partout (notamment onglet Astreintes)

**What:** Uniformiser le composant de sélection de date utilisé dans toute l'application. L'onglet Astreintes utilise actuellement un sélecteur différent des autres onglets — aligner sur un seul pattern cohérent.
**Why:** L'incohérence des contrôles de date entre onglets crée une friction et nuit à la perception de qualité du produit.
**Pros:** Effort S–M, amélioration de la cohérence globale.
**Cons:** Identifier quel composant est la « référence » avant de migrer les autres.
**Context:** Signalé par l'utilisateur (2026-06-02).
**Effort:** S–M (CC: ~30min)
**Priority:** P17
**Depends on:** Rien.

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
