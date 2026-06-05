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

## ~~P2 — Alerte couverture minimale~~ ✅ DONE 2026-06-03

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

> **Repasse 2026-06-03 (final) :** Indicateur inline ⚠/✓ implémenté — chaque ligne de poste obligatoire affiche ✓ vert (couverture OK) ou ⚠ orange (au moins un créneau sous-couvert cette semaine). La bannière globale utilise `alerts.warns`. Fausse alerte HDJ-mercredi corrigée. Bannière "dispensables" non implémentée (info suffisante dans les compteurs PH des en-têtes). Contraintes de continuité (CSG/SSR) reportées.

## P3 — Export PDF planning semaine (dédié)
**What:** Bouton "Exporter PDF" générant un PDF de la semaine courante avec mise en page correcte, distinct du CSS @media print existant.
**Why:** L'impression physique du planning est une pratique courante dans les services hospitaliers (affichage au tableau, transmission au secrétariat). La vue mensuelle est déjà améliorée dans ce plan ; la vue semaine pourrait nécessiter un rendu PDF dédié si @media print ne suffit pas.
**Pros:** Complet l'expérience d'impression, répond à un besoin hospitalier réel.
**Cons:** Effort M (CC: ~45min), complexité de mise en page, puppeteer ou librairie PDF à évaluer.
**Context:** Décidé en CEO review du 2026-05-29. Les médecins ont confirmé que le bouton Imprimer existe déjà ; une amélioration de la mise en page @media print est dans le scope actuel. Le PDF dédié est différé jusqu'au feedback du test.
**Effort:** M (human: ~4h / CC: ~45min)
**Priority:** P3
**Depends on:** Feedback des médecins sur le besoin réel vs la vue @media print améliorée.

## ~~P4-bis — Règles métier activités & effectifs (source : email 2026-06-01)~~ ✅ CLÔTURÉ 2026-06-03

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

> **Repasse 2026-06-03 (final) :** (1) Fermeture HDJ mercredi : guard ajouté dans `alerts` — plus de fausse alerte. (2) Indicateur inline ⚠/✓ implémenté dans `GridRow` — postes obligatoires affichent l'état de couverture semaine. (3) Bannière dispensables : non implémentée (décision utilisateur). (4) Contraintes de continuité : reportées.

