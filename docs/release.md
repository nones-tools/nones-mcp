# Release automation

## Single source of truth

`.github/workflows/release.yml` is the only release workflow for this monorepo.
The old nested workflows under `apps/kaiten/.github/`, `apps/opencode/.github/`
and `apps/dsh/.github/` are superseded legacy release paths; they must not be
used or restored for a coordinated release. This worktree removes the tracked
DSH workflow and keeps the app in the universal root workflow.

One immutable root tag, `vX.Y.Z`, releases all five public workspaces from the
same `main` commit:

| Publish order | Package | Workspace | Artifact |
| --- | --- | --- | --- |
| 1 | `@nones/mcp-core` | `apps/core` | `nones-mcp-core-X.Y.Z.tgz` |
| 2 | `@nones/journal` | `adapters/journal` | `nones-journal-X.Y.Z.tgz` |
| 3 | `@nones/kaiten-mcp` | `apps/kaiten` | `nones-kaiten-mcp-X.Y.Z.tgz` |
| 4 | `@nones/opencode-mcp` | `apps/opencode` | `nones-opencode-mcp-X.Y.Z.tgz` |
| 5 | `@nones/dsh-session-mcp` | `apps/dsh` | `nones-dsh-session-mcp-X.Y.Z.tgz` |

`@nones/dsh-session-mcp` is a DeepSeek Harness Cordis bundle published from
`apps/dsh`. Install it into a profile with
`dsh plugin --profile <name> add @nones/dsh-session-mcp`; it is not an aggregate
module, so the root `nones-mcp` gateway does not host it. Its tarball keeps the
compiled Host/Client entries, `cordis.patch.yml`, `icon.svg` and the real
`locale/*.json` files; `src/` and legacy `dist/` are never published.

The journal collection is public as `@nones/journal`, with SQLite usage through
the typed subpath `@nones/journal/sqlite`. `@nones/mcp-journal-sqlite` is retired
and must not be published. All five manifests, the root manifest and
`bun.lock` are synchronized to the coordinated version.

## Version synchronization

The version command validates strict SemVer, synchronizes root plus all five
workspace versions, pins every internal `@nones/*` dependency to the exact
release version, and updates the root `bun.lock` workspace metadata without
changing external lock entries. It preserves package names, registry scope and
executable `bin` maps.

```sh
# Preview only; this is the default.
node scripts/release.mjs version 5.1.0
bun scripts/release.mjs version 5.1.0

# Apply.
node scripts/release.mjs version 5.1.0 --write
bun scripts/release.mjs version 5.1.0 --write
```

`version` accepts future versions, prereleases and an optional leading `v`.
It is idempotent. It refuses malformed SemVer, duplicate or multi-slash npm
names, retired journal names, and a missing root lockfile.

Root package scripts can call the same entrypoint; the root manifest is owned
elsewhere, so add these only when its owner is ready:

```json
{
  "scripts": {
    "release:test": "node --test scripts/release.test.mjs",
    "release:version": "node scripts/release.mjs version",
    "release:plan": "node scripts/release.mjs plan",
    "release:pack": "node scripts/release.mjs pack",
    "release:publish": "node scripts/release.mjs publish"
  }
}
```

Then call, for example, `bun run release:version -- 5.1.0 --write` and
`bun run release:plan -- --tag v5.1.0`.

## Planning, packing and verification

```sh
node scripts/release.mjs plan --tag v5.1.0
node scripts/release.mjs verify-tag --tag v5.1.0 --main-ref origin/main
node scripts/release.mjs pack --tag v5.1.0 --out .tmp/release/v5.1.0
node scripts/release.mjs verify-install --out .tmp/release/v5.1.0
```

`verify-tag` requires the checked-out commit to be the tag commit and an
ancestor of `origin/main`, then validates tag/manifest alignment, exact internal
dependency versions, unique names, the journal `./sqlite` export and bins.

`pack` runs `npm pack --ignore-scripts` for each workspace, rejects source files
or missing `dist`/bin entries, resolves wildcard export targets such as DSH's
`./locale/*.json` against real packed files, writes `release-manifest.json`,
`SHA256SUMS` and `release-commit.txt`, then installs exactly those tarballs in a
temporary project and imports every package. Publication uses the same hashes
and commit.

After npm accepts a publish with HTTP 202, the version and its `dist.integrity`
can stay invisible for several minutes. Publication polls the registry for up
to roughly ten minutes before failing; a visible but different SRI still fails
closed immediately.

## GitHub tag workflow

