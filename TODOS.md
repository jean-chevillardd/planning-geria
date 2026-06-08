# Backlog — Planning Gériatrie

> Livraisons passées → [DONE.md](DONE.md) | Specs détaillées → [BACKLOG/](BACKLOG/)

---

## ✅ Polish UX (2026-06-07)

| # | Tâche | Statut |
|---|---|---|
| UX1 | CampaignModal : médecins d'astreinte exclus de la ligne "Externes" | ✅ |
| UX2 | TeamTab : email non bloquant à l'ajout/modif d'un médecin d'astreinte (fix Zod `""` → `null`) | ✅ |
| UX3 | `.btn-primary` : `justify-content:center` — texte centré sur bouton pleine largeur | ✅ |
| UX4 | Escape ferme toutes les popups (CampaignStatusModal, CampaignModal, BarPopover, SidePanel Stats) | ✅ |
| UX5 | AstreintesTab : chips praticiens alignés sur look Planning/semaine + suppression pdots | ✅ |

---

## 🔥 Sprint en cours — Qualité & UX (2026-06-05)

| # | Tâche | Statut |
|---|---|---|
| DT7 | Validation entrée serveur (Zod) — `server/validation.js` + intégration toutes routes | ✅ |
| P17 | Homogénéiser sélecteurs de dates — `MonthPicker.jsx` partagé, labels cliquables Astreintes | ✅ |
| DT8 | Jours fériés : ponts décalés — `getFrenchBridgeDays`, affichage dans PlanningGrid | ✅ |
| P3  | Export PDF planning semaine — fenêtre dédiée, distinct de `@media print` | ✅ |

---

## ✅ Sprint précédent — Auth deux rôles (2026-06-05)

| # | Tâche | Statut |
|---|---|---|
| AUTH-1 | DB migrations (`users` + `settings`) | ✅ |
| AUTH-2 | Routes `/api/auth/team` + `/api/auth/gestionnaire` | ✅ |
| AUTH-3 | Middlewares `requireAuth` / `requireGestionnaire` | ✅ |
| AUTH-4 | `LoginPage.jsx` (design fidèle Claude Design) | ✅ |
| AUTH-5 | Refacto `App.jsx` — `isGestionnaire`, suppression `LockButton` | ✅ |
| AUTH-6 | Visibilité conditionnelle onglets et boutons écriture | ✅ |
| AUTH-7 | Panneau settings code équipe dans TeamTab | ✅ |
| AUTH-8 | Tests serveur mis à jour (nouveau header, nouveaux rôles) | ✅ |

---

## 🔒 Bloqués — ne pas commencer

| # | Titre | Bloquant | WSJF |
|---|---|---|---|
| P28 | "Semaines d'instabilité" : définition métier + tracking StatsTab | Réunion 9 juin | 5.3 |
| P26 | ~~StatsTab filtre période personnalisée~~ | ✅ Livré | — |
| P30 | Recueil souhaits praticiens (magic link V2) | [Spec](BACKLOG/P30-recueil-souhaits-praticiens.md) + après P28 | 1.8 |
| P11 | Refonte onglet Absences → Congés | F1 ✅ livré — F2 en cours | 1.3 |

---

## 📋 Prêt à implémenter

| # | Titre | Effort | Spec |
|---|---|---|---|
| ~~P32~~ | ~~Suivi de campagne congés — dashboard gestionnaire~~ | ✅ Livré 2026-06-06 | [Spec](BACKLOG/P32-suivi-campagne-conges.md) |
| P33 | Icône de notification gestionnaire (type cloche) — liste "Dr X a renseigné ses congés", badge compteur non lu | S | [Spec](BACKLOG/P33-notifications-gestionnaire.md) |

---

## ❄️ Backburner — faible priorité, différé

| # | Titre | Effort | WSJF | Note |
|---|---|---|---|---|
| ~~DT4~~ | ~~Multi-comptes secrétariat~~ | — | — | ✅ Résolu — sprint auth 2026-06-05 |
| ~~P9~~  | ~~MonthView : Mode Rotation + D&D + click-to-assign~~ | — | — | ✅ Livré 2026-06-03 |
| DT9 | CSS modularisé | L | 0.7 | Cosmétique |

---

## Notes métier

**P28** — Hypothèse de définition : semaine où un PH est affecté à un service différent de son service habituel (défini dans `sched` TeamTab). Clarification obligatoire le 9 juin avant toute implémentation.
