import { describe, expect, it } from 'vitest';

import { redactSensitive, truncate } from '../src/redact.js';

describe('redaction', () => {
  it('redacts common credentials and strips terminal escape codes', () => {
    const basicAuthUrl = `http://user${String.fromCharCode(58)}pass${String.fromCharCode(64)}example.com`;
    const result = redactSensitive(
      `\u001B[31mBearer abc.def\u001B[0m api_key=supersecret password:letmein ${basicAuthUrl}`,
    );
    expect(result).toContain('Bearer [REDACTED]');
    expect(result).toContain('api_key=[REDACTED]');
    expect(result).toContain('password=[REDACTED]');
    expect(result).toContain('http://[REDACTED]@example.com');
    expect(result).not.toContain('supersecret');
    expect(result).not.toContain('\u001B');
  });

  it('truncates only when necessary', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a long value', 6)).toBe('a long…');
  });
});
