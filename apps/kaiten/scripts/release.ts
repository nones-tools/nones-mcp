#!/usr/bin/env bun
/**
 * Release script: bumps the version, rolls the CHANGELOG "Unreleased" section
 * into the new version, commits `chore: X.Y.Z` and pushes. That commit message
 * is the ONLY thing that triggers the Release workflow in CI (.github/workflows/
 * release.yml), which lints/tests/builds and publishes to npm + GitHub Packages
 * and creates the GitHub Release.
 *
 * Usage:
 *   bun run release patch|minor|major   # bump from current package.json version
 *   bun run release 3.4.0               # set an explicit version
 *   bun run release patch --no-push     # commit locally, push yourself later
 */
import { spawnSync } from 'child_process';
import fs from 'fs';

function run(cmd: string, args: string[]): string {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`\n✖ ${cmd} ${args.join(' ')} failed:\n${res.stderr || res.stdout}`);
    process.exit(1);
  }
  return res.stdout.trim();
}

const arg = process.argv[2];
const noPush = process.argv.includes('--no-push');
if (!arg || !/^(patch|minor|major|\d+\.\d+\.\d+)$/.test(arg)) {
  console.error('Usage: bun run release patch|minor|major|X.Y.Z [--no-push]');
  process.exit(1);
}

if (run('git', ['status', '--porcelain']) !== '') {
  console.error('✖ Working tree is not clean — commit or stash your changes first.');
  process.exit(1);
}

const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [maj, min, pat] = (pkg.version as string).split('.').map(Number);
const next =
  arg === 'patch' ? `${maj}.${min}.${pat + 1}`
  : arg === 'minor' ? `${maj}.${min + 1}.0`
  : arg === 'major' ? `${maj + 1}.0.0`
  : arg;
if (next === pkg.version) {
  console.error(`✖ Version is already ${next}.`);
  process.exit(1);
}

console.log(`Releasing ${pkg.version} → ${next}. Running local gates first…`);
run('bun', ['run', 'lint']);
run('bunx', ['tsc', '--noEmit']);
run('bun', ['test']);
console.log('✓ lint, typecheck, tests green');

pkg.version = next;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const clPath = 'CHANGELOG.md';
const date = new Date().toISOString().slice(0, 10);
let changelog = fs.readFileSync(clPath, 'utf8');
if (/^## Unreleased$/m.test(changelog)) {
  changelog = changelog.replace(/^## Unreleased$/m, `## ${next} — ${date}`);
} else {
  changelog = changelog.replace(/^## /m, `## ${next} — ${date}\n\n_No changelog entries — see commit history._\n\n## `);
  console.warn('⚠ No "## Unreleased" section in CHANGELOG.md — inserted a stub entry.');
}
fs.writeFileSync(clPath, changelog);

run('git', ['add', pkgPath, clPath]);
run('git', ['commit', '-m', `chore: ${next}`]);
console.log(`✓ Committed "chore: ${next}"`);

if (noPush) {
  console.log('Skipping push (--no-push). Push to master to trigger the release workflow.');
} else {
  run('git', ['push', 'origin', 'HEAD']);
  console.log('✓ Pushed — the Release workflow will publish to npm + GitHub Packages and create the GitHub Release.');
}
