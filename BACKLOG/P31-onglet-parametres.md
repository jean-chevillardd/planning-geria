# P31 — Onglet Paramètres (refacto du bouton Settings de TeamTab)

**Effort :** XL (CC: ~5–6h) | **WSJF :** 2.1 | **Bloquant :** design validé ✅ (2026-06-06)

## Pourquoi

Le bouton "Paramètres" dans TeamTab est limité à la modification du code équipe. Avec l'arrivée de l'auth multi-gestionnaires, il faut un espace dédié pour gérer les comptes, les mots de passe et l'audit trail. Ce n'est plus une fonctionnalité secondaire — c'est une surface d'administration à part entière.

## Ce que ça remplace

- Le bouton "Paramètres" + `SettingsPanel` modale dans `TeamTab.jsx` (à supprimer en F6)
- Aucune UI existante pour la gestion des comptes gestionnaires
- Aucune UI existante pour consulter l'`audit_log`

## Design de référence

Prototype validé le 2026-06-06 via Claude Design.  
Fichiers sources : `/tmp/parametres-design/onglet-param-tres/project/`
- `Paramètres v2.html` — maquette interactive complète
- `pm2-app.jsx` — shell, sidebar, toasts, root
- `pm2-sections.jsx` — composants des 3 sections
- `pm2-data.js` — données de démo
- `tweaks-panel.jsx` — panneau de tweaks (accent, densité, etc.)

## Structure cible

6ème onglet principal `parametres` dans `App.jsx`, visible uniquement pour `isGestionnaire`.  
Composant : `client/src/components/SettingsTab.jsx`

**Navigation latérale (sidebar 200 px fixe) — 3 onglets** (décision design finale) :

| id | Label | Icône SVG |
|----|-------|-----------|
| `identifiants` | Identifiants | Cadenas (slot 7.5×7, rect + path) |
| `gestionnaires` | Gestionnaires | 2 silhouettes (circle + path × 2) |
| `historique` | Historique | Horloge (circle + path aiguilles) |

> ⚠ La section "Nouveau compte" n'est PAS un onglet séparé — elle est intégrée dans l'onglet "Gestionnaires" via un bouton "+ Nouveau gestionnaire" qui ouvre un formulaire inline au-dessus du tableau.

## Contenu de chaque section

### Section Identifiants
Deux `.mcard` côte à côte (flex, gap 12px) :
- **Card "Code équipe"** : description courte, label "CODE D'ACCÈS" (uppercase 10px), `PasswordInput` (champ masqué + œil toggle SVG), bouton `.btn-primary` "ENREGISTRER"
- **Card "Mon mot de passe"** : description, 3 `PasswordInput` empilés (Mot de passe actuel / Nouveau — 6 car. min / Confirmer), validation inline sous le champ confirmé (`field-err`), bouton "MODIFIER"

