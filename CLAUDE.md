# Guidelines du projet — Planning Gériatrie

## Contraintes environnement

### computer-use : ne pas utiliser
La version de macOS installée est trop ancienne pour `ScreenCaptureKit` (requiert macOS 14.0+).  
**Ne jamais appeler `mcp__computer-use__request_access` ni aucun outil `mcp__computer-use__*`.**

Pour vérifier le rendu de l'interface, utiliser à la place :
- `mcp__Claude_Preview__preview_screenshot` (serveur de preview Vite)
- `mcp__Claude_Preview__preview_eval` pour interagir avec la page
- `npx vite build` pour valider la syntaxe sans erreur

## Langue de travail

**Toujours répondre et travailler en français**, même si le prompt est rédigé en anglais. Cela s'applique aux réponses, aux commentaires de code, aux messages de commit, et à toute communication avec l'utilisateur.

## gstack

Pour toute navigation web, utiliser le skill `/browse` de gstack. **Ne jamais utiliser les outils `mcp__claude-in-chrome__*`.**

Skills gstack disponibles :
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

## README.md — maintien à jour

**Mettre à jour `README.md` dès qu'une modification significative a lieu**, notamment :
- ajout ou suppression d'un composant ou d'un onglet
- nouvelle route API ou modification d'une route existante
- changement de stack ou de dépendance majeure
- nouvelle section fonctionnelle (auth, self-service, astreintes, etc.)
- changement de commande de lancement ou de déploiement

Le commit du README doit accompagner (ou suivre immédiatement) le commit de la fonctionnalité concernée.

## Formation Product Management

Quand le prompt tourne autour de la **formation au poste de Product Manager** (vision produit, NSM, AARRR, frameworks PM, exercices pédagogiques, etc.) :

- **Ne jamais rédiger la réponse à la place de l'utilisateur.** Jouer le rôle d'un coach ou d'un CPO qui pose des questions, une à la fois, pour que l'utilisateur construise lui-même sa réflexion.
- **Une question à la fois.** Attendre la réponse avant de poser la suivante.
- **Challenger les réponses** plutôt que les valider immédiatement — demander "sur quelle base ?", "comment tu mesures ça ?", "et si ça ne marche pas ?".
- **Ne pas faire de synthèse anticipée.** Laisser l'utilisateur arriver lui-même aux conclusions. Ne synthétiser que quand il a répondu à toutes les questions clés.
- **Sauvegarder l'exercice** dans `formation-produit/` à la fin de la session, avec les apprentissages clés.
- Ce dossier est dans `.gitignore` — c'est du contenu personnel, pas du code produit.

## Mémoire — mise à jour en fin de session

**À la fin de chaque session de travail**, mettre à jour les fichiers mémoire pertinents dans `.claude/projects/.../memory/` pour refléter :
- les nouvelles décisions d'architecture ou de design
- les bugs importants découverts et résolus
- les nouvelles routes API ou composants ajoutés
- tout changement de règle métier ou de schéma

Utiliser le skill `/anthropic-skills:consolidate-memory` si disponible, sinon mettre à jour manuellement les fichiers concernés et l'index `MEMORY.md`.
