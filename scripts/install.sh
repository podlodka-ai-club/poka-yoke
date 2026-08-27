#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_ROOT=$(dirname -- "$SCRIPT_DIR")
BUN_BIN=${BUN_BIN:-bun}

BUN_COMMAND=$BUN_BIN
if ! BUN_BIN=$(command -v "$BUN_COMMAND"); then
  printf '%s\n' "SciPi requires Bun 1.3.14 or newer: https://bun.sh" >&2
  exit 1
fi
case "$BUN_BIN" in
  /*) ;;
  *) BUN_BIN="$(pwd -P)/$BUN_BIN" ;;
esac

BUN_VERSION=$("$BUN_BIN" --version)
case "$BUN_VERSION" in
  *.*.*) ;;
  *)
    printf 'Unsupported Bun version string: %s\n' "$BUN_VERSION" >&2
    exit 1
    ;;
esac
BUN_MAJOR=${BUN_VERSION%%.*}
BUN_REMAINDER=${BUN_VERSION#*.}
BUN_MINOR=${BUN_REMAINDER%%.*}
BUN_PATCH=${BUN_REMAINDER#*.}
BUN_PATCH=${BUN_PATCH%%[-+]*}
case "$BUN_MAJOR:$BUN_MINOR:$BUN_PATCH" in
  *[!0-9:]* | *::* | :* | *:)
    printf 'Unsupported Bun version string: %s\n' "$BUN_VERSION" >&2
    exit 1
    ;;
esac
if [ "$BUN_MAJOR" -lt 1 ] ||
  { [ "$BUN_MAJOR" -eq 1 ] && [ "$BUN_MINOR" -lt 3 ]; } ||
  { [ "$BUN_MAJOR" -eq 1 ] && [ "$BUN_MINOR" -eq 3 ] && [ "$BUN_PATCH" -lt 14 ]; }
then
  printf 'SciPi requires Bun 1.3.14 or newer; found %s\n' "$BUN_VERSION" >&2
  exit 1
fi

if [ -z "${HOME:-}" ]; then
  printf '%s\n' "HOME must be set" >&2
  exit 1
fi

DATA_HOME=${XDG_DATA_HOME:-"$HOME/.local/share"}
INSTALL_DIR=${SCIPI_INSTALL_DIR:-"$DATA_HOME/scipi"}
BIN_DIR=${SCIPI_BIN_DIR:-"$HOME/.local/bin"}
BIN_PATH="$BIN_DIR/scipi"
MARKER_NAME=.scipi-local-install

for required_path in package.json bun.lock README.md src/main.ts scripts/build-scipi-distribution.ts; do
  if [ ! -e "$SOURCE_ROOT/$required_path" ]; then
    printf 'Missing installer input: %s\n' "$SOURCE_ROOT/$required_path" >&2
    exit 1
  fi
done

if [ -e "$INSTALL_DIR" ] || [ -L "$INSTALL_DIR" ]; then
  if [ ! -f "$INSTALL_DIR/$MARKER_NAME" ]; then
    printf 'Refusing to replace unmanaged install directory: %s\n' "$INSTALL_DIR" >&2
    exit 1
  fi
fi

if [ -e "$BIN_PATH" ] && [ ! -L "$BIN_PATH" ]; then
  printf 'Refusing to replace non-symlink executable: %s\n' "$BIN_PATH" >&2
  exit 1
fi
if [ -L "$BIN_PATH" ]; then
  existing_target=$(readlink "$BIN_PATH")
  if [ "$existing_target" != "$INSTALL_DIR/src/main.ts" ]; then
    printf 'Refusing to replace symlink owned by another installation: %s -> %s\n' "$BIN_PATH" "$existing_target" >&2
    exit 1
  fi
fi

TMP_BASE=${TMPDIR:-/tmp}
STAGING_DIR=$(mktemp -d "$TMP_BASE/scipi-install.XXXXXX")
NEXT_DIR="$INSTALL_DIR.next.$$"
BACKUP_DIR="$INSTALL_DIR.backup.$$"

cleanup() {
  if [ -n "${STAGING_DIR:-}" ]; then
    rm -rf "$STAGING_DIR"
  fi
  rm -rf "$NEXT_DIR"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$STAGING_DIR/scripts"
cp "$SOURCE_ROOT/package.json" "$SOURCE_ROOT/bun.lock" "$SOURCE_ROOT/README.md" "$STAGING_DIR/"
cp -R "$SOURCE_ROOT/src" "$STAGING_DIR/src"
cp "$SOURCE_ROOT/scripts/build-scipi-distribution.ts" "$STAGING_DIR/scripts/"

(
  cd "$STAGING_DIR"
  "$BUN_BIN" install --production --frozen-lockfile
)

chmod +x "$STAGING_DIR/src/main.ts"
printf '%s\n' "managed-by=scipi-local-installer" > "$STAGING_DIR/$MARKER_NAME"

mkdir -p "$(dirname -- "$INSTALL_DIR")" "$BIN_DIR"
rm -rf "$NEXT_DIR" "$BACKUP_DIR"
mv "$STAGING_DIR" "$NEXT_DIR"
STAGING_DIR=

if [ -e "$INSTALL_DIR" ] || [ -L "$INSTALL_DIR" ]; then
  mv "$INSTALL_DIR" "$BACKUP_DIR"
fi

if ! mv "$NEXT_DIR" "$INSTALL_DIR"; then
  if [ -e "$BACKUP_DIR" ] || [ -L "$BACKUP_DIR" ]; then
    mv "$BACKUP_DIR" "$INSTALL_DIR"
  fi
  exit 1
fi

if ! "$BUN_BIN" run "$INSTALL_DIR/src/main.ts" --version >/dev/null; then
  rm -rf "$INSTALL_DIR"
  if [ -e "$BACKUP_DIR" ] || [ -L "$BACKUP_DIR" ]; then
    mv "$BACKUP_DIR" "$INSTALL_DIR"
  fi
  printf '%s\n' "Installed SciPi failed its startup smoke test" >&2
  exit 1
fi

if ! ln -sfn "$INSTALL_DIR/src/main.ts" "$BIN_PATH"; then
  rm -rf "$INSTALL_DIR"
  if [ -e "$BACKUP_DIR" ] || [ -L "$BACKUP_DIR" ]; then
    mv "$BACKUP_DIR" "$INSTALL_DIR"
  fi
  printf 'Failed to activate SciPi executable: %s\n' "$BIN_PATH" >&2
  exit 1
fi
rm -rf "$BACKUP_DIR"
trap - EXIT HUP INT TERM

printf 'Installed SciPi: %s\n' "$INSTALL_DIR"
printf 'Executable: %s\n' "$BIN_PATH"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) printf 'Add to PATH: export PATH="%s:$PATH"\n' "$BIN_DIR" ;;
esac
