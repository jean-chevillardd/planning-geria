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
│   ├── db_testable.js     ← Version isolée pour les tests
│   ├── seed.js            ← Peuplement initial depuis CSV
│   ├── database.sqlite    ← Créé automatiquement au premier lancement
│   └── package.json
├── client/
│   ├── src/
│   │   ├── api.js                      ← Toutes les requêtes HTTP centralisées
│   │   ├── utils.js                    ← Dates, postes, schedule helpers
│   │   ├── App.jsx                     ← Composant racine, état global, undo
│   │   ├── main.jsx                    ← Routing SPA (App ou CongePublicPage)
│   │   ├── styles.css                  ← CSS global (variables, composants)
│   │   ├── hooks/useData.js            ← useBaseData + usePlanning
│   │   └── components/
│   │       ├── PlanningGrid.jsx        ← Grille hebdomadaire
│   │       ├── WeekNav.jsx             ← Navigation semaine
│   │       ├── AssignModal.jsx         ← Modale d'affectation
│   │       ├── TeamTab.jsx             ← Onglet équipe + praticiens extérieurs
│   │       ├── AbsencesTab.jsx         ← Onglet absences
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

Ou séparément :

```bash
npm run dev:server   # Express avec nodemon
npm run dev:client   # Vite HMR
```

Ouvrir **http://localhost:5173** dans le navigateur.

---

## Authentification

L'accès à l'application nécessite une connexion secrétariat :

- `POST /api/auth` : vérification mot de passe → retourne un JWT
- Le token JWT est stocké en mémoire côté client et inclus dans chaque requête protégée
- Mot de passe haché (bcryptjs) dans `server/secretary.config.json` (hors git)
- Rate limiting sur `/api/auth` (protection brute-force)

Les routes `/api/conge/*` sont publiques pour le self-service praticiens.

---

## Self-service congés (magic link)

Le secrétariat peut envoyer aux praticiens un lien personnalisé pour déclarer leurs congés :

1. `POST /api/conge/campaign` → génère des tokens et envoie les emails (Nodemailer/Gmail)
2. Le praticien clique sur son lien → `CongePublicPage` (aucune auth requise)
3. `GET /api/conge/token/:token` → valide le token et retourne les infos du praticien
4. `POST /api/conge/submit` → enregistre les absences déclarées

Configuration email : `server/email.config.json` (hors git — voir `email.config.json.example`).

---

## API REST

### Routes publiques (sans JWT)

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth` | Connexion secrétariat → JWT |
| GET | `/api/conge/token/:token` | Validation magic link |
| POST | `/api/conge/submit` | Soumission absences self-service |

### Routes protégées (JWT requis)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/medecins` | Liste tous les praticiens |
| POST | `/api/medecins` | Ajouter un praticien |
| PUT | `/api/medecins/:id` | Modifier (nom, type, service, tel, sched) |
| DELETE | `/api/medecins/:id` | Supprimer |
| GET | `/api/absences` | Liste toutes les absences |
| POST | `/api/absences` | Ajouter une absence |
| DELETE | `/api/absences/:id` | Supprimer |
| GET | `/api/planning/:weekKey` | Planning complet d'une semaine |
| POST | `/api/affectations` | Affecter un praticien à un poste |
| DELETE | `/api/affectations` | Retirer d'un poste |
| POST | `/api/exclusions` | Exclure un praticien d'un jour précis |
| DELETE | `/api/exclusions` | Annuler une exclusion |
| POST | `/api/extras` | Ajouter un remplaçant sur un jour |
| DELETE | `/api/extras` | Retirer un remplaçant |
| POST | `/api/renforts` | Ajouter un renfort |
| DELETE | `/api/renforts` | Retirer un renfort |
| POST | `/api/planning/copy` | Copier une semaine vers une autre |
| GET | `/api/astreintes` | Astreintes d'un mois (`?month=YYYY-MM`) |
| POST | `/api/astreintes` | Saisir une astreinte |
| DELETE | `/api/astreintes/:id` | Supprimer une astreinte |
| GET | `/api/stats/medecin/:id` | Stats d'un praticien |
| GET | `/api/stats/all` | Stats de toute l'équipe |
| GET | `/api/conge/preview` | Aperçu campagne congés |
| POST | `/api/conge/campaign` | Lancer une campagne d'emails |

---

## Déploiement (Railway)

Le projet est configuré pour Railway via `railway.toml` :

- **Build** : `cd server && npm install --omit=dev && npm run build` (compile le front Vite)
- **Start** : `npm start` → `cd server && node index.js`
- Le serveur Express sert à la fois l'API (`/api/*`) et les fichiers statiques du front compilé

Variables d'environnement Railway :
- `PORT` : assigné automatiquement par Railway
- `JWT_SECRET` : secret JWT (à définir dans Railway)
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

Exemple de sauvegarde automatique (cron Linux) :
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
