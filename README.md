# Planning Gériatrie — Application Web

Application de planning pour le pôle de gériatrie.  
**Stack** : React 18 + Vite (front) · Node.js + Express (back) · SQLite via better-sqlite3 · Déploiement Railway

---

## Structure du projet

```
planning-geriatrie/
├── server/
│   ├── index.js           ← API REST Express (port 3001)
│   ├── db.js              ← Init SQLite + migrations
│   ├── db_schema.js       ← Schéma SQLite partagé (source unique)
│   ├── db_testable.js     ← Version isolée pour les tests
│   ├── seed.js            ← Peuplement initial depuis CSV
│   ├── setup-admin.js     ← Script création/mise à jour compte gestionnaire
│   ├── database.sqlite    ← Créé automatiquement au premier lancement
│   └── package.json
├── client/
│   ├── src/
│   │   ├── api.js                      ← Toutes les requêtes HTTP centralisées
│   │   ├── utils.js                    ← Dates, postes, schedule helpers, getDisponiblesPH
│   │   ├── App.jsx                     ← Composant racine, état global, undo
│   │   ├── main.jsx                    ← Routing SPA + gestion auth (LoginPage / App)
│   │   ├── styles.css                  ← CSS global (variables, composants)
│   │   ├── hooks/useData.js            ← useBaseData + usePlanning
│   │   └── components/
│   │       ├── LoginPage.jsx           ← Écran de connexion (deux modes : code équipe / gestionnaire)
│   │       ├── PlanningGrid.jsx        ← Grille hebdomadaire
│   │       ├── WeekNav.jsx             ← Navigation semaine
│   │       ├── AssignModal.jsx         ← Modale d'affectation
│   │       ├── TeamTab.jsx             ← Onglet équipe + praticiens extérieurs (gestionnaire only)
│   │       ├── CongesTab.jsx           ← Onglet congés (self-service médecin + campagne/ponctuels gestionnaire)
│   │       ├── StatsTab.jsx            ← Onglet statistiques
│   │       ├── AstreintesTab.jsx       ← Onglet astreintes (calendrier mensuel)
│   │       ├── MonthView.jsx           ← Vue mensuelle
│   │       ├── DoctorSearch.jsx        ← Recherche praticien
│   │       └── CongePublicPage.jsx     ← Page self-service congés (magic link)
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── package.json           ← Scripts racine (dev, build, start)
├── railway.toml           ← Config déploiement Railway
└── README.md
```

---

## Installation et lancement (développement)

### Prérequis
- Node.js 20+ (vérifier : `node --version`)
- npm 9+

### 1. Installer les dépendances

```bash
# Depuis la racine du projet
npm run install:all
```

### 2. Lancer en développement

```bash
# Depuis la racine — lance serveur + client simultanément
npm run dev
# → API  : http://localhost:3001
# → App  : http://localhost:5173
```

Ouvrir **http://localhost:5173** dans le navigateur.

---

## Authentification

L'application utilise deux niveaux d'accès, gérés via JWT.

### Médecins — accès lecture seule

- Connexion par **code équipe partagé** (affiché au premier démarrage dans les logs serveur)
- JWT `{ role: 'medecin' }`, valide 30 jours
- Accès : consultation du planning, des absences, des statistiques et des astreintes

### Gestionnaires — accès complet

- Connexion par **email + mot de passe individuel**
- JWT `{ role: 'gestionnaire', userId }`, valide 8h
- Accès : tout + onglet Équipe, vue Rotation, modification du planning, gestion des absences

### Création d'un compte gestionnaire

```bash
cd server
node setup-admin.js prenom.nom@chd-vendee.fr MonMotDePasse "Prénom Nom"
```

Peut être relancé pour modifier le mot de passe d'un compte existant.

### Code équipe

- Généré automatiquement au premier démarrage (affiché dans les logs)
- Modifiable par les gestionnaires depuis l'onglet **Équipe → Paramètres**
- Stocké en clair dans la table `settings` (`key = 'team_code'`)

### Magic link self-service congés

Les routes `/api/conge/*` sont publiques. Le lien envoyé par email contient un token unique expirant — il donne accès directement au formulaire de saisie sans passer par l'écran de connexion.

---

## API REST

### Routes publiques (sans JWT)

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/team` | Code équipe → JWT médecin (30j) |
| POST | `/api/auth/gestionnaire` | Email + mot de passe → JWT gestionnaire (8h) |
| GET | `/api/conge/token/:token` | Validation magic link |
| POST | `/api/conge/submit` | Soumission absences self-service |
| POST | `/api/conge-requests` | Soumettre une demande ponctuelle de congé (médecin, sans compte) |

### Routes lecture (JWT médecin ou gestionnaire)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/medecins` | Liste tous les praticiens actifs |
| GET | `/api/absences` | Liste toutes les absences |
| GET | `/api/planning/:weekKey` | Planning complet d'une semaine |
| GET | `/api/astreintes` | Astreintes d'un mois (`?month=YYYY-MM`) |
| GET | `/api/stats/medecin/:id` | Stats d'un praticien (`?from=YYYY-MM-DD&to=YYYY-MM-DD`) |
| GET | `/api/stats/all` | Stats de toute l'équipe |

