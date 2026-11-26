#!/usr/bin/env bash
set -euo pipefail

tag="${1:?tag is required}"
directory="${2:?artifact directory is required}"
assets=(
  "$directory"/*.tgz
  "$directory/SHA256SUMS"
  "$directory/release-manifest.json"
  "$directory/release-commit.txt"
)
if gh release view "$tag" >/dev/null 2>&1; then
  gh release upload "$tag" "${assets[@]}" --clobber
else
  gh release create "$tag" "${assets[@]}" \
    --verify-tag \
    --title "$tag" \
    --generate-notes
fi
