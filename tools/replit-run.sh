#!/usr/bin/env bash
# Configuration adapter: run the imported app's untouched startup script.
set -e
cd "$(dirname "$0")/../artifacts/tasama-hr/imported"
exec bash tools/replit-run.sh
