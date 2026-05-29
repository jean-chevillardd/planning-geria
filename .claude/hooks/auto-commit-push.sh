#!/usr/bin/env bash
# auto-commit-push.sh — appelé par le hook Stop de Claude Code
# Commit et push automatiquement si des fichiers ont été modifiés.
# Silencieux et non-fatal : exit 0 dans tous les cas.

set +e

REPO='/Users/jeanchevillard/Documents/tests de code/planning-geriatrie'

cd "$REPO" 2>/dev/null || exit 0

# Rien à faire si le dépôt est propre
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

git add -A
git commit -m "Auto-commit: session changes $(date '+%Y-%m-%d %H:%M')" --no-verify -q 2>/dev/null || exit 0
git push -q 2>/dev/null || true

exit 0
