#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_ROOT=$(dirname -- "$SCRIPT_DIR")
BUN_BIN=${BUN_BIN:-bun}

if ! command -v "$BUN_BIN" >/dev/null 2>&1; then
  printf '%s\n' "SciPi requires Bun 1.3.14 or newer: https://bun.sh" >&2
  exit 1
fi

exec "$BUN_BIN" run "$SCRIPT_DIR/install.ts" --source "$SOURCE_ROOT"
