#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

TS="${1:-}"
if [ -z "$TS" ]; then
  echo "Usage: scripts/histo-restore.sh <timestamp>"
  echo "Snapshots dispos (20 derniers) :"
  ls -1 historique/reverts | tail -n 20 || true
  exit 1
fi

SRC="historique/reverts/$TS"
if [ ! -d "$SRC" ]; then
  echo "❌ Snapshot introuvable: $SRC"
  exit 1
fi

# Restauration (écrase les fichiers actuels par ceux du snapshot)
rsync -a "$SRC"/ ./ --exclude 'COMMIT.txt'

echo "✅ Restauration effectuée depuis $SRC"
