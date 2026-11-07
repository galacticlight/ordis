#!/bin/bash
# Double-click to open (or first-time build) the darwin-arm64 Ordis.app.
set -euo pipefail
exec "$(dirname "$0")/scripts/macos-launch.sh" app
