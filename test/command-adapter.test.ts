import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CommandAdapter } from '../src/adapters/command.js';
import { AdapterError } from '../src/errors.js';
import type { AdapterRequest } from '../src/types.js';

const baseDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const request: AdapterRequest = {
  protocolVersion: 1,
  messages: [
    { role: 'system', content: 'The codename is ORBIT.' },
    { role: 'user', content: 'What is the codename?' },
  ],
  context: { scenarioId: 'test', kind: 'probe', itemId: 'probe', afterTurn: 0 },
};

describe('command adapter', () => {
  it('uses strict JSON over stdin/stdout', async () => {
    const adapter = new CommandAdapter(
      { type: 'command', command: 'node', args: ['./command-adapter.mjs'] },
      baseDir,
    );
    await expect(adapter.complete(request)).resolves.toEqual({ content: 'ORBIT' });
    expect(adapter.descriptor).toEqual({ type: 'command' });
  });

  it('resolves an explicit relative working directory', async () => {
    const adapter = new CommandAdapter(
      {
        type: 'command',
        command: 'node',
        args: ['./command-adapter.mjs'],
        cwd: './fixtures',
      },
      fileURLToPath(new URL('./', import.meta.url)),
    );
    await expect(adapter.complete(request)).resolves.toEqual({ content: 'ORBIT' });
  });

  it('rejects invalid JSON and invalid response shapes', async () => {
    const invalidJson = new CommandAdapter(
      { type: 'command', command: 'node', args: ['--eval', "process.stdout.write('nope')"] },
      baseDir,
    );
    await expect(invalidJson.complete(request)).rejects.toThrowError(/invalid JSON/u);

    const invalidShape = new CommandAdapter(
      {
        type: 'command',
        command: 'node',
        args: ['--eval', "process.stdout.write(JSON.stringify({wrong:'field'}))"],
      },
      baseDir,
    );
    await expect(invalidShape.complete(request)).rejects.toThrowError(/string content field/u);
  });

  it('redacts stderr from a non-zero process', async () => {
    const adapter = new CommandAdapter(
      {
        type: 'command',
        command: 'node',
        args: ['--eval', "process.stderr.write('api_key=supersecret'); process.exitCode = 2"],
      },
      baseDir,
    );
    await expect(adapter.complete(request)).rejects.toThrowError(/api_key=\[REDACTED\]/u);
    await expect(adapter.complete(request)).rejects.not.toThrowError(/supersecret/u);
  });

  it('enforces timeout and output limits', async () => {
    const timeout = new CommandAdapter(
      {
        type: 'command',
        command: 'node',
        args: ['--eval', 'setTimeout(() => {}, 5000)'],
        timeoutMs: 20,
      },
      baseDir,
    );
    await expect(timeout.complete(request)).rejects.toThrowError(/timed out/u);

    const oversized = new CommandAdapter(
      {
        type: 'command',
        command: 'node',
        args: ['--eval', "process.stdout.write('x'.repeat(1048577))"],
      },
      baseDir,
    );
    await expect(oversized.complete(request)).rejects.toThrowError(/output exceeded/u);
  });

  it('reports startup failures', async () => {
    const adapter = new CommandAdapter(
      { type: 'command', command: 'rule-drift-command-that-does-not-exist' },
      baseDir,
    );
    await expect(adapter.complete(request)).rejects.toBeInstanceOf(AdapterError);
    await expect(adapter.complete(request)).rejects.toThrowError(/Could not start/u);
  });
});
