#!/bin/bash

set -euo pipefail

usage() {
  echo "Usage: verify-clean-install.sh [repository-root]" >&2
}

if [[ "$#" -gt 1 ]]; then
  usage
  exit 2
fi

repository_root="${1:-$(git rev-parse --show-toplevel)}"
repository_root="$(cd "$repository_root" && pwd -P)"

if [[ ! -f "$repository_root/package.json" || ! -f "$repository_root/pnpm-lock.yaml" ]]; then
  echo "Repository root does not contain package.json and pnpm-lock.yaml: $repository_root" >&2
  exit 1
fi

git -C "$repository_root" diff --check

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/fluxmail-clean-install.XXXXXX")"
candidate_root="$temporary_root/repository"

cleanup() {
  rm -rf "$temporary_root"
}
trap cleanup EXIT

git clone --quiet --no-hardlinks "$repository_root" "$candidate_root"
git -C "$repository_root" diff --binary HEAD | git -C "$candidate_root" apply --whitespace=nowarn

while IFS= read -r -d '' candidate_file; do
  mkdir -p "$candidate_root/$(dirname "$candidate_file")"
  cp -pR "$repository_root/$candidate_file" "$candidate_root/$candidate_file"
done < <(git -C "$repository_root" ls-files -z --others --exclude-standard)

cd "$candidate_root"
pnpm install --frozen-lockfile

electron_licenses="node_modules/electron/dist/LICENSES.chromium.html"
if [[ ! -s "$electron_licenses" ]]; then
  echo "Electron install is incomplete: $electron_licenses is missing or empty." >&2
  exit 1
fi

pnpm make

version="$(node -p "require('./package.json').version")"
case "$(uname -m)" in
  arm64)
    architecture="arm64"
    ;;
  x86_64)
    architecture="x64"
    ;;
  *)
    echo "Unsupported host architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

dmg_path="out/make/Fluxmail-${version}-${architecture}.dmg"
zip_path="out/make/zip/darwin/${architecture}/Fluxmail-darwin-${architecture}-${version}.zip"

for artifact_path in "$dmg_path" "$zip_path"; do
  if [[ ! -s "$artifact_path" ]]; then
    echo "Clean-install packaging did not create $artifact_path." >&2
    exit 1
  fi
done

echo "Clean-install packaging passed for Fluxmail ${version} (${architecture})."
