import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig, parseConfig } from '../src/config.js';
import { ConfigError } from '../src/errors.js';
import { EXAMPLE_CONFIG } from '../src/init.js';

function cloneExample(): Record<string, unknown> {
  return structuredClone(EXAMPLE_CONFIG) as unknown as Record<string, unknown>;
}

describe('configuration', () => {
  it('accepts and returns a version 1 suite', () => {
    const config = parseConfig(cloneExample());
    expect(config.name).toBe('instruction-retention-example');
    expect(config.adapter.type).toBe('ollama');
  });

  it('collects useful validation errors', () => {
    const invalid = cloneExample();
    invalid.version = 2;
    invalid.name = '';
    invalid.adapter = { type: 'ollama', model: '', timeoutMs: 0, baseUrl: 'file:///tmp/model' };
    invalid.rules = [
      { id: 'Bad ID', instruction: '', severity: 'urgent' },
      { id: 'Bad ID', instruction: 'duplicate' },
    ];
    invalid.scenarios = [];

    expect(() => parseConfig(invalid)).toThrowError(/version must be 1/u);
    expect(() => parseConfig(invalid)).toThrowError(/adapter\.model/u);
    expect(() => parseConfig(invalid)).toThrowError(/must use http or https/u);
    expect(() => parseConfig(invalid)).toThrowError(/scenarios must be a non-empty array/u);
  });

  it('rejects broken scenario references, ranges, turns, and regexes', () => {
    const invalid = cloneExample();
    invalid.scenarios = [
      {
        id: 'scenario',
        description: 42,
        turns: [{ prompt: '' }],
        probes: [
          {
            id: 'probe',
            ruleId: 'missing',
            afterTurn: 2,
            prompt: '',
            assertions: [
              { type: 'matches', pattern: '[', flags: 'i' },
              { type: 'matches', pattern: 'ok', flags: 3 },
            ],
          },
          {
            id: 'probe',
            ruleId: 'project-codename',
            afterTurn: -1,
            prompt: 'test',
            assertions: [{ type: 'unknown' }],
          },
        ],
      },
    ];

    expect(() => parseConfig(invalid)).toThrowError(/must reference a configured rule/u);
    expect(() => parseConfig(invalid)).toThrowError(/contains an invalid regular expression/u);
    expect(() => parseConfig(invalid)).toThrowError(/duplicates probe/u);
  });

  it('validates command adapter fields and JSON-only Ollama options', () => {
    const invalidCommand = cloneExample();
    invalidCommand.adapter = {
      type: 'command',
      command: '',
      args: [1],
      cwd: '',
      timeoutMs: 700_000,
    };
    expect(() => parseConfig(invalidCommand)).toThrowError(/adapter\.command/u);
    expect(() => parseConfig(invalidCommand)).toThrowError(/adapter\.args/u);

    const invalidOptions = cloneExample();
    invalidOptions.adapter = {
      type: 'ollama',
      model: 'model',
      baseUrl: `http://user${String.fromCharCode(58)}pass${String.fromCharCode(64)}example.com`,
      think: 'sometimes',
      options: { bad: Number.NaN },
    };
    expect(() => parseConfig(invalidOptions)).toThrowError(/JSON-compatible/u);
    expect(() => parseConfig(invalidOptions)).toThrowError(/must not include credentials/u);
    expect(() => parseConfig(invalidOptions)).toThrowError(/adapter\.think/u);

    const unknown = cloneExample();
    unknown.adapter = { type: 'remote' };
    expect(() => parseConfig(unknown)).toThrowError(/adapter\.type/u);
  });

  it('loads a file and reports missing or malformed files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rule-drift-config-'));
    const validPath = join(directory, 'valid.json');
    await writeFile(validPath, JSON.stringify(EXAMPLE_CONFIG));
    await expect(loadConfig(validPath)).resolves.toMatchObject({
      path: validPath,
      baseDir: directory,
    });

    await expect(loadConfig(join(directory, 'missing.json'))).rejects.toBeInstanceOf(ConfigError);
    const malformedPath = join(directory, 'malformed.json');
    await writeFile(malformedPath, '{broken');
    await expect(loadConfig(malformedPath)).rejects.toThrowError(/not valid JSON/u);
  });

  it('rejects a non-object root and invalid rule/scenario shapes', () => {
    expect(() => parseConfig([])).toThrowError(/root/u);
    const invalid = cloneExample();
    invalid.rules = [null];
    invalid.scenarios = [null];
    expect(() => parseConfig(invalid)).toThrowError(/rules\[0\] must be an object/u);
    expect(() => parseConfig(invalid)).toThrowError(/scenarios\[0\] must be an object/u);
  });
});