> **Clôture 2026-06-03 :** Les règles métier sont documentées ici comme référence mais ne seront **pas implémentées dans l'UI** — trop contraignantes d'un point de vue UX. Seuls les éléments déjà livrés (guard HDJ mercredi, indicateurs ⚠/✓ P2) sont conservés. P25 (ordre d'affichage services) reste ouvert de façon indépendante.

---

## ~~P6 — Numéro de semaine dans WeekNav (suppression du libellé date)~~ ✅ DONE 2026-06-03

**Implémenté :**
- `WeekNav.jsx` ligne 141 : `S{getISOWeek(monday)}` — affiche le numéro ISO de semaine (ex. « S23 »)
- Le libellé date reste en secondaire (« · 2 – 6 juin ») pour le contexte visuel
- `getISOWeek` déjà importé depuis `utils.js`

---

## ~~P8 — Vue rotation astreintes : supprimer le tri automatique~~ ✅ DONE 2026-06-05

**Implémenté :** `astreinteMedecins` dans `AstreintesTab.jsx` trié par `id` (ordre d'insertion en base) au lieu de l'ordre alphabétique global hérité du serveur (`ORDER BY type, nom`).

---

## P9 — MonthView : Mode Rotation + panels interactifs (affectations longues)

**Périmètre : `MonthView.jsx` uniquement — aucun changement à la vue Semaine ni à `AssignModal` en vue Semaine.**

### Pourquoi

Les utilisatrices (secrétaires médicales) ont besoin de travailler **en vue mensuelle** pour placer des praticiens sur des rotations longues (> 1 semaine : remplacement maladie prolongé, rotation CSG/SSR de 1,5–3 mois). Aujourd'hui, rien n'est fait pour affecter depuis MonthView. La grille calendaire actuelle (jours × chips tous-postes mélangés) ne permet pas de cibler un poste précis sur plusieurs semaines.

### Solution : toggle "Mode Rotation" (postes × semaines)

Bouton toggle **"Mode Rotation"** visible uniquement en `isSecretary`. La grille bascule vers :

| Lignes | Colonnes | Cellule |
|--------|----------|---------|
| Postes filtrés (pills service actives) | Semaines du mois (4–5 colonnes : S23 / S24…) | Liste compacte des PH affectés ce poste × semaine |

Header de chaque colonne semaine **cliquable** → navigue vers cette semaine en vue Semaine.

**Densité maîtrisée :**
- 4–5 colonnes (semaines) au lieu de 20–23 (jours) → espace cellule ×4
- Filtres service existants réduisent les lignes (filtre CSG → 2 lignes ; SSR → 1 ligne)
- Sticky header groupe de service pour se repérer sans filtre actif
- Par défaut : grille calendaire inchangée (Mode Rotation = opt-in explicite)

---

### Sous-fonctionnalités

#### 1. Click-to-assign sur cellule (poste × semaine)
- Cliquer sur une cellule ouvre `AssignModal` avec une section **durée** supplémentaire (prop `monthViewMode`, visible uniquement en Mode Rotation) :
  - `Cette semaine` — `add_affectation` pour cette week_key
  - `Ce mois` — boucle sur toutes les semaines du mois affiché
  - `N semaines` — input numérique 1–12, à partir de la semaine cliquée
- La **suppression** (croix sur un chip en Mode Rotation) propose les mêmes scopes
- **Transaction** : séquentiel avec rollback côté client si une semaine échoue (supprime les week_keys déjà insérés)
- **Undo global** : `pushUndo` supprime toutes les affectations créées d'un bloc (Ctrl+Z)

#### 2. Drag & drop depuis le panneau PH Disponibles
- Items du panneau `draggable` en Mode Rotation (cursor: grab, même pattern que P14 en vue Semaine)
- Drop sur une cellule (poste × semaine) → dialog de confirmation :
  - `Cette semaine` / `Ce mois` / `N semaines` (input)
- Garde-fous : vérifier que le PH n'est pas déjà affecté à ce poste cette semaine avant d'activer le bouton

#### 3. Panel "PH Disponibles" mensuel enrichi
- Le panneau P13 existant (sticky à droite, granularité mensuelle) reste inchangé en grille calendaire
- En Mode Rotation : items deviennent `draggable`, cursor: grab — même style que P14
- Tag de disponibilité mensuelle ("Absent partiellement" avec dates) conservé

#### 4. Panel "En congés ce mois"
- Second panneau sous PH Disponibles, même pattern que "En congés cette semaine" dans `PlanningGrid.jsx`
- `useMemo enCongesMois` : PH actifs avec ≥ 1 absence chevauchant le mois affiché
- Format : `Dr Dupont — CA du 10 au 21`
- Badge compteur fond gris neutre (différencié du panel dispo bleu)
- Masqué en impression
- **Indépendant du Mode Rotation** : visible en grille calendaire et en Mode Rotation

---

### Ce qui n'est PAS dans ce scope

- Drag & drop *entre cellules* de la grille rotation (déplacement poste → poste en vue mensuelle)
- Affectation ponctuelle jour par jour depuis MonthView (→ utiliser la vue Semaine)
- Modification de la grille calendaire pour les non-secrétaires

---

### Implémentation (ordre recommandé)

1. **Panel "En congés ce mois"** — `useMemo enCongesMois` + rendu dans MonthView (livrable indépendant, ~20 min)
2. **Toggle Mode Rotation** — state `rotationMode` + rendu conditionnel dans MonthView
3. **Grille rotation** — `.rotation-grid` (CSS table-layout), colonne par semaine, ligne par poste filtré
4. **D&D PH Disponibles → cellule** — `panelDragMed` state + handlers + dialog durée
5. **`handleAssignMonthView`** dans `App.jsx` — boucle week_keys, rollback, undo groupé
6. **Click-to-assign** — réutilise `AssignModal` avec prop `monthViewMode` pour afficher les options de durée
7. **Styles** — `.rotation-grid`, `.rotation-cell`, `.rotation-cell.drop-target`

**Effort :** L (CC: ~1h30–2h)
**Priority:** P9
**Depends on:** P4-bis (règles métier) utile mais non bloquant. Points 1 et 3–4 du plan ci-dessus sont indépendants et peuvent être livrés en avance.

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

## ~~P18 — AssignModal : recherche par type de praticien~~ ✅ DONE 2026-06-03

**Implémenté :**
- Filtre de recherche étendu : `m.nom`, `m.type` (ex : "interne", "padhue") et `TYPE_LBL[m.type]` (ex : "Praticien hosp.") sont tous cherchables
- Taper "interne" liste tous les internes ; "externe" liste les externes ; "padhue" liste les PADHUEs, etc.
- Aucune modification de l'UX existante, comportement transparent.

---

## ~~P19 — Bug : bouton "À la semaine" grisé si PH déjà remplaçant~~ ✅ DONE 2026-06-03

**Implémenté :**
- `takenThisWeek` ne comprend plus les extras (remplaçants ponctuels) d'autres postes — seules les affectations régulières et les renforts bloquent
- Nouveau memo `extraConflictsThisWeek` : map `medId → [jours]` des jours de remplacement ailleurs
- `weekAvail` retourne `{ ok:true, autoExcludeDays }` au lieu de bloquer
- Bouton "À la semaine" reste actif avec tooltip explicatif ("sera exclu automatiquement le…") et indicateur `*`
- À la confirmation, `add_affectation` dans `App.jsx` crée automatiquement les exclusions pour les jours concernés (undo les supprime aussi)

---

## ~~P20 — Suppression chips "absent" + warning absences hebdomadaire~~ ✅ DONE 2026-06-03

**Implémenté :**
- Chips `chip-abs` "Dr X (absent)" supprimés de toutes les cellules (désencombrement vue)
- Nouveau memo `absenceWarnings` dans `PlanningGrid` : pour chaque praticien affecté à la semaine, détecte les jours où il est absent mais normalement présent (selon sched), en ignorant les jours déjà exclus
- Bandeau warning ambre (⚠) affiché sous le bandeau couverture : "Pour info : Dr X est absent(e) le mar. 3 et le jeu. 5 (SSR 3ème)"
- Regroupement par praticien (si affecté à plusieurs postes, un seul message avec la liste des services)
- Masqué en impression (`print-hide`)

> **Révision 2026-06-03 :** bandeau remplacé par un 2e panel latéral "En congés cette semaine" (voir P21).

---

## ~~P21 — Panel "En congés cette semaine" + filtrage médecins extérieurs~~ ✅ DONE 2026-06-03

**What :** (1) Supprimer les médecins de type `externe` des search bars de l'onglet Planning (vue médecin + search d'affectation). (2) Ajouter un 2e panel latéral "En congés cette semaine" sous le panel "PH Disponibles".

**Implémenté :**
- `WeekNav` : `DoctorSearch` filtre `m.type !== 'externe'`
- `MonthView` : `DoctorSearch` filtre `m.type !== 'externe'`
- `AssignModal` : `candidates` filtre `m.type !== 'externe'`
- `PlanningGrid` : nouveau `useMemo enCongesSemaine` — pour chaque PH actif avec au moins une absence chevauchant la semaine, calcule les jours travaillés couverts et formate le label ("le X", "du X au Y", "les X, Y et Z") selon la même logique que les "Présents partiellement"
- Les deux panels sont enveloppés dans un wrapper `sticky` (flex-column) ; chacun a son propre scroll et max-height (`55vh`/`40vh`)
- Badge de comptage sur fond gris neutre pour différencier du panel dispo (fond accent)
- Pas de drag & drop ; les infos restent même si le praticien est affecté quelque part
- Type d'absence abrégé : `CA`, `CM`, `RTT`, `Form.`, `Récup.`, etc.
- Masqué en impression (wrapper `print-hide`)

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

## ~~P15 — Refonte bandeau « créneaux non couverts »~~ ✅ DONE 2026-06-05

**Implémenté :** `PlanningGrid.jsx` — le bandeau passe d'un texte plat à un layout flex : badge numérique en gras + séparateur visuel + pills par créneau (max 8 affichées + compteur "+N autres"). Plus scannable, même surface verticale.

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

---

## ~~P22 — Panel PH Dispo : renommer "Présents 5J"~~ ✅ DONE 2026-06-05

**Implémenté :** `PlanningGrid.jsx` — libellé `Présents 5j` → `Présents cette semaine`. La section "Présents partiellement" reste inchangée (les partiels y sont déjà listés avec détail jours).

---

## ~~P23 — Bug : Esc sur AssignModal provoque un scroll vers le bas~~ ✅ DONE 2026-06-05

**Implémenté :** `AssignModal.jsx` — au montage, sauvegarde `window.scrollY`, bloque le scroll du body (`overflow:hidden; position:fixed; top:-Npx`), et restaure la position exacte au démontage. Esc fonctionne sans saut de page.

---

## P24 — Vue Rotation : fusionner les absences consécutives multi-semaines en une seule ligne

**What:** Dans `AstreintesTab` vue Rotation, quand un PH est absent plusieurs semaines de suite (ex. "Form. du 5 au 8", "Form. du 12 au 13", "Form. du 15 au 21", "Form. du 26 au 29"), afficher une seule ligne fusionnée plutôt qu'une entrée par semaine.

**Comportement attendu :** Si les absences sont du même type et se suivent (ou se chevauchent sur la période affichée), les regrouper en une seule entrée avec la plage complète (ex. "Form. du 5 au 29").

**Why:** La répétition de lignes pour une longue absence encombre la vue Rotation et nuit à la lisibilité — l'image montre 4 lignes "Form." pour un seul praticien sur un même mois.
**Pros:** Vue plus compacte et lisible, en ligne avec la demande P8 (pas de tri automatique).
**Cons:** La logique de fusion doit gérer les absences de types différents (ne pas fusionner CA + Form.) et les chevauchements partiels. Tester avec absences non-consécutives.
**Context:** Signalé par l'utilisateur (2026-06-03, Image #1).
**Effort:** S (CC: ~20–30min)
**Priority:** P24
**Depends on:** P8 (ordre d'affichage vue Rotation).

---

## P25 — Refacto ordre d'affichage des services (vue Semaine + vue Rotation)

**What:** Réorganiser l'ordre de présentation des services dans la vue Semaine (`PlanningGrid`) et la vue Rotation (`AstreintesTab`) pour respecter la hiérarchie métier :
1. **Services indispensables** en premier (CSG 1, CSG 2, SSR, EOPS, UCC, HDJ, HdJNP, EHPAD)
2. **Services dispensables** ensuite (ouverts uniquement si ≥ 12 PH ou ≥ 11 le mercredi)

**Ordre cible (à valider avec l'utilisateur) :**
- Obligatoires : Court séjour (CSG 1 + CSG 2) → SSR → EOPS → UCC → HDJ → HdJNP → EHPAD
- Dispensables : après les obligatoires, dans l'ordre existant

**Why:** L'ordre actuel est historique (ordre de création en base). Un ordre calé sur la criticité métier aide les secrétaires à scanner le planning de haut en bas dans l'ordre de priorité de tirage (P4-bis : CSG → SSR → autres oblig. → dispensables).
**Pros:** Impact fort sur la lisibilité quotidienne, effort modéré (principalement dans `utils.js` / `POSTES` config).
**Cons:** Nécessite de définir l'ordre exact avec l'utilisateur avant d'implémenter. La vue Rotation peut avoir une logique d'affichage différente à adapter.
**Context:** Demande explicite de l'utilisateur (2026-06-03). Cohérent avec les règles métier P4-bis.
**Effort:** S–M (CC: ~30–45min — dépend du nombre de points d'entrée à modifier)
**Priority:** P25
**Depends on:** P4-bis (définition indispensable/dispensable). Idéalement coordonner avec P24 pour la vue Rotation.

---

## ~~P5 — Vue disponibilités praticiens (semaine)~~ ✅ DONE 2026-06-02

**Implémenté :**
- `getDisponiblesPH(medecins, absences, days)` dans `utils.js` : filtre **PH uniquement** (`type='ph'`), exclut absents, groupe en **Présents 5j** / **Présents partiellement** avec jours affichés pour les partiels
- Prop `showAvailablePanel` dans `PlanningGrid.jsx`, bouton toggle label fixe "PH dispo ▶/◀"
- Column fixe 188px à droite de la grille, masquée automatiquement sous 900px (`@media`)
- Badge compteur avec ARIA label (`aria-label="N praticiens PH disponibles cette semaine"`)
- Bug détecté et documenté : `actif === true` toujours faux (SQLite integer) → `!!m.actif`, couvert par tests Vitest
- **Reste hors scope :** vue mensuelle, tooltip affectations au survol, praticiens "pleins" (affectés 5/5j)

---

## P26 — StatsTab : filtre de période personnalisée (sélecteur mois début → mois fin)

**What:** Ajouter dans l'onglet Stats un sélecteur de période (mois de début → mois de fin) permettant de filtrer le décompte des affectations et des absences sur un intervalle choisi (ex. : janvier → septembre 2026). La vue matricielle et la vue cards doivent toutes deux respecter ce filtre.

**Why:** Révélé par discovery terrain (email "Planning IMPORTANT" du 2 juin 2026) : la team planning doit faire un point mi-annuel (jan–sep) pour chaque praticien, listant dans quels services il est passé + ses jours d'absence (Formation, CA, etc.). StatsTab contient déjà toutes ces données mais ne permet de filtrer que par mois individuel, pas sur une plage. Le formulaire Google Forms utilisé manuellement serait remplacé par cette fonctionnalité.

**Données sources :** table `affectations` (semaines/jours par poste), table `absences` (types CA, Formation, RTT, etc.) — déjà accessibles via les hooks `useBaseData` / `usePlanning`.

**UX :** Deux MonthPickerPopover (mois de début, mois de fin) visibles en haut de StatsTab. Les calculs actuels (heatmap, total jours, répartition par service) sont recalculés sur la plage sélectionnée. Valeur par défaut : mois courant (comportement actuel préservé).

**Effort:** S–M (CC: ~40 min — extension des calculs stats + 2 sélecteurs de mois)
**Priority:** P26
**Depends on:** MonthPickerPopover déjà implémenté dans MonthView et AbsencesTab (réutilisable).

---

## P28 — "Semaines d'instabilité" : définition métier + tracking dans StatsTab

**What:** Définir avec la team planning ce qu'est une "semaine d'instabilité" (hypothèse : semaine où un PH est affecté à un service différent de son ou ses services habituels, tels que définis dans sa grille de présence TeamTab). Une fois la définition arrêtée, calculer automatiquement ce compteur depuis les affectations et l'afficher dans StatsTab (vue Cards + vue Matrix) ainsi que dans le rapport de période P26.

**Why:** La team planning utilise ce critère pour équilibrer les plannings et apprécier la charge de chaque praticien. Actuellement renseigné manuellement dans un formulaire Google. La définition doit être clarifiée lors de la réunion de service du 9 juin 2026.

**Risque :** Définition métier non encore formalisée. Ne pas implémenter avant validation. La notion de "service habituel" peut être ambiguë pour les PH multi-services.
**Effort:** S–M (CC: ~30–45 min — selon la définition retenue)
**Priority:** P28
**Depends on:** P26 (filtre période dans StatsTab). Clarification métier obligatoire avant implémentation.

---

## P30 — Recueil des souhaits praticiens (self-service via magic link)

**What:** Module permettant à chaque praticien d'exprimer, via un magic link envoyé par la secrétaire, ses souhaits d'activités pour la période suivante (services souhaités + durées). Les réponses sont agrégées et visibles côté secrétaire dans l'app pour aider à construire les prochaines rotations.

**Why:** Remplace le second formulaire Google Forms envoyé manuellement à 16 praticiens à chaque point mi-annuel. Permet à la team planning de visualiser les préférences en temps réel et d'équilibrer les trames en tenant compte des souhaits individuels.

**Complexité :** Plus grande que P26 — nécessite un formulaire dynamique (services variables selon le praticien), un backend de collecte des réponses, et une vue agrégée côté secrétaire. Différé : à planifier en V2 après adoption du reste de l'app.
**Effort:** L (CC: ~2h)
**Priority:** P30
**Depends on:** Infrastructure magic link existante (CampaignModal, `/api/magic-link`). Idéalement après P26 et P28.

---

## Tableau récapitulatif — P ouvertes (trié par effort)

| Effort | # | Titre | Dépendances | Priorité |
|--------|---|-------|-------------|----------|
| **S** | P24 | Vue Rotation : fusionner absences consécutives multi-semaines | — | P24 |
| **S–M** | P17 | Sélecteurs de dates : homogénéiser (Astreintes + autres onglets) | — | P17 |
| **S–M** | P25 | Refacto ordre d'affichage services (indispensables → dispensables) | — | P25 |
| **S–M** | P28 | "Semaines d'instabilité" : définition métier + tracking StatsTab | clarif. 9 juin | P28 |
| **M** | P3 | Export PDF planning semaine (dédié, distinct de @media print) | Feedback utilisateur | P3 |
| **L** | P9 | MonthView : Mode Rotation + D&D + click-to-assign multi-semaines | — | P9 |
| **L** | P11 | Refonte onglet Absences (UX, flux de saisie, synthèse) | Session spec UX | P11 |
| **L** | P30 | Recueil souhaits praticiens via magic link (remplace Google Form 2) | clarif. P28 | P30 |

> Effort CC indicatif : XS ≤ 15 min · S ≤ 30 min · S–M ≤ 45 min · M ≤ 1h · L > 1h30

---

## ~~P4 — UI désarchivage praticien (TeamTab)~~ ✅ DONE 2026-05-30
**What:** Section "Archivés" repliable en bas de l'onglet Équipe (mode secrétariat uniquement), listant les médecins `actif=0` avec un bouton "Réactiver" qui appelle `PATCH /api/medecins/:id/desarchiver`.
**Implémenté :**
- `GET /api/medecins/archives` — nouvelle route serveur
- `getArchivedMedecins()` dans `api.js`
- Composant `ArchivedSection` dans `TeamTab.jsx` : lazy-load au premier dépliage, retirage optimiste de la liste après réactivation + `onReload()` pour rafraîchir le reste de l'app.
