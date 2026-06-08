# P11 — Refonte onglet "Congés"

**Effort :** XL (CC: ~4-6h) | **WSJF :** 1.3 | **Statut :** Spec UX terminée 2026-06-07, Design validé 2026-06-07

## Pourquoi

L'onglet Absences actuel (calendrier mensuel + vue semestre + DateRangePicker custom) est fonctionnel mais sans utilité réelle dans le flux gestionnaire. Les gestionnaires travaillent encore sur Google Sheet. La campagne congés était enterrée dans TeamTab — un premier dashboard a été livré (P32, voir ci-dessous), mais il reste à centraliser tout le flux congés dans un onglet dédié.

## Design de référence

Prototype interactif React généré le 2026-06-07 :
`/tmp/conges-design/onglet-cong-s/project/conges.html`

Décisions de design clés issues du chat :
- Typographie : **DM Sans** (Google Fonts, remplace system-ui/Trebuchet)
- Pills : `borderRadius:6px` (rectangulaire, non arrondi — correction sur screenshot)
- Boutons Valider/Refuser/Modifier uniformisés via composant `Btn` unique
- Badge "en attente" : pill plein violet `#9333ea` dans le header des demandes ponctuelles
- "Modifier" campagne → modale `EditModal` avec état par absence (pending/ok/refused)
- "＋ Nouvelle campagne" → modale `NewCampModal` avec form complet

---

## Acquis P32 — déjà livré (2026-06-05)

### Schéma en base
- `conge_tokens.used_at` — token marqué utilisé à la soumission (au lieu de DELETE)
- `conge_tokens.campaign_id` — lien vers `conge_campaigns`
- `conge_tokens.source_token` + `absences.confirmed` — confirmation de chaque absence
- Table `conge_campaigns (id, created_at, created_by, types)`

### Routes implémentées
| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/conge/campaign/:id/status` | Statut de tous les tokens d'une campagne |
| `GET` | `/api/conge/campaign/latest` | Raccourci : campagne la plus récente |
| `PUT` | `/api/conge/token/:token/extend` | Prolonge `expires_at` de N heures |
| `POST` | `/api/conge/token/:token/resend` | Régénère token + renvoi email |
| `PATCH` | `/api/absences/:id/confirm` | Valide une absence soumise via magic link |

### UI livrée dans TeamTab / CampaignStatusModal
- Bouton "Valider tout" + bouton "Modifier" dans `CampaignStatusModal`
- Tableau de suivi par praticien (statut, timer live, actions Prolonger / Renvoyer)

---

## Bugs P32 à corriger (F0 — avant F3)

Identifiés par l'ultrareview 2026-06-07 :

1. **(Normal)** `edit-token` n'invalide pas l'ancien token → `Valider tout` silently no-op + duplicate rows
2. **(Normal)** 3 routes P32 ne logguent pas dans `audit_log`
3. **(Nit)** `handleEditToken` ne rafraîchit pas `campaign` state
4. **(Nit)** Bouton "Valider tout" visible quand `absences.length === 0`
5. **(Nit)** `confirmAbsence` exporté mais aucun call site (dead code)
6. **(Nit)** README non mis à jour avec les 3 nouvelles routes P32

---

## Décisions de spec (session 2026-06-07)

### Onglet renommé "Congés"
L'ancien AbsencesTab sera supprimé et remplacé entièrement.

### Mapping des types d'absence (constante `TC`)
```js
const TC = {
  CA:          { label:'Congé annuel (CA)',   color:'#2563eb', bg:'#eff6ff' },
  RTT:         { label:'RTT',                 color:'#4f46e5', bg:'#eef2ff' },
  Formation:   { label:'Formation',           color:'#059669', bg:'#ecfdf5' },
  'Hors site': { label:'Activité hors site',  color:'#d97706', bg:'#fffbeb' },
  Autre:       { label:'Autre',               color:'#6a6860', bg:'#f4f3ef' },
};
```

### Vue médecin (magic link / non authentifié)
- Sélecteur "Je suis :" en haut, dropdown searchable, **sans persistance**
- Contenu grisé (`opacity:.28, pointer-events:none`) tant qu'aucun praticien sélectionné
- Message sous le dropdown : "Sélectionnez votre nom pour voir vos congés."
- Section "Mes congés à venir" : lecture seule, cartes chronologiques
  - Chaque carte : barre colorée gauche 3px (couleur par type TC), date range en gras, type + nb jours ouvrés, badge statut (Confirmé vert / En attente amber)
  - Empty state : "Aucun congé à venir."
- Bouton "＋ Demander un congé" (visible seulement si praticien sélectionné)

### Modal "Nouvelle demande de congé" (vue médecin)
- `DateRangePicker` deux mois côte à côte, semaine commence lundi, weekends grisés
- Aujourd'hui : cercle border `--accent` (non rempli), endpoints : cercle `--accent` plein, plage : fond `--accent-light`
- Sélecteur type d'absence : boutons toggle per-type (couleur TC), pas de pills
- Note optionnelle (textarea, placeholder "Précision optionnelle…")
- Footer : "Annuler" (ghost) + "Envoyer la demande" (primary, **désactivé jusqu'à range valide**)
- Note : "Un mail sera envoyé aux gestionnaires."
- Après soumission : écran de confirmation (cercle vert ✓, "Demande envoyée", "Fermer")

### Vue gestionnaire

**Section A — Campagne congés** (card standard `--surface`)
- Header : titre + bouton "＋ Nouvelle campagne" (primary, h=30)
- Tableau : Praticien | Absences soumises | Validées | Statut | Actions
  - Pills absences : `borderRadius:6px`, hauteur 26px, couleur TC, `lbl = "{date} · {type}"`
  - Compteur "X/N" : X en gras vert quand X===N && N>0, /N en `--text3`
  - Badge statut centré : `en_attente`=amber / `a_repondu`=bleu / `tout_valide`=vert
  - "Valider tout" : variant ok, **désactivé si `s==='tout_valide'` ou `tot===0`**
  - "Modifier" : ghost → ouvre `EditModal`
- Empty state : "Aucune campagne en cours."

**Modal "Modifier" — `EditModal`**
- Titre : nom du praticien + "Campagne congés — détail des absences"
- Liste des absences avec état par absence : `pending` (amber) / `ok` (vert) / `refused` (rouge)
- Boutons : **Valider** / **Refuser** / **Remettre** selon état courant
- Note interne optionnelle (textarea)
- Footer : compteur "X/N absences validées" + Annuler + Enregistrer
- Enregistrer → met à jour la ligne du tableau (v, tot, statut global recalculé)

**Modal "Nouvelle campagne" — `NewCampModal`**
- Champs : Nom de la campagne (input, pré-rempli "Campagne été 2026")
- Période couverte : date début → date fin
- Date limite de réponse
- Praticiens inclus : checkboxes avec highlight `--accent-light` si coché
- "Lancer la campagne" désactivé si champs vides ou aucun praticien
- → envoie mail + success state : "Campagne créée / Les praticiens ont été notifiés par mail."

**Section B — Demandes ponctuelles** (fond `#faf5ff`, `border-left:3px solid #9333ea`, `border:1px solid #e9d5ff` autres côtés)
- Header : "DEMANDES PONCTUELLES" (uppercase 10px, color `#9333ea`) + badge `{N} en attente` (pill plein `#9333ea`)
- Chaque ligne : dot 8–10px `#9333ea` gauche → dot vert si validée
  - Nom en gras + type (--text2) + date range + durée + "reçue il y a Xh"
  - Actions : Btn `ok` "Valider" + Btn `danger` "Refuser" + Btn `ghost` "Modifier"
  - Hover : fond `#f3eeff` (uniquement si non validée)
