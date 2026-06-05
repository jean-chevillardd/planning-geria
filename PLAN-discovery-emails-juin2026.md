<!-- /autoplan restore point: /Users/jeanchevillard/.gstack/projects/jean-chevillardd-planning-geria/main-autoplan-restore-20260605-113004.md -->
# Plan — Discovery terrain : emails juin 2026

## Contexte & source

**Signal terrain :** deux emails reçus les 2 et 5 juin 2026 depuis la "team planning" du service de gériatrie (CHD Vendée / GHT85).

**Email 1 (2 juin 12h29, expéditeur : planning.geriatrie@chd-vendee.fr) — "Planning IMPORTANT :)"**
La team planning envoie à l'ensemble des praticiens (16 destinataires) un point mi-annuel avec deux Google Forms à remplir avant le 8 juin soir (réunion de service le 9 juin) :

1. **Formulaire 1** — Décompte des activités passées (jan–sep 2026) : dans quelles activités/services chaque praticien est passé, + jours de semaines d'instabilité + congés de formation.
2. **Formulaire 2** — Souhaits d'activités pour la suite (avec durées correspondantes).

Règles de congés rappelées :
- Semaines de CA : **aucun changement possible à moins de 3 mois** (sauf annulation).
- Jours ponctuels : la personne trouve elle-même la solution, informe la team seulement quand c'est réglé.

**Email 2 (2 juin 14h34, DELORME Laetitia)** — correction : le formulaire 1 couvre jan à fin sept 2026 (pas seulement le S1), l'ortho est dans le formulaire car il était actif en début d'année.

**Email 3 (5 juin 7h18, MORISSON-DE LA BASSETIÈRE Anne)** — transfert à Jean Chevillard avec le commentaire : *"On a eu ça à remplir !! Ah ah ah ah. Et dire qu'avec ton site, ça sera calculé automatiquement !!!"*

---

## Analyse PM — ce que l'app couvre vs ce que les emails révèlent

### Ce que l'app couvre déjà

| Besoin terrain | Couverture actuelle |
|---|---|
| Planning par semaine + par service | ✅ PlanningGrid, MonthView |
| Gestion des absences / congés | ✅ AbsencesTab — 7 types : CA, Maladie, Maternité, RTT, Récupération de garde, Formation, Activité hors site |
| Self-service congés (magic link) | ✅ CampaignModal — token expirant empêche les modifs tardives |
| Décompte activités par praticien | ✅ StatsTab — vue Cards + vue Matrix (heatmap) |
| Vue mensuelle par poste | ✅ MonthView |
| Règles de couverture minimale par service | ✅ P2 (alertes couverture) |
| Règle "pas de modif CA < 3 mois" | ✅ Couvert de fait par l'expiration du token magic link |

### Gaps identifiés et arbitrages

| # | Gap | Verdict | Feature |
|---|---|---|---|
| G1 | Décompte activités : filtre période (jan–sep) manquant dans StatsTab | **À implémenter** | → P26 |
| G2 | Type de congé "Formation" absent | **Fermé** — déjà présent dans le menu |
| G3 | "Semaines d'instabilité" : concept non défini ni tracké | **Différé** — clarifier le 9 juin | → P28 |
| G4 | Recueil des souhaits praticiens (formulaire 2) absent | **Différé** — V2 après adoption | → P30 |
| G5 | Règle "pas de modif CA < 3 mois" non encodée | **Fermé** — token magic link expirant |

---

## Fonctionnalités issues de la discovery

### P26 — StatsTab : filtre de période personnalisée ✦ À FAIRE

**Priorité :** P1 (seule feature immédiatement actionnable)
**Effort :** S–M (~40 min CC)

**What :** Deux sélecteurs de mois (début → fin) en haut de StatsTab. Les calculs de décompte (heatmap, total jours, répartition par service) sont recalculés sur la plage choisie. Valeur par défaut : mois courant (comportement actuel préservé).

**Why :** La team planning doit faire un point mi-annuel (jan–sep) par praticien. StatsTab a toutes les données mais ne permet de filtrer que par mois individuel. Ce sélecteur remplace intégralement le Google Form 1.

**Dépend de :** MonthPickerPopover déjà implémenté (réutilisable depuis MonthView et AbsencesTab).

---

### P28 — "Semaines d'instabilité" : définition + tracking ✦ DIFFÉRÉ

**Priorité :** P2 — après clarification métier
**Effort :** S–M (~30–45 min CC)

**What :** Une fois la définition arrêtée avec la team planning (hypothèse : semaine où un PH est en dehors de ses services habituels), calculer et afficher ce compteur dans StatsTab et dans P26.

**Blocker :** Définition métier à valider lors de la réunion du 9 juin 2026.

---

### P30 — Recueil des souhaits praticiens (magic link) ✦ DIFFÉRÉ V2

**Priorité :** P3
**Effort :** L (~2h CC)

**What :** Formulaire self-service envoyé via magic link à chaque praticien pour recueillir ses souhaits d'activités pour la période suivante. Agrégat visible côté secrétaire.

**Why :** Remplace le Google Form 2. Différé : valider d'abord l'adoption de P26 avant d'investir dans ce module plus complexe.

---

## Scope fermé (gaps déjà couverts)

- **Type "Formation"** : présent dans le menu AbsencesTab (7 types confirmés le 5 juin 2026).
- **Règle délai CA** : couverte par l'expiration du token magic link — les praticiens ne peuvent pas modifier leur demande après expiration.

## Scope non retenu

- Calcul automatique des trames futures (décision humaine)
- Intégration outils RH institutionnels (hors périmètre)
- Notifications push (la team planning gère par email)

---

## Ce qui existe déjà (leverage map)

| Besoin | Code existant |
|---|---|
| Données affectations | `GET /api/affectations` + table `affectations` en sql.js |
| Données absences | `GET /api/absences` + table `absences` |
| Types de congés | AbsencesTab.jsx — 7 types |
| Styles impression | `@media print` dans `styles.css` |
| Magic link self-service | `CampaignModal`, route `/api/magic-link` |
| StatsTab (heatmap + cards) | `StatsTab.jsx` — extension directe |
| MonthPickerPopover | Composant réutilisable (MonthView, AbsencesTab) |

---

## Ordre d'implémentation

1. **P26** (S–M) — filtre période dans StatsTab : valeur immédiate, dépendances nulles
2. **P28** (S–M) — semaines d'instabilité : après clarification du 9 juin
3. **P30** (L) — recueil souhaits : V2, après adoption

---

## Dream state

**Maintenant :** La team planning envoie 2 Google Forms à 16 praticiens, collecte manuellement, construit un tableur avant chaque réunion.

**Après P26 :** Ouvrir StatsTab, sélectionner jan–sep, le décompte par praticien × service est généré instantanément. La réunion du 9 juin peut s'appuyer sur l'app directement.

**Vision 12 mois (P28 + P30) :** Semaines d'instabilité calculées automatiquement, praticiens expriment leurs souhaits via magic link, la team planning construit les rotations depuis l'app.
