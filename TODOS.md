# Backlog — Planning Gériatrie

> Livraisons passées → [DONE.md](DONE.md) | Specs détaillées → [BACKLOG/](BACKLOG/)

---

## 🔥 Sprint en cours

| # | Titre | Effort | WSJF |
|---|---|---|---|
| DT2 | JWT_SECRET sur Railway (variable d'environnement persistante) | XS | 16.0 |

---

## 🟡 Prêts — débloqués, à prendre après le sprint en cours

| # | Titre | Effort | WSJF |
|---|---|---|---|
| DT7 | Validation entrée serveur (Zod ou équivalent) | M | 3.7 |
| P17 | Homogénéiser sélecteurs de dates (Astreintes + autres onglets) | S–M | 3.5 |
| DT8 | Jours fériés : ponts décalés | S–M | 2.5 |
| P3 | Export PDF planning semaine (dédié, distinct de @media print) | M | 2.0 |

---

## 🔒 Bloqués — ne pas commencer

| # | Titre | Bloquant | WSJF |
|---|---|---|---|
| P28 | "Semaines d'instabilité" : définition métier + tracking StatsTab | Réunion 9 juin | 5.3 |
| P9 | MonthView : Mode Rotation + D&D + click-to-assign | [Spec](BACKLOG/P9-monthview-rotation.md) à valider | 1.9 |
| P30 | Recueil souhaits praticiens (magic link V2) | [Spec](BACKLOG/P30-recueil-souhaits-praticiens.md) + après P28 | 1.8 |
| P11 | Refonte onglet Absences | [Session spec UX](BACKLOG/P11-refonte-absences.md) | 1.3 |

---

## ❄️ Backburner — faible priorité, différé

| # | Titre | Effort | WSJF | Note |
|---|---|---|---|---|
| DT4 | Multi-comptes secrétariat | L | 0.9 | Faible priorité si équipe reste petite |
| DT9 | CSS modularisé | L | 0.7 | Cosmétique |

---

## Notes métier

**P28** — Hypothèse de définition : semaine où un PH est affecté à un service différent de son service habituel (défini dans `sched` TeamTab). Clarification obligatoire le 9 juin avant toute implémentation.

**DT2** — `JWT_SECRET` lu depuis `process.env.JWT_SECRET` avec fallback aléatoire (ligne 67 `server/index.js`). Configurer la variable dans le dashboard Railway pour éviter les déconnexions à chaque redéploiement.
