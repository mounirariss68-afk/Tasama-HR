#!/usr/bin/env bash
# Install on first run (or when the lockfile changes), build the web app, start the server.
set -e
cd "$(dirname "$0")/.."
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.installed ]; then
  npm install --include=dev --no-audit --no-fund
  touch node_modules/.installed
fi
npm run build
exec npm start
