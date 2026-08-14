import { AdapterError, errorMessage } from '../errors.js';
import { redactSensitive, truncate } from '../redact.js';
import type { Adapter, AdapterRequest, AdapterResponse, OllamaAdapterConfig } from '../types.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_TIMEOUT_MS = 120_000;

function endpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/u, '')}/api/chat`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function parseOllamaResponse(value: unknown): AdapterResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('message' in value) ||
    typeof value.message !== 'object' ||
    value.message === null ||
    !('content' in value.message) ||
    typeof value.message.content !== 'string'
  ) {
    throw new AdapterError('Ollama returned an unexpected response shape.');
  }
  return { content: value.message.content };
}

export class OllamaAdapter implements Adapter {
  public readonly descriptor;
  readonly #model: string;
  readonly #endpoint: string;
  readonly #options;
  readonly #think: boolean | undefined;
  readonly #timeoutMs: number;

  public constructor(config: OllamaAdapterConfig) {
    this.#model = config.model;
    this.#endpoint = endpoint(config.baseUrl ?? DEFAULT_BASE_URL);
    this.#options = config.options;
    this.#think = config.think;
    this.#timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.descriptor = { type: 'ollama' as const, model: config.model };
  }

  public async complete(request: AdapterRequest): Promise<AdapterResponse> {
    let response: Response;
    try {
      response = await fetch(this.#endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.#model,
          messages: request.messages,
          stream: false,
          ...(this.#think === undefined ? {} : { think: this.#think }),
          ...(this.#options ? { options: this.#options } : {}),
        }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      const timeout = error instanceof Error && error.name === 'TimeoutError';
      throw new AdapterError(
        timeout
          ? `Ollama timed out after ${this.#timeoutMs} ms.`
          : `Could not reach Ollama at ${this.#endpoint}. Is Ollama running? ${errorMessage(error)}`,
        { cause: error },
      );
    }

    if (!response.ok) {
      const detail = truncate(redactSensitive(await response.text()), 500);
      throw new AdapterError(
        `Ollama returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }

    let value: unknown;
    try {
      value = await response.json();
    } catch (error) {
      throw new AdapterError(`Ollama returned invalid JSON: ${errorMessage(error)}`, {
        cause: error,
      });
    }
    return parseOllamaResponse(value);
  }
}
