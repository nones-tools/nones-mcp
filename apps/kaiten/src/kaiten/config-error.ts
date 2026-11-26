/** Configuration errors shared by the env/file loader and scoped module loader. */
export class KaitenConfigError extends Error {
  constructor(
    readonly code: 'MISSING_CONFIGURATION' | 'INVALID_CONFIGURATION',
    message: string
  ) {
    super(message);
    this.name = 'KaitenConfigError';
  }
}
