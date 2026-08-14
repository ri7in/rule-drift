import { spawn } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';

import { AdapterError, errorMessage } from '../errors.js';
import { redactSensitive, truncate } from '../redact.js';
import type { Adapter, AdapterRequest, AdapterResponse, CommandAdapterConfig } from '../types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 1_048_576;

interface CommandResponse {
  content: string;
}

function parseResponse(stdout: string): CommandResponse {
  let value: unknown;
  try {
    value = JSON.parse(stdout) as unknown;
  } catch (error) {
    throw new AdapterError(
      `Command adapter returned invalid JSON: ${errorMessage(error)}. ` +
        'Expected an object such as {"content":"response"}.',
      { cause: error },
    );
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    !('content' in value) ||
    typeof value.content !== 'string'
  ) {
    throw new AdapterError(
      'Command adapter response must be a JSON object with a string content field.',
    );
  }
  return { content: value.content };
}

export class CommandAdapter implements Adapter {
  public readonly descriptor = { type: 'command' as const };
  readonly #command: string;
  readonly #args: string[];
  readonly #cwd: string;
  readonly #timeoutMs: number;

  public constructor(config: CommandAdapterConfig, baseDir: string) {
    this.#command = config.command;
    this.#args = config.args ?? [];
    this.#cwd = config.cwd
      ? isAbsolute(config.cwd)
        ? config.cwd
        : resolve(baseDir, config.cwd)
      : baseDir;
    this.#timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async complete(request: AdapterRequest): Promise<AdapterResponse> {
    return await new Promise<AdapterResponse>((resolvePromise, rejectPromise) => {
      const child = spawn(this.#command, this.#args, {
        cwd: this.#cwd,
        env: process.env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const settle = (result: AdapterResponse | Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (result instanceof Error) {
          rejectPromise(result);
        } else {
          resolvePromise(result);
        }
      };

      const capture = (current: string, chunk: Buffer): string => {
        const next = current + chunk.toString('utf8');
        if (Buffer.byteLength(next) > MAX_OUTPUT_BYTES) {
          child.kill('SIGTERM');
          settle(new AdapterError(`Command adapter output exceeded ${MAX_OUTPUT_BYTES} bytes.`));
        }
        return next;
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = capture(stdout, chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = capture(stderr, chunk);
      });
      child.on('error', (error) => {
        settle(
          new AdapterError(`Could not start command adapter: ${errorMessage(error)}`, {
            cause: error,
          }),
        );
      });
      child.on('close', (code, signal) => {
        if (code !== 0) {
          const detail = truncate(redactSensitive(stderr.trim()), 500);
          settle(
            new AdapterError(
              `Command adapter exited with ${signal ? `signal ${signal}` : `code ${String(code)}`}${detail ? `: ${detail}` : ''}`,
            ),
          );
          return;
        }
        try {
          settle(parseResponse(stdout));
        } catch (error) {
          settle(error instanceof Error ? error : new AdapterError(errorMessage(error)));
        }
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        settle(new AdapterError(`Command adapter timed out after ${this.#timeoutMs} ms.`));
      }, this.#timeoutMs);

      child.stdin.on('error', (error) => {
        settle(
          new AdapterError(`Could not write to command adapter: ${errorMessage(error)}`, {
            cause: error,
          }),
        );
      });
      child.stdin.end(`${JSON.stringify(request)}\n`);
    });
  }
}
