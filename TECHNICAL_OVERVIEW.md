# Technical Overview — Planning Gériatrie

> Document destiné aux nouveaux membres de l'équipe produit. Il décrit l'architecture, les flux de données, les dépendances clés et la dette technique connue.

---

## 1. Ce que fait le produit

Application web interne permettant au secrétariat d'un pôle de gériatrie de gérer :

- **Le planning hebdomadaire et mensuel** — qui couvre quel service, quel jour
- **Les absences et congés** des praticiens (avec un self-service par lien email)
- **Les astreintes** (nuit, week-end, ponts) par type et par médecin
- **Les statistiques** de présence et de couverture par service
- **L'annuaire de l'équipe** (praticiens hospitaliers, internes, PADHUE, IPA, extérieurs)

Les utilisateurs sont exclusivement internes : une ou plusieurs secrétaires médicales, et les praticiens qui reçoivent un lien pour déclarer leurs congés.

---

## 2. Architecture globale

```
┌─────────────────────────────────┐
│         Navigateur (SPA)        │
│  React 18 + Vite                │
│  client/src/                    │
│  → api.js  (HTTP)               │
│  → hooks/useData.js             │
│  → components/ (5 onglets)      │
└───────────────┬─────────────────┘
                │ HTTP / JSON
                ▼
┌─────────────────────────────────┐
│        Serveur Express          │
│  server/index.js  (port 3001)   │
│  Auth JWT · Rate limiting       │
│  Toutes les routes /api/*       │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│         Base de données         │
│  SQLite via better-sqlite3      │
│  Fichier : server/database.sqlite│
│  Accès synchrone natif          │
│  Transactions : db.transaction()│
└─────────────────────────────────┘
```

**En production**, tout tourne sur **Railway** : le serveur Express sert à la fois l'API et le front compilé (un seul processus, un seul port). Il n'y a pas de CDN ni de proxy intermédiaire.

**En développement**, deux processus séparés :
- Vite HMR sur `localhost:5173`
- Express sur `localhost:3001`

---

## 3. Structure des fichiers clés

```
client/src/
  api.js              — toutes les requêtes HTTP (point d'entrée unique)
  utils.js            — fonctions pures : dates, postes, schedules, disponibilités
  App.jsx             — état global, navigation entre onglets, système undo
  main.jsx            — routage minimal (app normale vs page self-service congés)
  hooks/useData.js    — 2 hooks : données stables + données de la semaine
  components/         — un fichier par onglet ou sous-composant

server/
  index.js            — toutes les routes REST + middlewares
  db.js               — accès SQLite (chargement, requêtes, persist)
  db_schema.js        — définition des tables (source de vérité DDL)
  seed.js             — import initial depuis CSV
  db_testable.js      — version isolée pour les tests automatisés
```

---

## 4. Flux de données principaux

### 4a. Chargement initial (ouverture de l'app)

```
App.jsx
  └── useBaseData()        → GET /api/medecins + GET /api/absences
  └── usePlanning(weekKey) → GET /api/planning/:weekKey
```

`useBaseData` charge une fois au démarrage (données stables : praticiens, absences).  
`usePlanning` recharge à chaque changement de semaine.

### 4b. Affectation d'un praticien

```
PlanningGrid → clic sur poste
  → AssignModal (liste les candidats disponibles, garde-fous client)
  → POST /api/affectations  ou  POST /api/extras  ou  POST /api/renforts
  → App.jsx recharge usePlanning
  → pushUndo() enregistre l'action pour Ctrl+Z
```

Trois types d'affectation distincts au niveau BDD :
- **affectation** : régulière sur toute la semaine (lié à un `week_key`)
- **extra** : ponctuel sur un seul jour (date précise)
- **renfort** : praticien déjà affecté ailleurs qui intervient en plus

### 4c. Self-service congés (praticien sans compte)

```
Secrétariat → POST /api/conge/campaign
  → génère un token unique par praticien + envoi email (Nodemailer/Gmail)

Praticien → clic sur le lien → /conge/<token>
  → CongePublicPage (pas de JWT requis)
  → GET /api/conge/token/:token  (validation + identité)
  → formulaire de saisie
  → POST /api/conge/submit  (enregistre les absences)
```