A push of `vX.Y.Z` runs one workflow for all five packages. It performs:

1. strict tag, manifest and main-ancestry validation;
2. release-tool tests and canonical `bun run verify`;
3. packing without lifecycle scripts, install smoke, checksums and build attestation;
4. upload of the named Actions artifact `release-vX.Y.Z`;
5. optional npm publication;
6. a GitHub release for the monorepo tag with all five archives, `SHA256SUMS`,
   `release-manifest.json` and `release-commit.txt`.

`workflow_dispatch` accepts the same tag or `refs/tags/vX.Y.Z` and repeats the
same strict checks. An optional `artifact_run_id` publishes and attaches the
earlier named artifact (within its 90-day retention) after verifying its
recorded commit and every tarball hash. This lets a later run resume from the
immutable tag without trusting a workflow context from the first run.

## npm trust gate and bootstrap

The npm job is the only part gated by the repository variable:

```text
NPM_TRUSTED_PUBLISHER_ENABLED == '1'
```

Build, package validation, checksums, attestation, the named Actions artifact and
the GitHub release run while that variable is unset. The npm job uses GitHub OIDC
trusted publishing and contains no npm token secret.

Pinned runtime requirements: Node `22.14.0` (official minimum `>=22.14`) and npm
`11.21.3` (official minimum `>=11.5.1`; `11.20.0+` is needed for dist-tag OIDC).
Actions are pinned by commit SHA. Do not add registry credentials to Actions
secrets.

A new package such as `@nones/mcp-core` or `@nones/journal` cannot have npm-side
trusted publishing configured until it exists in the registry. Bootstrap it as
follows:

1. Push the tag while `NPM_TRUSTED_PUBLISHER_ENABLED` is unset. Wait for the
   build job to upload `release-vX.Y.Z` and for the GitHub release to appear.
2. On an authorized maintainer machine, use the repository's already-authorized
   npm CLI login (`npm login` / the user's existing npm auth) and the same
   script on that verified artifact:

   ```sh
   node scripts/release.mjs publish \
     --tag vX.Y.Z \
     --out .tmp/release/vX.Y.Z \
     --dist-tag staging \
     --write \
     --no-latest
   ```

   `--no-latest` is for first-publish/bootstrap: it publishes only the
   `staging` dist-tag, so the first core/journal versions are not promoted to
   `latest` before npm-side trust exists. The script never overwrites an
   existing version and refuses missing commit or hash verification.
3. An npm owner configures a Trusted Publisher for each package on npmjs.com:
   repository owner/repository, workflow filename `release.yml`, and GitHub
   Actions. Grant **both** the publish permission and the dist-tag permission.
   They are independent: read/write token access to publish does not grant trust
   account changes, and an automation token can receive `403 Forbidden` for trust
   configuration even when it can publish. npm-owner access is arranged outside
   this repository.
4. Set `NPM_TRUSTED_PUBLISHER_ENABLED=1`, then run the workflow again on the same
   immutable tag (`workflow_dispatch`, optionally with the first run's
   `artifact_run_id`). Existing exact versions are skipped; staging tags are
   reconciled and `latest` is promoted only after all five exact versions are
   present in the registry.

Direct token publishes and dist-tag updates remain supported by the same script
when the local npm CLI is authenticated, but they still require each permission
independently. Do not commit or paste tokens; the script never prints them.

## Idempotency and safety

- `version`, `publish` are dry-runs unless `--write` is explicit.
- Publication is dependency ordered: core, journal, kaiten, opencode.
- Existing npm versions are skipped, never overwritten.
- A concurrent `EPUBLISHCONFLICT` is accepted only after the exact version is
  confirmed present.
- All exact versions must be visible before any staging/latest tag move.
- Newer `latest` versions are never downgraded on rerun.
- Prerelease versions never move `latest`.
- Missing `release-commit.txt`, a commit mismatch or any tarball hash mismatch
  aborts before npm publication.
- Errors propagate normally; outputs are deterministic and secret-free.

## Tests

```sh
node --test scripts/release.test.mjs
```

The suite uses temporary isolated Git copies and a synthetic new-shape journal
manifest, plus mocked npm interactions. It covers version mutation, lock
stability, bins/names, tag ancestry, dry runs, partial success, publish failure
and resume, conflicts, already-published versions, `--no-latest`, dist-tag 403
guidance, packing without scripts, checksum/commit enforcement and install from
the exact tarballs. Runtime journal directory migration can land independently;
the tests do not require the old adapter package name.
