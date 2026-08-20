#!/bin/zsh

set -e

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

exec /usr/local/bin/node web/server.mjs --open
