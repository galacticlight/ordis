#!/bin/bash
# One-step raymarch: packaged Ordis.app with --mercury=raymarch, or npm run dev:mercury.
set -euo pipefail
exec "$(dirname "$0")/scripts/macos-launch.sh" mercury
