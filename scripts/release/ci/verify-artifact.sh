#!/usr/bin/env bash
set -euo pipefail

directory="${1:?artifact directory is required}"
tag="${2:?tag is required}"
expected="${3:?commit is required}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$here/verify-artifact.mjs" "$directory" "$tag" "$expected"
