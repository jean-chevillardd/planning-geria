# Planning Gériatrie — Plan de consolidation v1

<!-- /autoplan restore point: /Users/jeanchevillard/.gstack/projects/jean-chevillardd-planning-geria/main-autoplan-restore-20260528-223217.md -->

## Contexte produit

Application web de planning pour le pôle gériatrie d'un hôpital français.  
Utilisateurs : secrétaires (mode édition) + praticiens (lecture seule + self-service congés).  
Déploiement actuel : Railway (cloud), accès intranet envisagé.

## Ce qui est construit

### Fonctionnalités livrées
- **Planning semaine** : grille affectation médecins/postes, drag & drop, undo, copie semaine
- **Vue mensuelle** : calendrier par poste ou par médecin, filtres service, impression PDF
- **Équipe** : CRUD praticiens (nom, type PH/IPA/Interne/PADHUE/Externe, schedule hebdo, email)
- **Absences** : saisie congés (7 types), vue calendrier + vue semestre, alerte chevauchement
- **Astreintes** : 3 vues (semaine, rotation, calendrier), saisie par type
- **Statistiques** : cards demi-journées, heatmap mensuel, panneau détail par praticien
- **Self-service congés** : magic link par email → page publique sans connexion
- **Authentification** : mot de passe secrétariat, JWT, rate limiting, Helmet

### Stack
- React 18 + Vite (frontend, port 5173)
- Express 4 + sql.js WASM (backend, port 3001)
- SQLite (database.sqlite)
- Railway pour le déploiement

## Ce qui doit être corrigé (bugs identifiés)

### Critique
1. **Bug transaction `POST /api/planning/copy`** — `persist()` fait un `db.export()` qui commit implicitement la transaction SQLite ouverte par `transaction()`. La route `/copy` retourne systématiquement 500. Documenté dans les tests (`api.test.js:1551`).
2. **JWT_SECRET regénéré à chaque redémarrage** — tous les tokens sont invalidés sur restart. Les utilisateurs doivent se reconnecter après chaque déploiement.

### Moyen
3. **Business logic non enforced côté serveur** — "un médecin = un poste max" est uniquement dans `AssignModal.jsx`. Le serveur accepte des affectations multiples pour le même médecin la même semaine.
4. **Utilitaires date dupliqués** — `countWorkingDays`, `toIso`, etc. définis dans `AbsencesTab.jsx`, `StatsTab.jsx`, `utils.js`, `clear_holidays.js`. Divergences possibles.
5. **Pas de validation d'entrée côté serveur** sur la plupart des routes (seules `isIsoDate` et `isMonth` existent). Injection possible via `poste_id`, `med_id`, etc.

### Mineur
6. **Email config en clair dans `email.config.json`** — pas de chiffrement, le fichier est ignoré par git mais peut fuiter sur le serveur.
7. **Pas de versioning des migrations SQLite** — les migrations sont idempotentes mais pas numérotées, difficile de savoir où en est le schéma.
8. **`sql.js` vs `better-sqlite3`** — sql.js (WASM) nécessite un `persist()` manuel après chaque écriture ; risque de perte de données si le process crash entre l'écriture en mémoire et la persistence sur disque.

## Ce qui est manquant (roadmap suggérée)

### Priorité 1 — Stabilité
- [ ] Corriger le bug transaction (fix dans `db.js` : ne pas appeler `persist()` si `inTransaction`)
- [ ] Fixer le JWT_SECRET (lire depuis un fichier config ou variable d'env persistante)
- [ ] Ajouter la validation serveur pour `med_id`, `poste_id`, `week_key` (whitelist)

### Priorité 2 — Qualité
- [ ] Dédupliqer les utilitaires date (extraire vers un module partagé ou importer depuis `utils.js` côté serveur)
- [ ] Ajouter la contrainte `un médecin = un poste max` côté serveur (UNIQUE constraint ou vérification avant INSERT)
- [ ] Tests pour les routes astreintes, stats, self-service congés (non couverts actuellement)

### Priorité 3 — Features
- [ ] Export Excel/CSV du planning (demande utilisateur probable)
- [ ] Notifications par email sur les modifications importantes (praticien absent affecté)
- [ ] Historique des modifications (audit log)
- [ ] Support mobile (l'app est desktop-only actuellement)

## Scope de cette session d'autoplan

Focus sur les Priorité 1 et 2. Le but est d'identifier les vrais risques, prioriser les corrections, et définir une approche d'implémentation correcte pour chaque bug.

---

## GSTACK REVIEW REPORT

(À remplir par l'autoplan pipeline)
