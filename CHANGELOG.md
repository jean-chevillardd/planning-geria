# Changelog

## [1.1.0] — 2026-06-06

### Ajouté — P31 Onglet Paramètres (admin)
- Nouvel onglet "Paramètres" dans la navigation principale (visible uniquement gestionnaire)
- 3 sous-sections avec navigation latérale :
  - **Identifiants** : modification du code équipe + mot de passe gestionnaire (champs masqués avec toggle œil)
  - **Gestionnaires** : tableau des comptes admin + création inline + édition inline + suppression avec confirmation 3 s
  - **Historique** : journal d'audit paginé (20/page) avec filtres action/table/dates et badges colorés
- Protection : impossible de supprimer le dernier compte gestionnaire (HTTP 409)
- 6 nouvelles routes API (`PUT /api/auth/change-password`, `GET/POST /api/gestionnaires`, `PUT/DELETE /api/gestionnaires/:id`, `GET /api/audit-log`)

### Modifié
- `TeamTab` : suppression du bouton "Paramètres" et du `SettingsPanel` modale (remplacés par l'onglet dédié)
- `App.jsx` : filtrage onglets unifié via `gestionnaireOnly` flag ; icône engrenage SVG pour l'onglet Paramètres
- `api.js` : ajout des fonctions `changePassword`, `getGestionnaires`, `createGestionnaire`, `updateGestionnaire`, `deleteGestionnaire`, `getAuditLog`

### Corrigé
- `PlanningGrid` : garde-fous D&D — blocage si le médecin est déjà présent dans le poste cible ce jour (affectation régulière ou extra)
- `usePlanning` : export de `setData` depuis le hook pour usage dans les composants

### Tests
- 119 tests (+ 22 nouveaux pour les routes P31, dont le cas limite "dernier gestionnaire")

---

## [1.0.0] — 2026-06-03

- Version initiale avec authentification deux rôles (médecin / gestionnaire)
- Planning hebdomadaire, vue rotation, vue mensuelle
- Gestion des absences, astreintes, statistiques
- Export PDF, copie de semaine, backup BD
- Self-service congés via magic link email