- **Valider** → row passe à `done:true`, dot devient vert, ✓ + texte atténué, actions disparaissent
- **Refuser** → row supprimée de la liste
- Ligne validée : ✓ vert + texte complet en `--text3`, hauteur réduite (`padding:9px`)
- Empty state : "Aucune demande ponctuelle."

### Ce qui disparaît
- Boutons "Campagne" et "Suivi" de TeamTab + `CampaignStatusModal`
- L'actuel AbsencesTab.jsx (supprimé entièrement)
- Export CSV/PDF : hors scope

---

## Découpage en features

### F0 — Correction bugs P32 (prérequis F3)
- Invalider l'ancien token lors d'un `edit-token`
- Ajouter `logAudit` dans les 3 routes manquantes
- Rafraîchir `campaign` state dans `handleEditToken`
- Masquer "Valider tout" si `absences.length === 0`
- Supprimer `confirmAbsence` dead code
- Mettre à jour README avec les 3 routes P32

### F1 — Sélecteur identité + "Mes congés" (médecin)
- Dropdown "Je suis :" searchable, sans persistance
- Grisage `opacity:.28 + pointer-events:none` si non sélectionné
- Liste congés `GET /api/absences?medecin_id=X&futur=1` (à créer ou adapter)
- `CCard` : barre 3px colorée, date range, type TC, badge Confirmé/En attente
- Empty state

### F2 — Demande de congé sporadique (médecin)
- Bouton "＋ Demander un congé" → `CongeModal`
- `DateRangePicker` deux mois (composant autonome, semaine lundi-first)
- Type selector (5 types TC)
- Note optionnelle
- `POST /api/conge-requests` → nouvelle table `conge_requests` → mail aux gestionnaires
- Success state

### F3 — Migration campagne congés (gestionnaire)
- `NewCampModal` : formulaire Nom / Période / Deadline / Praticiens → `POST /api/conge/campaigns` (réutilise infra P32)
- Tableau campagne `GestView` : réutilise `GET /api/conge/campaign/latest`
- `EditModal` : détail par absence, Valider/Refuser/Remettre → `PATCH /api/absences/:id/confirm`
- "Valider tout" → boucle `PATCH /api/absences/:id/confirm`
- Retirer boutons "Campagne" et "Suivi" de TeamTab + supprimer `CampaignStatusModal`

