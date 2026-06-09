# Changelog

## [1.3.0] — 2026-06-09

### Ajouté
- **Fermetures de service** (B7) : les gestionnaires peuvent configurer des fermetures ponctuelles ou saisonnières pour chaque service (ex. : HDJ fermé mi-juillet à mi-août). Les cellules correspondantes sont grisées automatiquement dans la vue Semaine et la vue Mois. Accès via Paramètres > Fermetures de service.
- **DateRangePicker** inline dans Paramètres : sélection d'une plage de dates en un seul calendrier (début → fin), avec numéros de semaine ISO, navigation par mois et aperçu de la plage au survol.
- **Archives fermetures** : les fermetures passées (`date_fin < aujourd'hui`) sont regroupées derrière un bandeau « Archives » collapsible.
- **Service Orthopédie** (B12) : nouveau service dispensable ajouté dans la grille planning.
- **CRUD API** `/api/fermetures` : 4 routes (GET, POST, PUT, DELETE) protégées par JWT, avec validation des dates ISO et whitelist `poste_id`.
- **Table `fermetures`** en base de données avec migration idempotente.

### Modifié
- **EMCC** (B3) : déplacé dans le groupe « UCC / EMCC », passé obligatoire, fermé automatiquement les lundis, mardis et mercredis (`closedDays:[1,2,3]`). Cellules grisées + alertes ignorées ces jours.
- **Vue Mois** (B2) : n'affiche par défaut que les services obligatoires (`!dispensable`) et les chips de type PH.
- **Boutons** harmonisés en style pill (`border-radius: 20px`) sur toute l'application. `.btn-primary` hover en fond bleu plein. `.btn-xs` neutre avec hover `surface2`.
- **Formulaires Paramètres** : champs alignés sur leur base (`align-items: flex-end`), fond blanc sur tous les inputs.
- **En-tête "Actions"** dans les tableaux : correctement alignée à droite (spécificité CSS corrigée).
- **Config email** : `gmail_user`/`gmail_pass` → `smtp_host`/`smtp_port`/`smtp_user`/`smtp_pass`/`from_email` pour support SMTP générique.

### Sécurité
- **poste_id whitelist** sur POST/PUT `/api/fermetures` : seuls les 19 postes connus sont acceptés, prévenant les insertions arbitraires.

### Tests
- 147 tests serveur (+ 7 nouveaux : routes fermetures, auth guards, validation, cycle CRUD complet)
- 85 tests client (+ 2 nouveaux : EMCC, Orthopédie ; 1 mis à jour suite à refacto P22)

---

## [1.2.0] — 2026-06-07

### Ajouté — P32 Suivi de campagne congés
- Tableau de bord "Suivi" dans TeamTab : statut de chaque praticien (A répondu / En attente / Expiré) avec timer live
- Bouton "Prolonger +48h" pour les tokens actifs, bouton "Renvoyer" (nouveau token + email) pour les expirés
- Nouvelle table `conge_campaigns` : chaque envoi de campagne crée un enregistrement groupant tous les tokens
- Migration DB : colonnes `used_at` et `campaign_id` sur `conge_tokens`
- 3 nouvelles routes API (`GET /api/conge/campaign/latest`, `PUT /api/conge/campaign/extend/:medId`, `POST /api/conge/campaign/resend/:medId`), toutes protégées par `requireGestionnaire`
- `POST /api/conge/submit` : UPDATE `used_at` au lieu de DELETE (tokens conservés pour l'historique)
- `GET/POST /api/conge/token/:token` : retourne 410 si le lien a déjà été utilisé

### Corrigé
- Sécurité : `requireGestionnaire` manquant sur PUT `/extend` et POST `/resend` (routes exposées sans auth)

### Tests
- 130 tests (+ 12 nouveaux pour P32 : statuts campagne, prolongation, renvoi, 401/403/410)

---

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
