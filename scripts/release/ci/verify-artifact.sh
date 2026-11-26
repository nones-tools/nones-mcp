#!/usr/bin/env bash
set -euo pipefail

directory="${1:?artifact directory is required}"
tag="${2:?tag is required}"
expected="${3:?commit is required}"

test -f "$directory/release-commit.txt"
test -f "$directory/release-manifest.json"
test -f "$directory/SHA256SUMS"
actual="$(tr -d '[:space:]' < "$directory/release-commit.txt")"
test "$actual" = "$expected"
test "$(git rev-parse "${tag}^{commit}")" = "$expected"
count="$(find "$directory" -maxdepth 1 -name '*.tgz' | wc -l | tr -d '[:space:]')"
test "$count" -eq 4
(
  cd "$directory"
  sha256sum --check SHA256SUMS
)
