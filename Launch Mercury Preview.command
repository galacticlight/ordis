#!/bin/bash
# Double-click to start the Vite mercury preview and open the browser.
set -euo pipefail
exec "$(dirname "$0")/scripts/macos-launch.sh" preview
