import { describe, expect, it } from 'vitest';

import { AdapterError, ConfigError, UsageError, errorMessage } from '../src/errors.js';

describe('errors', () => {
  it('keeps stable categories and handles non-Error values', () => {
    expect(new AdapterError('adapter').category).toBe('adapter');
    expect(new ConfigError('config').category).toBe('config');
    expect(new UsageError('usage').category).toBe('usage');
    expect(errorMessage('offline')).toBe('offline');
    expect(errorMessage(new Error('broken'))).toBe('broken');
  });
});
