#!/bin/bash
# Shared Mac launch helper. Invoked by the double-clickable .command files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MODE="${1:-overlay}"

need_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "Ordis needs Node.js and npm. Install Node from https://nodejs.org and try again."
    read -r -p "Press Return to close." _
    exit 1
  fi
  if [[ ! -d node_modules ]]; then
    echo "Installing Ordis dependencies (first launch)..."
    npm install
  fi
}

find_app() {
  local candidate
  for candidate in "$ROOT/release/mac-arm64/Ordis.app" "$ROOT/release/mac/Ordis.app"; do
    if [[ -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

# True when the packaged app includes resolveMercuryFlag (understands --mercury=raymarch).
app_supports_mercury() {
  local app="$1"
  local asar="$app/Contents/Resources/app.asar"
  local unpacked="$app/Contents/Resources/app"
  if [[ -f "$asar" ]]; then
    grep -aFq "resolveMercuryFlag" "$asar"
  elif [[ -d "$unpacked" ]]; then
    grep -RFq "resolveMercuryFlag" "$unpacked"
  else
    return 1
  fi
}

ensure_app() {
  local app
  if app="$(find_app)"; then
    printf '%s\n' "$app"
    return 0
  fi
  if [[ "$(uname -s)" != Darwin ]]; then
    echo "Ordis.app is a macOS darwin-arm64 build. Run this launcher on the Operator's Mac."
    exit 1
  fi
  need_npm
  echo "Building Ordis.app (darwin-arm64). This can take a few minutes the first time..."
  npm run package:darwin-arm64
  if ! app="$(find_app)"; then
    echo "The packaged app was not found under release/mac-arm64/Ordis.app."
    exit 1
  fi
  printf '%s\n' "$app"
}

case "$MODE" in
  overlay)
    need_npm
    npm start
    ;;
  mercury-dev)
    need_npm
    npm run dev:mercury
    ;;
  preview)
    need_npm
    npm run spike
    ;;
  app)
    APP_PATH="$(ensure_app)"
    echo "Opening $APP_PATH"
    open -n "$APP_PATH"
    ;;
  mercury)
    if APP_PATH="$(find_app)" && app_supports_mercury "$APP_PATH"; then
      echo "Opening $APP_PATH with --mercury=raymarch"
      open -n "$APP_PATH" --args --mercury=raymarch
    else
      if [[ -n "${APP_PATH:-}" ]]; then
        echo "Packaged Ordis.app does not understand --mercury=raymarch — launching the Electron overlay with raymarch."
      else
        echo "No packaged Ordis.app yet — launching the Electron overlay with raymarch."
      fi
      need_npm
      npm run dev:mercury
    fi
    ;;
  *)
    echo "Usage: $0 overlay|mercury-dev|preview|app|mercury"
    exit 1
    ;;
esac
