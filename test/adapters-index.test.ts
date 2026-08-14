import { describe, expect, it } from 'vitest';

import { CommandAdapter, OllamaAdapter, createAdapter } from '../src/adapters/index.js';

describe('adapter factory', () => {
  it('creates the configured adapter', () => {
    expect(createAdapter({ type: 'command', command: 'node' }, process.cwd())).toBeInstanceOf(
      CommandAdapter,
    );
    expect(createAdapter({ type: 'ollama', model: 'local' }, process.cwd())).toBeInstanceOf(
      OllamaAdapter,
    );
  });
});
