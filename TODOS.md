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

## ~~P4 — UI désarchivage praticien (TeamTab)~~ ✅ DONE 2026-05-30
**What:** Section "Archivés" repliable en bas de l'onglet Équipe (mode secrétariat uniquement), listant les médecins `actif=0` avec un bouton "Réactiver" qui appelle `PATCH /api/medecins/:id/desarchiver`.
**Implémenté :**
- `GET /api/medecins/archives` — nouvelle route serveur
- `getArchivedMedecins()` dans `api.js`
- Composant `ArchivedSection` dans `TeamTab.jsx` : lazy-load au premier dépliage, retirage optimiste de la liste après réactivation + `onReload()` pour rafraîchir le reste de l'app.
