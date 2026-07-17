#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ICONSET="$WORK/icon.iconset"
mkdir -p "$ICONSET"

sips -z 1024 1024 "$ROOT/build/icon.png" --out "$WORK/icon-1024.png" >/dev/null
for SIZE in 16 32 128 256 512; do
  sips -z "$SIZE" "$SIZE" "$WORK/icon-1024.png" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
  DOUBLE=$((SIZE * 2))
  sips -z "$DOUBLE" "$DOUBLE" "$WORK/icon-1024.png" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$ROOT/build/icon.icns"