### F4 — Section demandes ponctuelles (gestionnaire)
- `GET /api/conge-requests?statut=pending` → affichage `DemRow`
- Valider → `PATCH /api/conge-requests/:id/accept` + mail praticien + `absences` INSERT
- Refuser → `PATCH /api/conge-requests/:id/refuse` + mail praticien
- Modifier → réutilise `EditModal` ou formulaire inline

### F5 — Nettoyage
- Supprimer `AbsencesTab.jsx` + `CampaignStatusModal`
- Mise à jour `App.jsx` : renommer onglet "Absences" → "Congés"
- README + audit_log cohérents

---

## Ordre recommandé
F1 → F2 → F0 → F3 → F4 → F5

---

## Nouveaux atomes CSS à ajouter (extraits du design)

```css
/* ── CongesTab ──────────────────────────────────────────────── */
/* Carte absence (vue médecin) */
.cg-card        { display:flex; background:var(--surface); border:1px solid var(--border); border-radius:var(--r); overflow:hidden; box-shadow:var(--sh); transition:background .1s; }
.cg-card:hover  { background:#fafaf9; }
.cg-card-bar    { width:3px; flex-shrink:0; }
.cg-card-body   { flex:1; padding:9px 12px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
.cg-card-date   { font-size:13px; font-weight:600; line-height:1.2; }
.cg-card-meta   { font-size:11px; color:var(--text2); margin-top:3px; }

/* Pills absences (tableau campagne) */
.ab-pill        { display:flex; align-items:center; height:26px; padding:0 10px; border-radius:6px; font-size:12px; font-weight:500; white-space:nowrap; line-height:1; }

/* Section demandes ponctuelles */
.dem-section    { background:#faf5ff; border-top:1px solid #e9d5ff; border-right:1px solid #e9d5ff; border-bottom:1px solid #e9d5ff; border-left:3px solid #9333ea; border-radius:var(--rl); box-shadow:var(--sh); overflow:hidden; }
.dem-header     { padding:11px 16px; display:flex; align-items:center; justify-content:space-between; }
.dem-title      { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#9333ea; }
.dem-badge      { display:inline-flex; align-items:center; height:22px; padding:0 10px; border-radius:100px; background:#9333ea; color:#fff; font-size:11px; font-weight:700; line-height:1; }
.dem-row        { border-top:1px solid #ede9fe; padding:12px 16px; display:flex; align-items:flex-start; gap:12px; transition:background .1s; }
.dem-row:hover:not(.dem-row--done) { background:#f3eeff; }
.dem-row--done  { padding:9px 16px; align-items:center; }
.dem-dot        { width:10px; height:10px; border-radius:50%; flex-shrink:0; margin-top:4px; }

/* DateRangePicker */
.drp-wrap       { width:425px; }
.drp-nav        { display:flex; justify-content:space-between; margin-bottom:8px; }
.drp-nav-btn    { background:var(--surface2); border:1px solid var(--border); border-radius:var(--r); width:24px; height:24px; cursor:pointer; font-size:14px; color:var(--text2); display:inline-flex; align-items:center; justify-content:center; line-height:1; }
.drp-months     { display:flex; gap:8px; justify-content:center; }
.drp-divider    { width:1px; background:var(--border); flex-shrink:0; margin:0 8px; }
.drp-month-hd   { text-align:center; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--text2); margin-bottom:6px; }
.drp-grid       { display:grid; grid-template-columns:repeat(7,28px); }
.drp-dj         { text-align:center; font-size:9px; font-weight:700; padding:2px 0; }
.drp-cell       { height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; }
.drp-day        { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; font-size:11px; box-sizing:border-box; }
```

---

## Nouvelles routes backend à créer (F1, F2, F4)

| Méthode | Route | Description | Feature |
|---|---|---|---|
| `GET` | `/api/absences?medecin_id=X&futur=1` | Congés à venir d'un praticien (filtré par date) | F1 |
| `POST` | `/api/conge-requests` | Nouvelle demande ponctuelle médecin → mail gestionnaires | F2 |
| `GET` | `/api/conge-requests` | Liste demandes (filtre `statut`) | F4 |
| `PATCH` | `/api/conge-requests/:id/accept` | Valider → INSERT absences + mail | F4 |
| `PATCH` | `/api/conge-requests/:id/refuse` | Refuser → mail | F4 |

Routes P32 réutilisées en F3 : `GET /api/conge/campaign/latest`, `PATCH /api/absences/:id/confirm`

Nouvelle table `conge_requests` à créer (F2) :
```sql
CREATE TABLE IF NOT EXISTS conge_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  medecin_id  INTEGER NOT NULL,
  date_debut  TEXT NOT NULL,
  date_fin    TEXT NOT NULL,
  type        TEXT NOT NULL,
  note        TEXT,
  statut      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL,
  FOREIGN KEY (medecin_id) REFERENCES medecins(id)
);
```

---

## Mockup
`/tmp/conges-design/onglet-cong-s/project/conges.html`

---

## Dépendances
- Schéma P32 déjà en base ✅
- Routes P32 déjà implémentées ✅ (réutilisées en F3)
- Bugs P32 (F0) à corriger avant F3
- Nouvelle table `conge_requests` en DB (F2)
- Route mail nouvelles demandes (F2)
- DM Sans déjà utilisé dans l'app ✅
