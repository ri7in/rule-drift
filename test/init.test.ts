import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseConfig } from '../src/config.js';
import { ConfigError } from '../src/errors.js';
import { createExampleConfig } from '../src/init.js';

describe('init', () => {
  it('creates a valid starter configuration and protects existing work', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rule-drift-init-'));
    const path = join(directory, 'suite.json');
    await expect(createExampleConfig(path)).resolves.toBe(path);
    const source = await readFile(path, 'utf8');
    expect(parseConfig(JSON.parse(source) as unknown).name).toBe('instruction-retention-example');

    await expect(createExampleConfig(path)).rejects.toBeInstanceOf(ConfigError);
    await expect(createExampleConfig(path, true)).resolves.toBe(path);
  });

  it('reports an unwritable destination', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rule-drift-init-error-'));
    await expect(
      createExampleConfig(join(directory, 'missing', 'suite.json')),
    ).rejects.toThrowError(/Could not write/u);
  });
});
