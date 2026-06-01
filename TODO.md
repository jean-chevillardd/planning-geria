# TODO — Planning Gériatrie

## Règles métier à modéliser (source : email Lucie, 2026-06-01)

### Activités & effectifs médecins

- [ ] Modéliser la distinction **activités obligatoires** vs **activités dispensables** dans la BDD ou la config
  - Obligatoires : CSG 1, CSG 2, SSR, EOPS, HdJNP, HDJ, UCC, EHPAD
  - Dispensables : Consultations, HDJ oncoger, EMG, Ortho (ponctuel été), Temps hors clinique

- [ ] Ajouter les **effectifs minimum requis par activité** :
  | Activité | PH min | Notes |
  |----------|--------|-------|
  | CSG 1 | 2 | Continuité 1,5–2 mois d'affilée |
  | CSG 2 | 2 | |
  | SSR | 3 (2 ponctuel OK) | Jamais 2 jours de suite avec seulement 2, dans le même service |
  | EOPS | 1 | Back-up possible : SSR, HDJ, EHPAD (très ponctuel) |
  | HdJNP | 1 | Fermeture périodes lacunaires (grandes vacances, ponts) — valider avec cadre IDE |
  | HDJ | 1 | Fermé le **mercredi systématiquement** |
  | UCC | 1 | Peut être absent le mercredi |
  | EHPAD | 60 % (≈3j/5) | Romain en priorité ; back-up vendredi obligatoire (Romain à Montaigu ce jour-là) |

- [ ] Implémenter la **logique d'ordre de tirage** :
  1. CSG 1 & CSG 2 (continuité des soins prioritaire)
  2. SSR (continuité 3 mois)
  3. Autres obligatoires (EOPS, HdJNP, HDJ, UCC, EHPAD)
  4. Dispensables si effectif médecins > 12 (ou > 11 les mercredis, HDJ fermé)

- [ ] Gérer la **fermeture automatique du HDJ le mercredi** (déjà dans le planning ?)

- [ ] Gérer la **fermeture de HdJNP** sur les périodes lacunaires (grandes vacances, ponts) — nécessite validation manuelle avec cadre IDE (pas automatisable directement)

- [ ] Modéliser le **back-up EHPAD** :
  - Priorité : Romain
  - Back-up systématique le vendredi
  - Sinon : intérim, ou EOPS en dernier recours

- [ ] Ajouter un **indicateur de seuil d'ouverture des activités dispensables** visible dans l'interface (ex. : compteur d'effectif du jour vs seuil 12/11)

### Contraintes de continuité

- [ ] Contrainte **CSG** : même PH affecté 1,5 à 2 mois consécutifs
- [ ] Contrainte **SSR** : même PH affecté 3 mois consécutifs ; si seulement 2 PH, pas deux jours de suite dans le même service SSR
- [ ] Vérifier si ces contraintes de continuité sont déjà gérées ou à implémenter dans le moteur de suggestion/tirage

### Internes

- [ ] Modéliser les **affectations internes par défaut** :
  - 2 au CSG 1 (3 si Docteur Junior présent)
  - 1 au CSG 2
  - 1 en HdJNP
  - Reste : SSR / UCC / EOPS / CS selon projet professionnel de l'interne

- [ ] Gérer la présence d'un **Docteur Junior (DJ)** comme variable qui augmente le quota CSG 1 de 2 → 3

- [ ] Décider si les affectations internes sont configurables par interne (très variables selon projet pro) — probablement manuel

### UX / Interface

- [ ] Afficher le **statut d'ouverture** de chaque activité (ouverte / fermée / dispensable non ouverte) sur la vue journalière ou hebdomadaire
- [ ] Ajouter un **avertissement** si une activité obligatoire n'est pas couverte avant validation du planning
- [ ] Permettre de marquer HdJNP comme **fermée ponctuellement** (avec confirmation de la cadre IDE)

---

## Backlog existant

_(à compléter au fil des sessions)_
