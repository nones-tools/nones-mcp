#!/usr/bin/env bash
set -euo pipefail

requested="${1:?release tag is required}"
tag="${requested#refs/tags/}"
if [[ ! "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "::error::Not a release tag: $requested"
  exit 1
fi
commit="$(git rev-parse "${tag}^{commit}")"
{
  echo "tag=$tag"
  echo "version=${tag#v}"
  echo "commit=$commit"
  echo "artifact=release-$tag"
} >> "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
