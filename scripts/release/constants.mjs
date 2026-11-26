import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_ROOT = path.resolve(MODULE_DIR, "..", "..");
export const DEFAULT_REGISTRY = "https://registry.npmjs.org";
export const DEFAULT_STAGING_DIST_TAG = "staging";

/** Public workspaces in dependency-first publish order. */
export const PACKAGES = Object.freeze([
  { dir: "apps/core", name: "@nones/mcp-core" },
  { dir: "adapters/journal", name: "@nones/journal" },
  { dir: "apps/kaiten", name: "@nones/kaiten-mcp" },
  { dir: "apps/opencode", name: "@nones/opencode-mcp" },
  { dir: "apps/dsh", name: "@nones/dsh-session-mcp" },
]);

export const PACKAGE_NAMES = Object.freeze(PACKAGES.map((entry) => entry.name));
export const DEPRECATED_PACKAGE_NAMES = Object.freeze(["@nones/mcp-journal-sqlite"]);

export const DEPENDENCY_FIELDS = Object.freeze([
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
]);

export const REQUIRED_BINS = Object.freeze({
  "@nones/mcp-core": ["nones-mcp"],
  "@nones/journal": [],
  "@nones/kaiten-mcp": ["kaiten"],
  "@nones/opencode-mcp": ["opencode-mcp", "oc2-mcp"],
  "@nones/dsh-session-mcp": [],
});

/**
 * Import specifiers exercised by the install smoke. Package roots are used by
 * default; an adapter-only package must name its public subpath explicitly so
 * the smoke never imports an undeclared root (e.g. @nones/journal has no ".").
 */
export const INSTALL_SMOKE_IMPORTS = Object.freeze({
  "@nones/journal": Object.freeze(["@nones/journal/sqlite"]),
});

export const NPM_NAME_PATTERN = /^@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*$/;
