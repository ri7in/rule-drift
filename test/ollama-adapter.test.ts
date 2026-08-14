import { afterEach, describe, expect, it, vi } from 'vitest';

import { OllamaAdapter } from '../src/adapters/ollama.js';
import type { AdapterRequest } from '../src/types.js';

const request: AdapterRequest = {
  protocolVersion: 1,
  messages: [
    { role: 'system', content: 'Follow ORBIT.' },
    { role: 'user', content: 'Codename?' },
  ],
  context: { scenarioId: 'test', kind: 'probe', itemId: 'probe', afterTurn: 0 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Ollama adapter', () => {
  it('calls the local chat API with the configured model and options', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: { role: 'assistant', content: 'ORBIT' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new OllamaAdapter({
      type: 'ollama',
      model: 'qwen3:1.7b',
      baseUrl: 'http://127.0.0.1:11434/custom/',
      think: false,
      options: { temperature: 0, seed: 42 },
    });

    await expect(adapter.complete(request)).resolves.toEqual({ content: 'ORBIT' });
    expect(adapter.descriptor).toEqual({ type: 'ollama', model: 'qwen3:1.7b' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe('http://127.0.0.1:11434/custom/api/chat');
    const body = call?.[1]?.body;
    if (typeof body !== 'string') throw new Error('Expected fetch body to be a string.');
    expect(JSON.parse(body)).toMatchObject({
      model: 'qwen3:1.7b',
      stream: false,
      think: false,
      options: { temperature: 0, seed: 42 },
      messages: request.messages,
    });
  });

  it('redacts non-success responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('api_key=supersecret', { status: 500 }))),
    );
    const adapter = new OllamaAdapter({ type: 'ollama', model: 'model' });
    await expect(adapter.complete(request)).rejects.toThrowError(/api_key=\[REDACTED\]/u);
    await expect(adapter.complete(request)).rejects.not.toThrowError(/supersecret/u);
  });

  it('rejects malformed and unexpected responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not-json', { status: 200 }))),
    );
    const adapter = new OllamaAdapter({ type: 'ollama', model: 'model' });
    await expect(adapter.complete(request)).rejects.toThrowError(/invalid JSON/u);

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ message: {} }), { status: 200 }))),
    );
    await expect(adapter.complete(request)).rejects.toThrowError(/unexpected response shape/u);
  });

  it('explains connection and timeout errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('connection refused'))),
    );
    const adapter = new OllamaAdapter({ type: 'ollama', model: 'model' });
    await expect(adapter.complete(request)).rejects.toThrowError(/Is Ollama running/u);

    const timeoutError = new Error('timed out');
    timeoutError.name = 'TimeoutError';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(timeoutError)),
    );
    await expect(adapter.complete(request)).rejects.toThrowError(/timed out after/u);
  });
});
