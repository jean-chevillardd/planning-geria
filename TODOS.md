# Backlog — Planning Gériatrie

> Livraisons passées → [DONE.md](DONE.md) | Specs détaillées → [BACKLOG/](BACKLOG/)

---

## 🔧 Non commité — à committer

| Fichier | Nature |
|---|---|
| `client/src/components/CongesTab.jsx` | Refacto `MedDropdown` → `<select>` natif (simplification) |
| `client/src/styles.css` | CSS complémentaire |

---

## 📋 Backlog actif — demandes terrain (réunion 2026-06-08)

Prêt à implémenter, classé par priorité.

### 🔴 Immédiat (XS — < 30 min chacun)

| # | Tâche | Fichier(s) |
|---|---|---|
| B3 | **EMCC** : passer `dispensable → obligatoire` + fermé lun/mar/mer (`closedDays`) | `utils.js` |
| B12 | **Orthopédie** : nouveau poste `ortho`, dispensable | `utils.js` |

### 🟠 Court terme (S/M)

| # | Tâche | Effort | Fichier(s) |
|---|---|---|---|
| B2 | **Vue mensuelle** : filtrer uniquement PH + services indispensables | XS | `MonthView.jsx` |
| B7 | **HDJ programmé** : fermeture estivale semaines 29–33 (mi-juillet → mi-août) | XS | `utils.js`, `PlanningGrid.jsx` |
| B4 | **Search bar** : renforts inclus dans les résultats + compteurs ligne/jour | S | `PlanningGrid.jsx`, `utils.js` |
| B9 | **Bandeau congés** dans la vue planning (chips par médecin en congé, semaine affichée) | M | `PlanningGrid.jsx`, `MonthView.jsx` |

### 🟡 Moyen terme (M/L)

| # | Tâche | Effort | Fichier(s) |
|---|---|---|---|
| B11 | **StatsTab** : calcul en jours (pas en semaines) + taux de présence pris en compte | M | `StatsTab.jsx`, `utils.js` |
| B1 | **Force-affectation** : gestionnaire peut passer outre les blocages (avertissement + confirmation) | M | `AssignModal.jsx`, `server/index.js` |
| B5 | **TeamTab** : archivage à date future (`date_depart`) + date d'arrivée (`date_arrivee`) | L | `TeamTab.jsx`, `db_schema.js`, `server/index.js` |

### 🔵 À spécifier avant d'implémenter

| # | Tâche | Effort | Note |
|---|---|---|---|
| B10 | **Édition simultanée** : versioning optimiste ou documentation du comportement last-write-wins | L | Étudier `updated_at` + rejet si conflit |
| B8 | **Patterns présence irréguliers** : cycles (1 vendredi/2, 2 sem/3…) | XL | Choix architecture requis (règle cyclique vs. overrides) |

---

## ❄️ Backburner — faible priorité

| # | Titre | Effort | Note |
|---|---|---|---|
| DT9 | CSS modularisé | L | Cosmétique, aucune urgence |

---

## ❌ Abandonnés

| # | Titre | Date |
|---|---|---|
| P28 | "Semaines d'instabilité" — définition métier + tracking StatsTab | 2026-06-08 |
| P33 | Icône de notifications gestionnaire (cloche) | 2026-06-08 |
| P30 V2 | Recueil souhaits praticiens (magic link V2) | 2026-06-08 |
| P11/F6 | Bouton Refus demande ponctuelle + motif + mail retour | 2026-06-08 |
| P11/F7 | Heatmap de tension congés | 2026-06-08 |