### Routes écriture (JWT gestionnaire uniquement)

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/medecins` | Ajouter un praticien |
| PUT | `/api/medecins/:id` | Modifier (nom, type, service, tel, sched) |
| DELETE | `/api/medecins/:id` | Supprimer |
| POST | `/api/absences` | Ajouter une absence |
| DELETE | `/api/absences/:id` | Supprimer |
| POST | `/api/affectations` | Affecter un praticien à un poste |
| DELETE | `/api/affectations` | Retirer d'un poste |
| POST | `/api/exclusions` | Exclure un praticien d'un jour précis |
| DELETE | `/api/exclusions` | Annuler une exclusion |
| POST | `/api/extras` | Ajouter un remplaçant sur un jour |
| DELETE | `/api/extras` | Retirer un remplaçant |
| POST | `/api/renforts` | Ajouter un renfort |
| DELETE | `/api/renforts` | Retirer un renfort |
| POST | `/api/planning/copy` | Copier une semaine vers une autre |
| POST | `/api/astreintes` | Saisir une astreinte |
| DELETE | `/api/astreintes/:id` | Supprimer une astreinte |
| GET | `/api/settings/team-code` | Lire le code équipe actuel |
| PUT | `/api/settings/team-code` | Modifier le code équipe |
| GET | `/api/backup/download` | Téléchargement SQLite |
| GET | `/api/conge/preview` | Aperçu campagne congés |
| POST | `/api/conge/campaign` | Lancer une campagne d'emails |
| GET | `/api/conge/campaign/latest` | Statut de la dernière campagne (membres, absences, timers) |
| PUT | `/api/conge/campaign/extend/:medId` | Prolonger le token d'un praticien (+N heures) |
| POST | `/api/conge/campaign/resend/:medId` | Régénérer et renvoyer le magic link d'un praticien |
| POST | `/api/conge/campaign/confirm/:medId` | Valider toutes les absences soumises par un praticien |
| POST | `/api/conge/campaign/edit-token/:medId` | Générer un nouveau lien pour qu'un praticien modifie ses congés |
| PATCH | `/api/absences/:id/confirm` | Valider une absence individuelle |
| PATCH | `/api/absences/:id/unconfirm` | Remettre une absence en attente |
| GET | `/api/conge-requests` | Lister les demandes ponctuelles (`?statut=pending\|accepted\|refused`) |
| PATCH | `/api/conge-requests/:id/accept` | Accepter une demande ponctuelle (confirme l'absence liée) |
| PATCH | `/api/conge-requests/:id/refuse` | Refuser une demande ponctuelle (supprime l'absence liée) |

---

## Déploiement (Railway)

Le projet est configuré pour Railway via `railway.toml` :

- **Build** : `cd server && npm install --omit=dev && npm run build` (compile le front Vite)
- **Start** : `npm start` → `cd server && node index.js`
- Le serveur Express sert à la fois l'API (`/api/*`) et les fichiers statiques du front compilé

Variables d'environnement Railway :
- `PORT` : assigné automatiquement par Railway
- `JWT_SECRET` : secret JWT (obligatoire en production — à définir dans Railway)
- Voir `server/email.config.json.example` pour les variables email

### Lancement production local

```bash
npm run build          # compile le front dans client/dist/
npm start              # démarre le serveur Express
# Accès : http://localhost:3001
```

---

## Tests

```bash
# Tests client (Vitest)
cd client && npm test

# Tests serveur (Jest + supertest)
cd server && npm test
```

Les tests serveur utilisent `db_testable.js` avec une base SQLite en mémoire isolée.

---

## Sauvegarde

La base de données est dans `server/database.sqlite`.  
**Sauvegarder ce fichier suffit** à préserver toutes les données.

### Depuis l'interface (gestionnaire)

Onglet **Équipe** → bouton **Backup BD** → télécharge `planning-backup-YYYY-MM-DD.sqlite`.  
Appelle `GET /api/backup/download` (JWT gestionnaire requis).

### Automatique (cron Linux — serveur dédié)

```bash
# Chaque soir à 23h
0 23 * * * cp /opt/planning-geriatrie/server/database.sqlite /backup/planning_$(date +\%Y\%m\%d).sqlite
```

---

## Personnalisation

- **Postes** : modifier le tableau `POSTES` dans `client/src/utils.js`
- **Équipe initiale** : modifier `server/seed.js`
- **Port du serveur** : variable d'environnement `PORT` (défaut : 3001)

```bash
PORT=8080 npm start
```
