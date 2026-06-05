# P30 — Recueil des souhaits praticiens (magic link V2)

**Effort :** L (CC: ~2h) | **WSJF :** 1.8 | **Bloquant :** après P28

## Pourquoi

Remplace le second formulaire Google Forms envoyé manuellement à 16 praticiens à chaque point mi-annuel. Permet à la team planning de visualiser les préférences en temps réel et d'équilibrer les trames en tenant compte des souhaits individuels.

## Ce que ça remplace

Formulaire Google envoyé par email avec questions du type :
- Services souhaités pour la période suivante
- Durées souhaitées par service
- Contraintes personnelles

## Fonctionnalités cibles

- La secrétaire envoie un magic link par praticien (réutilise l'infra CampaignModal + `/api/magic-link`)
- Le praticien accède à un formulaire dynamique (services variables selon son profil)
- Les réponses sont agrégées et visibles côté secrétaire dans l'app
- Vue agrégée : qui souhaite quoi pour la prochaine trame

## Dépendances

- Infrastructure magic link existante (CampaignModal, `/api/magic-link`) — base disponible
- P28 idéalement terminé avant (notion de "service habituel" partagée)
- Complexité backend : nouveau formulaire dynamique + table de collecte des réponses
