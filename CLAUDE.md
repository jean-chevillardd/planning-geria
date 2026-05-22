# Guidelines du projet — Planning Gériatrie

## Contraintes environnement

### computer-use : ne pas utiliser
La version de macOS installée est trop ancienne pour `ScreenCaptureKit` (requiert macOS 14.0+).  
**Ne jamais appeler `mcp__computer-use__request_access` ni aucun outil `mcp__computer-use__*`.**

Pour vérifier le rendu de l'interface, utiliser à la place :
- `mcp__Claude_Preview__preview_screenshot` (serveur de preview Vite)
- `mcp__Claude_Preview__preview_eval` pour interagir avec la page
- `npx vite build` pour valider la syntaxe sans erreur
