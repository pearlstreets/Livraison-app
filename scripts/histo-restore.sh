#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

TS="${1:-}"
if [ -z "${TS}" ]; then
  echo "Usage: scripts/histo-restore.sh <timestamp> [files_or_dirs...]"
  echo "Exemples:"
  echo "  scripts/histo-restore.sh 20250828_161337                      # restaure TOUT"
  echo "  scripts/histo-restore.sh 20250828_161337 screens/MapScreen.js  # restaure UN fichier"
  echo "Snapshots disponibles (20 derniers) :"
  ls -1 historique/reverts | sort | tail -n 20 || true
  exit 1
fi
shift || true

SRC="historique/reverts/${TS}"
if [ ! -d "${SRC}" ]; then
  echo "❌ Snapshot introuvable: ${SRC}"
  exit 1
fi

if [ "$#" -eq 0 ]; then
  # Restaure tout le snapshot
  rsync -a "${SRC}/" ./ --exclude 'COMMIT.txt'
  echo "✅ Restauration complète depuis ${SRC}"
else
  # Restaure uniquement les chemins demandés
  restored=0
  for p in "$@"; do
    if [ -e "${SRC}/${p}" ]; then
      mkdir -p "$(dirname "${p}")"
      rsync -a "${SRC}/${p}" "${p}"
      echo "↩︎ Restauré: ${p}"
      restored=$((restored+1))
    else
      echo "⚠️  Introuvable dans le snapshot: ${p}" >&2
    fi
  done
  if [ "${restored}" -gt 0 ]; then
    echo "✅ Restauration sélective depuis ${SRC} (fichiers: ${restored})"
  else
    echo "ℹ️  Aucun fichier restauré."
  fi
fi
