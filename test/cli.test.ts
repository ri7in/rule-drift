import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EXIT, parseArguments, runCli } from '../src/cli.js';
import type { RuleDriftConfig } from '../src/types.js';

function io() {
  const output = { stdout: '', stderr: '' };
  return {
    output,
    value: {
      stdout: (value: string) => {
        output.stdout += value;
      },
      stderr: (value: string) => {
        output.stderr += value;
      },
      isTty: false,
    },
  };
}

function commandSuite(expected = 'ORBIT'): RuleDriftConfig {
  const adapterPath = fileURLToPath(new URL('./fixtures/command-adapter.mjs', import.meta.url));
  return {
    version: 1,
    name: 'cli-suite',
    adapter: { type: 'command', command: 'node', args: [adapterPath], timeoutMs: 5000 },
    rules: [{ id: 'codename', instruction: 'The codename is ORBIT.' }],
    scenarios: [
      {
        id: 'smoke',
        turns: [],
        probes: [
          {
            id: 'probe',
            ruleId: 'codename',
            afterTurn: 0,
            prompt: 'What is the codename?',
            assertions: [{ type: 'equals', value: expected }],
          },
        ],
      },
    ],
  };
}

describe('CLI', () => {
  it('parses static, init, validate, and test arguments', () => {
    expect(parseArguments([])).toEqual({ command: 'help' });
    expect(parseArguments(['--version'])).toEqual({ command: 'version' });
    expect(parseArguments(['init', '--config', 'custom.json', '--force'])).toEqual({
      command: 'init',
      config: 'custom.json',
      force: true,
    });
    expect(parseArguments(['validate', '-c', 'suite.json'])).toEqual({
      command: 'validate',
      config: 'suite.json',
    });
    expect(parseArguments(['mcp', '--root', 'workspace'])).toEqual({
      command: 'mcp',
      root: 'workspace',
    });
    expect(
      parseArguments([
        'test',
        '-c',
        'suite.json',
        '-r',
        'json',
        '-o',
        'report.json',
        '--include-responses',
        '--no-color',
        '--quiet',
      ]),
    ).toMatchObject({
      command: 'test',
      config: 'suite.json',
      reporter: 'json',
      output: 'report.json',
      includeResponses: true,
      color: false,
      quiet: true,
    });
  });

  it('rejects unknown commands, options, reporters, and missing values', () => {
    expect(() => parseArguments(['unknown'])).toThrowError(/Unknown command/u);
    expect(() => parseArguments(['init', '--wat'])).toThrowError(/Unknown init option/u);
    expect(() => parseArguments(['validate', '--wat'])).toThrowError(/Unknown validate option/u);
    expect(() => parseArguments(['mcp', '--wat'])).toThrowError(/Unknown mcp option/u);
    expect(() => parseArguments(['test', '--wat'])).toThrowError(/Unknown test option/u);
    expect(() => parseArguments(['test', '--reporter', 'html'])).toThrowError(/must be pretty/u);
    expect(() => parseArguments(['test', '--config'])).toThrowError(/requires a value/u);
  });

  it('shows help/version and maps usage errors to stable exit codes', async () => {
    const help = io();
    await expect(runCli([], help.value)).resolves.toBe(EXIT.success);
    expect(help.output.stdout).toContain('RuleDrift 0.1.0');
    expect(help.output.stdout).toContain('64 invalid usage');

    const version = io();
    await expect(runCli(['--version'], version.value)).resolves.toBe(EXIT.success);
    expect(version.output.stdout).toBe('0.1.0\n');

    const invalid = io();
    await expect(runCli(['unknown'], invalid.value)).resolves.toBe(EXIT.usage);
    expect(invalid.output.stderr).toContain('Run rule-drift --help');
  });

  it('initializes and validates a suite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rule-drift-cli-init-'));
    const path = join(directory, 'suite.json');
    const init = io();
    await expect(runCli(['init', '--config', path], init.value)).resolves.toBe(EXIT.success);
    expect(init.output.stdout).toContain('Created');

    const validate = io();
    await expect(runCli(['validate', '--config', path], validate.value)).resolves.toBe(
      EXIT.success,
    );
    expect(validate.output.stdout).toContain('1 rules, 1 scenarios');
  });

  it('runs a passing suite and writes a redacted JSON report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rule-drift-cli-test-'));
    const configPath = join(directory, 'suite.json');
    const outputPath = join(directory, 'report.json');
    await writeFile(configPath, JSON.stringify(commandSuite()));
    const terminal = io();

    await expect(
      runCli(
        ['test', '--config', configPath, '--reporter', 'json', '--output', outputPath],
        terminal.value,
      ),
    ).resolves.toBe(EXIT.success);
    expect(terminal.output.stdout).toContain('RuleDrift PASSED');
    const report = await readFile(outputPath, 'utf8');
    expect(report).toContain('"status": "passed"');
    expect(report).not.toContain('"response":');
  });

  it('returns distinct rule, configuration, and adapter exits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rule-drift-cli-exits-'));
    const failedPath = join(directory, 'failed.json');
    await writeFile(failedPath, JSON.stringify(commandSuite('NOVA')));
    await expect(runCli(['test', '--config', failedPath, '--quiet'], io().value)).resolves.toBe(
      EXIT.failed,
    );

    await expect(
      runCli(['validate', '--config', join(directory, 'missing.json')], io().value),
    ).resolves.toBe(EXIT.config);

    const adapterConfig = commandSuite();
    adapterConfig.adapter = { type: 'command', command: 'missing-rule-drift-adapter' };
    const adapterPath = join(directory, 'adapter.json');
    await writeFile(adapterPath, JSON.stringify(adapterConfig));
    await expect(runCli(['test', '--config', adapterPath, '--quiet'], io().value)).resolves.toBe(
      EXIT.adapter,
    );
  });
});
