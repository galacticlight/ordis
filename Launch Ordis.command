#!/bin/bash
# Double-click to start the Electron overlay (mesh mercury).
set -euo pipefail
exec "$(dirname "$0")/scripts/macos-launch.sh" overlay
