#!/bin/zsh

set -e

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

if curl --silent --fail --max-time 1 http://127.0.0.1:4178/ >/dev/null 2>&1; then
  open http://127.0.0.1:4178/
  exit 0
fi

exec /usr/local/bin/node web/server.mjs --open
