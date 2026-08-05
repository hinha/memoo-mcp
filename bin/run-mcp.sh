#!/usr/bin/env bash
# Local launcher for development. End users should use `npx memoo-mcp`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
if [[ ! -f "$ROOT/dist/index.js" ]]; then
  echo "[memoo-mcp] dist/ missing — run: npm run build" >&2
  exit 1
fi
exec node "$ROOT/dist/index.js" "$@"
