# P32 — Suivi de campagne congés (dashboard gestionnaire)

**Effort :** M (CC: ~1h30) | **WSJF :** à définir | **Bloquant :** —

## Pourquoi

Aujourd'hui, après l'envoi d'une campagne magic link, le gestionnaire n'a aucune visibilité sur qui a répondu et qui ne l'a pas encore fait. Il doit relancer manuellement sans savoir si c'est utile. Les tokens expirent à 72h sans possibilité d'extension si les praticiens tardent.

## Ce que ça fait

### 1. Dashboard "Suivi de campagne" dans AbsencesTab (ou TeamTab)

Vue récapitulative de la dernière campagne envoyée :

| Praticien | Statut | Temps restant | Actions |
|---|---|---|---|
| Dr Dupont | ✅ A répondu | — | Modifier · Valider |
| Dr Martin | ⏳ En attente | 14h 32min | Prolonger |
| Dr Bernard | ⏳ En attente | 2h 08min | Prolonger |
| Dr Leclerc | ❌ Expiré | — | Renvoyer |

- **✅ A répondu** : token utilisé, absences soumises — boutons `Modifier` / `Valider`, pas de suppression
- **⏳ En attente** : token encore actif — timer live `expires_at - now`, bouton `Prolonger`
- **❌ Expiré** : token expiré sans réponse — bouton `Renvoyer` (génère un nouveau token + renvoi email)

### 2. Prolongation de token

`PUT /api/conge/token/:token/extend` — ajoute N heures à `expires_at` (défaut : +48h, configurable dans l'UI).  
Protégé par `requireGestionnaire`.

### 3. Modification des absences soumises

Pour un praticien ayant répondu, bouton `Modifier` → ouvre la vue `CongePublicPage` du praticien (ou inline) pour corriger/compléter avant validation définitive.  
Bouton `Valider` → marque les absences comme confirmées (flag `confirmed` sur les absences soumises via magic link).

## Évolutions de schéma nécessaires

### Table `conge_tokens` — nouvelles colonnes

```sql
ALTER TABLE conge_tokens ADD COLUMN used_at TEXT DEFAULT NULL;
ALTER TABLE conge_tokens ADD COLUMN campaign_id INTEGER DEFAULT NULL;
```

Au lieu de `DELETE` à la soumission → `UPDATE conge_tokens SET used_at=? WHERE token=?`.

### Nouvelle table `conge_campaigns`

```sql
CREATE TABLE IF NOT EXISTS conge_campaigns (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  created_by INTEGER NOT NULL,  -- users.id du gestionnaire
  types      TEXT NOT NULL      -- JSON ["PH","PADHUE"…]
);
```

Permet de grouper les tokens d'une même campagne et d'afficher l'historique.

## Routes backend

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/conge/campaign/:id/status` | Statut de tous les tokens d'une campagne |
| `GET` | `/api/conge/campaign/latest` | Raccourci : campagne la plus récente |
| `PUT` | `/api/conge/token/:token/extend` | Prolonge `expires_at` de N heures |
| `POST` | `/api/conge/token/:token/resend` | Régénère token + renvoi email |
| `PATCH` | `/api/absences/:id/confirm` | Valide une absence soumise via magic link |

Toutes protégées par `requireGestionnaire` sauf les routes publiques `/api/conge/token/:token` existantes.

## Hors scope

- Historique multi-campagnes (v1 : campagne la plus récente uniquement)
- Modification inline dans l'app gestionnaire (v1 : ouvre la page publique du praticien)
- Notifications push / relance automatique

## Dépendances

- Infrastructure magic link existante (`conge_tokens`, `CampaignModal`, `CongePublicPage`) — base disponible
- Migration `used_at` + `campaign_id` + table `conge_campaigns` nécessaire
- Nodemailer déjà configuré pour le renvoi email
