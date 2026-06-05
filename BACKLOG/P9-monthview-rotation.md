# P9 — MonthView : Mode Rotation + panels interactifs

**Effort :** L (CC: ~1h30–2h) | **WSJF :** 1.9 | **Bloquant :** —

## Pourquoi

Les secrétaires médicales ont besoin de travailler en vue mensuelle pour placer des praticiens sur des rotations longues (> 1 semaine : remplacement maladie prolongé, rotation CSG/SSR de 1,5–3 mois). Aujourd'hui rien n'est fait pour affecter depuis MonthView.

## Solution : toggle "Mode Rotation"

Bouton toggle **"Mode Rotation"** visible uniquement en `isSecretary`. La grille bascule de jours × chips vers :

| Lignes | Colonnes | Cellule |
|---|---|---|
| Postes filtrés (pills service actives) | Semaines du mois (4–5 colonnes : S23 / S24…) | Liste compacte des PH affectés ce poste × semaine |

Header de chaque colonne semaine **cliquable** → navigue vers cette semaine en vue Semaine.

## Sous-fonctionnalités

### 1. Click-to-assign sur cellule (poste × semaine)
- Ouvre `AssignModal` avec prop `monthViewMode` ajoutant un sélecteur durée :
  - `Cette semaine` — `add_affectation` pour cette week_key
  - `Ce mois` — boucle sur toutes les semaines du mois affiché
  - `N semaines` — input numérique 1–12, à partir de la semaine cliquée
- Suppression (croix sur chip) : mêmes scopes
- Transaction : rollback côté client si une semaine échoue
- Undo global : `pushUndo` supprime toutes les affectations créées d'un bloc

### 2. Drag & drop depuis le panneau PH Disponibles
- Items `draggable` en Mode Rotation (cursor: grab — même pattern que P14 en vue Semaine)
- Drop sur cellule → dialog durée (`Cette semaine` / `Ce mois` / `N semaines`)
- Garde-fou : vérifier absence de doublon avant activation bouton

### 3. Panel "En congés ce mois"
- Second panneau sous PH Disponibles
- `useMemo enCongesMois` : PH avec ≥ 1 absence chevauchant le mois
- Format : `Dr Dupont — CA du 10 au 21`
- Badge fond gris neutre (différencié du panel dispo bleu)
- **Indépendant du Mode Rotation** — visible en grille calendaire et en rotation
- Masqué en impression

## Ordre d'implémentation recommandé

1. Panel "En congés ce mois" — livrable indépendant (~20 min)
2. Toggle Mode Rotation — state `rotationMode` + rendu conditionnel
3. Grille rotation — `.rotation-grid` (CSS table-layout)
4. D&D PH Disponibles → cellule — `panelDragMed` + handlers + dialog durée
5. `handleAssignMonthView` dans `App.jsx` — boucle week_keys, rollback, undo groupé
6. Click-to-assign — réutilise `AssignModal` avec prop `monthViewMode`
7. Styles — `.rotation-grid`, `.rotation-cell`, `.rotation-cell.drop-target`

## Hors scope

- Drag & drop entre cellules de la grille rotation
- Affectation ponctuelle jour par jour depuis MonthView
- Modification de la grille calendaire pour les non-secrétaires
