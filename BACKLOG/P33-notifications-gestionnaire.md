# P33 — Icône de notifications gestionnaire

**Effort :** S (CC: ~45 min) | **WSJF :** à définir | **Bloquant :** P32 (livré)

## Pourquoi

Après l'envoi d'une campagne congés, le gestionnaire n'est pas alerté quand un praticien soumet ses congés. Il doit ouvrir manuellement le suivi (P32) pour le savoir. Une icône de notification passive dans le header suffit à fermer ce gap sans changer le flux.

## Ce que ça fait

### Icône cloche dans le header (côté gestionnaire uniquement)

- Badge numérique rouge sur l'icône (ex. ❶) indiquant le nombre de réponses non vues
- Clic → dropdown/popover listant les événements récents :
  - "Dr Dupont a renseigné ses congés — il y a 2h"
  - "Dr Martin a renseigné ses congés — il y a 5 min"
- "Tout marquer comme lu" vide le badge
- Si 0 notifications non lues : cloche sans badge, liste vide

### Source de données

- Requête `GET /api/notifications` → liste des tokens `used_at IS NOT NULL` depuis la dernière consultation
- Un timestamp `last_seen_notifications` stocké en `localStorage` (côté client, pas en base) suffit pour déterminer le "non lu"
- Polling toutes les 60s (ou SSE si SSE disponible — à éviter en v1, pas de dépendance supplémentaire)

## Routes backend

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/notifications` | Retourne les tokens `used_at IS NOT NULL AND used_at > ?` (from = lastSeen) ordonnés par `used_at DESC` |

`requireGestionnaire`. Paramètre `?since=ISO_DATETIME`.

## Hors scope

- Notifications push (web push API)
- Notifications par email au gestionnaire
- Historique paginé de toutes les notifications (v1 : 20 dernières)

## Dépendances

- P32 livré (table `conge_tokens` avec `used_at`)
- `App.jsx` : icône dans le header (zone droite, avant le bouton déconnexion)
