export class RuleDriftError extends Error {
  public constructor(
    message: string,
    public readonly category: 'adapter' | 'config' | 'usage',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ConfigError extends RuleDriftError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, 'config', options);
  }
}

export class AdapterError extends RuleDriftError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, 'adapter', options);
  }
}

export class UsageError extends RuleDriftError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, 'usage', options);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
