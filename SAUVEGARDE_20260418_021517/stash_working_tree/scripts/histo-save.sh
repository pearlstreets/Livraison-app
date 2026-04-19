#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

TS=$(date +%Y%m%d_%H%M%S)
DEST="historique/reverts/$TS"
mkdir -p "$DEST"

# Si tu donnes des chemins en arguments, on ne sauvegarde que ceux-ci.
# Sinon on prend les répertoires/fichiers clés habituels.
if [ "$#" -gt 0 ]; then
  PATHS=("$@")
else
  PATHS=(App.js app.json components screens constants hooks)
fi

# Copie en conservant l'arborescence relative
for p in "${PATHS[@]}"; do
  if [ -e "$p" ]; then
    rsync -a --relative "$p" "$DEST"/
  fi
done

# On note le commit git courant (si repo) pour info
git rev-parse HEAD > "$DEST/COMMIT.txt" 2>/dev/null || echo "no-git" > "$DEST/COMMIT.txt"

echo "✅ Snapshot créé → $DEST"