### 4d. Persistance SQLite

La base est un fichier sur disque (`server/database.sqlite`). **better-sqlite3** y écrit directement et de façon synchrone — pas de `persist()`, pas de buffer mémoire. Les transactions utilisent `db.transaction(fn)()`. Sur Railway (disque éphémère), le bouton **Backup BD** (onglet Équipe) permet de télécharger une copie à la demande via `GET /api/backup/download`.

---

## 5. Authentification et accès

| Contexte | Mécanisme |
|---|---|
| Secrétariat | Mot de passe → JWT (secret régénéré à chaque redémarrage) |
| Praticien self-service | Magic link par email (token UUID avec TTL) |
| Routes API protégées | Header `Authorization: Bearer <token>` |
| Routes publiques | `/api/auth`, `/api/conge/*` (avant le guard JWT) |

Le mot de passe est haché (bcryptjs) dans `server/secretary.config.json` (hors git).  
Il n'y a **pas de gestion de comptes multiples** : un seul profil secrétariat pour l'instant.

---

## 6. Modèle de données (résumé)

| Table | Rôle |
|---|---|
| `medecins` | Praticiens (id, nom, type, service, tel, email, sched) |
| `absences` | Congés (med_id, date_debut, date_fin, type_abs) |
| `affectations` | Planning hebdo (week_key, poste_id, med_id) |
| `exclusions` | Exception journalière pour un praticien affecté (day off dans sa semaine) |
| `extras` | Affectation ponctuelle un seul jour |
| `renforts` | Double présence (praticien déjà ailleurs, vient en plus) |
| `astreintes` | Astreintes nuit/WE (date_iso, type_ast, med_id) |
| `conge_tokens` | Magic links self-service (med_id, token, expires_at) |

Le champ `sched` dans `medecins` est un tableau de 10 bits (lundi matin → vendredi après-midi) indiquant les demi-journées de présence habituelle du praticien.

---

## 7. Règles métier importantes

### Postes obligatoires vs dispensables

Les services sont classés dans `utils.js` (tableau `POSTES`) selon deux flags :

- **`obligatoire: true`** : CSG 1, CSG 2, HDJ, EOPS, SSR (3 étages), UCC, EHPAD — la couverture est requise chaque jour
- **`dispensable: true`** : EMG, EMCC, TNC, HDJ oncoGéria, EHPAD Luçon, CST Mémoire — ouverts uniquement si > 12 PH présents (> 11 le mercredi)

Le compteur PH/jour affiché dans la grille n'inclut **pas** les PH affectés aux services dispensables.

### Contraintes spécifiques de postes

| Poste | Contrainte |
|---|---|
| HDJ programmé | Fermé systématiquement le mercredi |
| HdJNP | Fermeture sur décision cadre IDE (manuelle) |
| SSR (3 étages) | Minimum 3 PH ; 2 PH ponctuel OK mais pas 2 jours consécutifs |
| EHPAD | 1 PH titulaire doit couvrir ≥ 3 jours / 5 |
| UCC | Absence tolérée le mercredi |

### Règle "un médecin = un poste"

La contrainte est **uniquement côté client** (dans AssignModal). Le serveur ne la vérifie pas — les extras et renforts peuvent légitimement dépasser cette règle pour certains cas.

---

## 8. Dépendances principales

### Frontend

| Package | Rôle | Version |
|---|---|---|
| React 18 | UI | ^18 |
| Vite | Bundler + dev server | ^5 |
| (pas de lib CSS) | CSS pur avec variables | — |

Pas de TypeScript, pas de Tailwind, pas de composants UI tiers (pas de MUI, Chakra, etc.). Tout est en JavaScript vanilla + CSS custom.

### Backend

| Package | Rôle | Remarque |
|---|---|---|
| Express | Serveur HTTP | — |
| better-sqlite3 | SQLite natif synchrone | Migré depuis sql.js (DT1) — écriture directe sur disque |
| jsonwebtoken | Auth JWT | — |
| bcryptjs | Hash mot de passe | — |
| nodemailer | Envoi emails | Config Gmail (hors git) |
| express-rate-limit | Anti brute-force | Sur `/api/auth` |
| nodemon | Dev hot-reload | Dev uniquement |