### Section Gestionnaires
- Séparateur `.sec-s-row` : label "COMPTES GESTIONNAIRES" à gauche + bouton `.btn-secondary` "+ Nouveau gestionnaire" à droite
- **Formulaire "+ Nouveau gestionnaire"** (inline, s'ouvre/ferme en toggle) :
  - `.mcard.new-mgr-form` avec 3 champs en ligne (flex-wrap) : Nom complet / Email / Mot de passe initial
  - Validation inline par champ (`field-err`)
  - Bouton "Créer le compte" → toast "Compte créé — Nom" + fermeture auto 900 ms + ajout dans le tableau + entrée dans l'historique
- **Tableau `data-table`** (colonnes : Nom / Email / Créé le / Actions) :
  - Ligne normale : bouton `.btn-xs.bsec` "MODIFIER" + bouton `.btn-xs.bdanger` "SUPPRIMER"
  - Clic "MODIFIER" : la ligne suivante s'ouvre (`.tr-inline-edit`) avec `.inline-edit-bar` contenant 2 champs (Nom / Email) + boutons Annuler/Enregistrer → toast + entrée historique
  - Clic "SUPPRIMER" : bouton passe en `.bconfirm` "Confirmer ?" pendant 3 s puis auto-annulé (timer `setTimeout`), 2ème clic valide → suppression + toast + entrée historique
  - État vide : `<SvgEmptyUsers>` + "Aucun gestionnaire pour l'instant."

### Section Historique
- **Barre de filtres** (`.filter-bar`) : select Action (Toutes/CREATE/UPDATE/DELETE) + select Table (planning/praticien/absence/gestionnaire/poste/code_equipe) + inputs date "Du" / "Au" + bouton "Appliquer" + bouton "Effacer" (visible si filtre actif)
- **Tableau `data-table.hist-table`** avec `<colgroup>` (col widths : 145/138/82/165/auto) :
  - Colonnes : Date · Heure / Gestionnaire / Action / Objet / Détail
  - Badge action (`<ActionBadge>`) : CREATE=vert, UPDATE=bleu, DELETE=rouge (9px uppercase bold)
  - Lignes DELETE : classe `.tr-delete` → fond `--danger-bg`
  - Colonne Détail : `font-family:monospace font-size:11px`, tronquée (`text-overflow:ellipsis`)
  - Densité tableau : `tdPad` configurable (Dense=6px / Standard=10px / Espacé=14px)
- **Pagination** : 20 lignes/page, barre `.pagination-bar` (nb entrées + filtre actif + page X/Y + Précédent/Suivant)
- **État vide** : `<SvgEmptyLog>` + message selon filtre actif ou non

## Routes backend à créer

| Méthode | Route | Description |
|---------|-------|-------------|
| `PUT` | `/api/auth/change-password` | Vérifie l'ancien mdp via `bcrypt.compare`, hash le nouveau |
| `GET` | `/api/gestionnaires` | Liste `users` (id, email, nom, created_at) sans password_hash |
| `POST` | `/api/gestionnaires` | Crée un compte (email unique, bcrypt hash, logAudit) |
| `PUT` | `/api/gestionnaires/:id` | Modifie nom + email (interdit si `id === req.authUser.userId`) |
| `DELETE` | `/api/gestionnaires/:id` | Supprime (interdit si `id === req.authUser.userId`, logAudit) |
| `GET` | `/api/audit-log` | Pagine 20/page, filtres `?action=&table=&from=&to=&page=` |

> `GET/PUT /api/settings/team-code` déjà en place — à réutiliser dans la section Identifiants.

## CSS à ajouter dans styles.css

```css
/* ── SettingsTab layout ─────────────────────────── */
.settings-layout   { display:flex; min-height:calc(100vh - 130px); }
.settings-nav      { width:200px; flex-shrink:0; border-right:1px solid var(--border); padding:1rem 0; }
.settings-nav-item { display:flex; align-items:center; gap:8px; padding:9px 16px; font-size:13px;
                     color:var(--text2); cursor:pointer; border-left:3px solid transparent; transition:all .1s; background:none; border-top:none; border-right:none; border-bottom:none; }
.settings-nav-item:hover  { background:var(--surface2); color:var(--text); }
.settings-nav-item.active { color:var(--accent); background:var(--accent-light); border-left-color:var(--accent); font-weight:600; }
.settings-content  { flex:1; padding:1.25rem 1.5rem; overflow-y:auto; }

/* Champ password avec toggle œil */
.pwd-wrap  { position:relative; }
.pwd-wrap .form-input { padding-right:36px; width:100%; }
.pwd-eye   { position:absolute; right:10px; top:50%; transform:translateY(-50%);
             background:none; border:none; color:var(--text3); padding:0; cursor:pointer; display:flex; }
.pwd-eye:hover { color:var(--text2); }

/* Tables data */
.table-wrap  { border:1px solid var(--border); border-radius:var(--rl); overflow:hidden; }
.data-table  { width:100%; border-collapse:collapse; font-size:13px; }
.data-table thead tr { background:var(--surface2); }
.data-table th { padding:9px 10px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text2); text-align:left; border-bottom:1px solid var(--border); }
.data-table td { padding:12px 10px; border-bottom:1px solid var(--border); }
.data-table tbody tr:last-child td { border-bottom:none; }
.trow-hover:hover { background:var(--surface2); }
.tr-delete  { background:var(--danger-bg); }
.tr-editing { background:var(--accent-light); }
.tr-inline-edit td { background:var(--surface2); padding:12px 14px; }
.td-meta    { color:var(--text2); font-size:12px; }
.td-nowrap  { white-space:nowrap; }
.row-actions { display:flex; gap:6px; justify-content:flex-end; }

/* Boutons xs tableau */
.btn-xs   { font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
            padding:3px 9px; border-radius:5px; border:1px solid; cursor:pointer; white-space:nowrap; }
.bsec     { background:var(--surface); color:var(--text2); border-color:var(--border2); }
.bsec:hover, .bsec-active { background:var(--surface2); color:var(--text); }
.bdanger  { background:var(--danger-bg); color:var(--danger); border-color:var(--danger-bd); }
.bdanger:hover { background:#ffe0e4; }
.bconfirm { background:var(--danger); color:#fff; border-color:var(--danger); animation:pulse-btn .5s ease infinite alternate; }
@keyframes pulse-btn { from { opacity:.85; } to { opacity:1; } }

/* Inline edit bar */
.inline-edit-bar    { display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap; }
.inline-edit-fields { display:flex; gap:12px; flex:1; flex-wrap:wrap; }
.inline-edit-actions { display:flex; gap:8px; }

/* Formulaire nouveau gestionnaire */
.new-mgr-form .new-form-fields { display:flex; gap:12px; flex-wrap:wrap; }

/* Séparateur de section avec action */
.sec-s-row { display:flex; align-items:center; justify-content:space-between; gap:8px;
             font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text2);
             padding-bottom:4px; border-bottom:1px solid var(--border); margin:1.1rem 0 .5rem; }

/* Champ form générique */
.form-input  { width:100%; border:1px solid var(--border2); border-radius:var(--r); padding:7px 9px; font-size:13px; background:var(--surface); color:var(--text); }
.form-input:focus { outline:2px solid var(--accent-mid); border-color:var(--accent-mid); }
.input-err   { border-color:var(--danger); }
.field-label { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--text2); margin-bottom:3px; }
.field-err   { font-size:11px; color:var(--danger); margin-top:4px; }
.form-select { border:1px solid var(--border2); border-radius:var(--r); padding:6px 9px; font-size:12px; background:var(--surface); color:var(--text); }
.form-select:focus { outline:2px solid var(--accent-mid); }

/* Barre de filtres historique */
.filter-bar  { display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end; margin-bottom:1rem; padding:10px 12px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r); }
.flt-item    { display:flex; flex-direction:column; gap:3px; }

/* Pagination */
.pagination-bar { display:flex; justify-content:space-between; align-items:center; margin-top:.75rem; }
.pg-info        { font-size:12px; color:var(--text2); }

/* État vide */
.empty-state { display:flex; flex-direction:column; align-items:center; gap:12px; padding:3rem 0;
               color:var(--text3); font-size:13px; font-style:italic; }

/* Cards côte à côte (section Identifiants) */
.cards-row   { display:flex; gap:12px; flex-wrap:wrap; }
.mcard       { background:var(--surface); border:1px solid var(--border); border-radius:var(--rl);
               padding:16px; box-shadow:var(--sh); }
.card-title  { font-size:14px; font-weight:700; margin-bottom:4px; }
.card-desc   { font-size:12px; color:var(--text2); margin-bottom:14px; line-height:1.5; }
```

## Décisions UX (issues du design)

- **Confirmation suppression inline** : `setTimeout(3000)` — si non cliqué dans les 3 s, revient à l'état normal automatiquement. Animation `pulse-btn` sur le bouton "Confirmer ?"
- **Formulaire "Nouveau gestionnaire"** : après succès, fermeture auto à 900 ms, toast "Compte créé — Nom", ligne ajoutée dans le tableau, entrée dans l'historique
- **Édition inline** : la ligne `<tr class="tr-inline-edit">` s'insère juste en-dessous de la ligne concernée (pas de modale)
- **Historique — filtre actif** : le bouton "Effacer" n'apparaît que si un filtre est appliqué ; le label de pagination affiche "· filtre actif" en bleu
- **Sidebar** : barre verticale bleue 3px à gauche + fond `--accent-light` sur l'entrée active
- **Responsive ≤ 900 px** : sidebar → tabs horizontaux scrollables (`.settings-nav` passe en `flex-direction:row overflow-x:auto`)

## Décisions de sécurité

- Un gestionnaire ne peut pas supprimer ni modifier son propre `userId` (vérifié côté serveur)
- Pagination côté serveur pour `audit_log` (pas de chargement de toute la table)
- `bcrypt.compare` obligatoire avant tout changement de mot de passe

## Dépendances

- Sprint auth (terminé 2026-06-05) : table `users`, JWT, `requireGestionnaire` ✅
- `audit_log` déjà en base et alimenté ✅
- Design prototype validé 2026-06-06 ✅

## Découpage en features (sprint)

| Feature | Périmètre | Bloquant |
|---------|-----------|---------|
| **P31-F1** | Backend — 6 routes + Zod schemas | Oui |
| **P31-F2** | `SettingsTab` scaffold + nav 3 onglets + section Identifiants | F1 |
| **P31-F3** | Section Gestionnaires (tableau + édition inline + formulaire inline + suppression 3 s) | F1 |
| **P31-F4** | Section Historique (tableau + filtres + pagination + états vides) | F1 |
| **P31-F5** | Intégration App.jsx + suppression SettingsPanel de TeamTab + tests | F2–F4 |
