# Planning Gériatrie — Application Web

Application de planning pour le pôle de gériatrie.  
**Stack** : React + Vite (front) · Node.js + Express (back) · SQLite via better-sqlite3

---

## Structure du projet

```
planning-geriatrie/
├── server/
│   ├── index.js          ← API REST Express (port 3001)
│   ├── db.js             ← Init SQLite + seed données
│   ├── database.sqlite   ← Créé automatiquement au premier lancement
│   └── package.json
├── client/
│   ├── src/
│   │   ├── api.js                   ← Toutes les requêtes fetch
│   │   ├── utils.js                 ← Dates, postes, schedule helpers
│   │   ├── App.jsx                  ← Composant racine
│   │   ├── styles.css               ← CSS global
│   │   ├── hooks/useData.js         ← Custom hooks fetch
│   │   └── components/
│   │       ├── PlanningGrid.jsx
│   │       ├── WeekNav.jsx
│   │       ├── AssignModal.jsx
│   │       ├── TeamTab.jsx
│   │       ├── AbsencesTab.jsx
│   │       ├── StatsTab.jsx
│   │       └── MonthView.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## Installation et lancement (développement)

### Prérequis
- Node.js 18+ (vérifier : `node --version`)
- npm 9+

### 1. Installer les dépendances

```bash
# Depuis la racine du projet
cd server && npm install
cd ../client && npm install
```

### 2. Lancer en développement

**Terminal 1 — serveur :**
```bash
cd server
node --watch index.js
# → http://localhost:3001
```

**Terminal 2 — client :**
```bash
cd client
npm run dev
# → http://localhost:5173
```

Ouvrir **http://localhost:5173** dans le navigateur.

---

## Déploiement intranet (production)

### Compiler le front

```bash
cd client
npm run build
# → génère client/dist/
```

### Option A — Servir le front depuis Express (recommandé)

Ajouter dans `server/index.js` avant `app.listen` :

```javascript
const path = require('path');
// Servir les fichiers statiques du front compilé
app.use(express.static(path.join(__dirname, '../client/dist')));
// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});
```

Puis modifier `client/src/api.js` : remplacer `const BASE = '/api'` par `const BASE = '/api'`  
(ça reste `/api` car le front et le back sont servis depuis le même serveur).

Lancer uniquement :
```bash
cd server
node index.js
# Accès : http://votre-serveur-intranet:3001
```

### Option B — Nginx (si disponible sur le serveur intranet)

```nginx
server {
    listen 80;
    server_name planning.geriatrie.local;

    # Front compilé
    location / {
        root /opt/planning-geriatrie/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy vers l'API Node
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
    }
}
```

---

## API REST

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/medecins` | Liste tous les praticiens |
| POST | `/api/medecins` | Ajouter un praticien |
| PUT | `/api/medecins/:id` | Modifier (nom, type, sched) |
| DELETE | `/api/medecins/:id` | Supprimer |
| GET | `/api/absences` | Liste toutes les absences |
| POST | `/api/absences` | Ajouter une absence |
| DELETE | `/api/absences/:id` | Supprimer |
| GET | `/api/planning/:weekKey` | Planning complet d'une semaine |
| POST | `/api/affectations` | Affecter un praticien à un poste (semaine) |
| DELETE | `/api/affectations` | Retirer d'un poste (semaine) |
| POST | `/api/exclusions` | Exclure un praticien d'un jour précis |
| DELETE | `/api/exclusions` | Annuler une exclusion |
| POST | `/api/extras` | Ajouter un remplaçant sur un jour |
| DELETE | `/api/extras` | Retirer un remplaçant |
| POST | `/api/planning/copy` | Copier une semaine vers une autre |

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
- **Équipe initiale** : modifier le tableau `seed` dans `server/db.js`
- **Port du serveur** : variable d'environnement `PORT` (défaut : 3001)

```bash
PORT=8080 node server/index.js
```
