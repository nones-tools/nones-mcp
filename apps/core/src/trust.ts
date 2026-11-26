/**
 * Trust anchors for installed adapters. A config file cannot add entries.
 * `envPrefixes` bounds which environment variables a module may receive, so
 * one module's credentials can never be mapped into another module, and
 * executable-loader variables are denied on both sides of envFrom.
 */
export interface TrustedModule {
  package: string;
  envPrefixes: readonly string[];
}

export const TRUSTED_MODULES: Readonly<Record<string, TrustedModule>> = {
  kaiten: {
    package: "@nones/kaiten-module",
    envPrefixes: ["KAITEN_"],
  },
  opencode: {
    package: "@nones/opencode-module",
    envPrefixes: ["OPENCODE_"],
  },
};

export const TRUSTED_MODULE_IDS: readonly string[] = Object.keys(TRUSTED_MODULES);

const DENIED_ENV =
  /^(?:PATH|HOME|PWD|SHELL|USER|LOGNAME|NODE_OPTIONS|NODE_PATH|NODE_EXTRA_CA_CERTS|BUN_.*|NPM_.*|LD_.*|DYLD_.*|ELECTRON_.*|PYTHONPATH|PERL5LIB|RUBYLIB|GIT_DIR|GIT_WORK_TREE|NONES_.*)$/;

export function isDeniedEnvName(name: string): boolean {
  return DENIED_ENV.test(name);
}

export function envNameAllowedFor(moduleId: string, name: string): boolean {
  if (isDeniedEnvName(name)) return false;
  const trusted = TRUSTED_MODULES[moduleId];
  if (!trusted) return false;
  return trusted.envPrefixes.some((prefix) => name.startsWith(prefix));
}
