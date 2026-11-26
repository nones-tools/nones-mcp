import pkg from "../package.json" with { type: "json" };

/** Package metadata version, bundled into the CLI and SDK at build time. */
const version: string = pkg.version;

export { version };
