#!/bin/bash
# Double-click in Finder to start Ordis (same as `npm start`).
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Ordis needs Node.js and npm. Install Node from https://nodejs.org and try again."
  read -r -p "Press Return to close."
  exit 1
fi
if [[ ! -d node_modules ]]; then
  echo "Installing Ordis dependencies (first launch)..."
  npm install
fi
npm start
