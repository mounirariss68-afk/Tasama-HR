#!/usr/bin/env bash
# Configuration adapter for artifact-local workflow execution.
set -e
cd "$(dirname "$0")/../imported"
exec bash tools/replit-run.sh