### Tests

| Package | Périmètre |
|---|---|
| Vitest | Tests unitaires fonctions pures (client) |
| Jest + supertest | Tests d'intégration routes API (serveur) |

### Infrastructure

| Service | Usage |
|---|---|
| Railway | Hébergement PaaS (build + run + env vars) |
| Gmail (SMTP) | Envoi des magic links congés |

---

## 9. Dette technique identifiée

### ~~Critique — RÉSOLUE~~

**~~DT1 — `POST /api/planning/copy` retourne 500~~** ✅ RÉSOLU (migration better-sqlite3, 2026-06-05)  
Cause originale : `db.export()` (sql.js) provoquait un COMMIT implicite en cours de transaction. Migration vers better-sqlite3 supprime ce problème : écriture synchrone native, transactions `db.transaction(fn)()` sans double-COMMIT.

### Significative (risque fonctionnel)

**DT2 — JWT secret potentiellement instable.**  
Partiellement résolu : le serveur lit `JWT_SECRET` depuis l'env var (ligne 67 de `index.js`) avec fallback aléatoire + warning si non définie. **En prod Railway, configurer `JWT_SECRET` comme variable d'environnement persistante** pour éviter les déconnexions forcées à chaque redéploiement.

**DT4 — Un seul compte secrétariat.**  
Pas de gestion multi-utilisateurs, pas de rôles fins. Si deux secrétaires travaillent simultanément, elles partagent le même token. Effort L, faible priorité tant que l'équipe reste petite.

**~~DT3 — Pas de sauvegarde automatique de la base en production~~** ✅ RÉSOLU (2026-06-05)  
Bouton "Backup BD" dans l'onglet Équipe → `GET /api/backup/download` → télécharge `planning-backup-YYYY-MM-DD.sqlite`. Backup à la demande disponible pour tout utilisateur secrétariat.

### Modérée (maintenabilité / scalabilité)

**DT5 — Logique de disponibilité client-side (AssignModal).**  
Les règles de disponibilité des praticiens sont calculées côté client. Si une règle métier complexe est ajoutée, elle doit être dupliquée côté serveur. Acceptable dans l'état actuel.

**~~DT6 — Incohérence documentation sql.js/better-sqlite3~~** ✅ RÉSOLU  
README et TECHNICAL_OVERVIEW mis à jour pour refléter better-sqlite3.

**DT7 — Validation des données en entrée côté serveur.**  
Partiellement résolu : `ISO_DATE_RE`, `MED_TYPES`, `ABS_TYPES` valident les champs critiques. Pas de schéma global type Zod. Risque faible tant que l'API reste interne.

**DT8 — Jours fériés sans ponts décalés.**  
L'algorithme de Pâques est correct pour la France, mais les ponts (lundi de récupération quand le 8 mai tombe un dimanche) ne sont pas gérés. Impact faible.

### Faible (dette cosmétique / future)

- **DT9** — CSS non modularisé : tout dans `styles.css` (~2500 lignes). Maintenable mais difficile à scaler.
- **DT10** — Pas de TypeScript : robustesse des props et réponses API reposent sur des conventions non vérifiées.

---

## 10. Ce qui fonctionne bien

- **Architecture simple et directe** : un seul serveur, une seule DB, pas de microservices. Facile à déboguer et à déployer.
- **Couverture de tests** : les fonctions métier pures (utils.js) et les routes API principales sont testées avec isolation DB.
- **Système d'undo global** : toutes les actions destructives sont réversibles via Ctrl+Z sans rechargement de page.
- **Self-service congés** : le flux magic link fonctionne end-to-end sans que les praticiens aient besoin d'un compte.
- **Règles métier externalisées** : le tableau `POSTES` dans `utils.js` est la source de vérité pour toutes les contraintes de services — ajouter un nouveau poste ne nécessite pas de toucher aux composants.

---

*Dernière mise à jour : 2026-06-05*
