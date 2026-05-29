# Guidelines du projet — Planning Gériatrie

## Contraintes environnement

### computer-use : ne pas utiliser
La version de macOS installée est trop ancienne pour `ScreenCaptureKit` (requiert macOS 14.0+).  
**Ne jamais appeler `mcp__computer-use__request_access` ni aucun outil `mcp__computer-use__*`.**

Pour vérifier le rendu de l'interface, utiliser à la place :
- `mcp__Claude_Preview__preview_screenshot` (serveur de preview Vite)
- `mcp__Claude_Preview__preview_eval` pour interagir avec la page
- `npx vite build` pour valider la syntaxe sans erreur

## gstack

For all web browsing, use the `/browse` skill from gstack. **Never use `mcp__claude-in-chrome__*` tools.**

Available gstack skills:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

## Mémoire — mise à jour en fin de session

**À la fin de chaque session de travail**, mettre à jour les fichiers mémoire pertinents dans `.claude/projects/.../memory/` pour refléter :
- les nouvelles décisions d'architecture ou de design
- les bugs importants découverts et résolus
- les nouvelles routes API ou composants ajoutés
- tout changement de règle métier ou de schéma

Utiliser le skill `/anthropic-skills:consolidate-memory` si disponible, sinon mettre à jour manuellement les fichiers concernés et l'index `MEMORY.md`.
