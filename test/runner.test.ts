import { describe, expect, it, vi } from 'vitest';

import { renderSystemMessage, runSuite } from '../src/runner.js';
import type { Adapter, AdapterRequest, RuleDriftConfig } from '../src/types.js';

function suite(): RuleDriftConfig {
  return {
    version: 1,
    name: 'runner-suite',
    systemPrompt: 'Be concise.',
    adapter: { type: 'command', command: 'unused' },
    rules: [
      {
        id: 'codename',
        instruction: 'The codename is ORBIT.',
        severity: 'critical',
      },
      { id: 'unused-rule', instruction: 'Remain concise.', severity: 'info' },
    ],
    scenarios: [
      {
        id: 'conversation',
        description: 'A two-turn test.',
        turns: [{ prompt: 'First distraction' }, { prompt: 'Second distraction' }],
        probes: [
          {
            id: 'baseline',
            ruleId: 'codename',
            afterTurn: 0,
            prompt: 'What is the codename?',
            assertions: [{ type: 'equals', value: 'ORBIT' }],
          },
          {
            id: 'after-two',
            ruleId: 'codename',
            afterTurn: 2,
            prompt: 'What is the codename now?',
            assertions: [{ type: 'equals', value: 'ORBIT' }],
          },
        ],
      },
    ],
  };
}

function mockAdapter(
  implementation: (request: AdapterRequest) => string | Promise<string>,
): Adapter & { requests: AdapterRequest[] } {
  const requests: AdapterRequest[] = [];
  return {
    descriptor: { type: 'command' },
    requests,
    complete: vi.fn((request: AdapterRequest) => {
      requests.push(request);
      return Promise.resolve(implementation(request)).then((content) => ({ content }));
    }),
  };
}

describe('runner', () => {
  it('renders the suite rules into a stable system message', () => {
    const message = renderSystemMessage(suite());
    expect(message).toContain('Be concise.');
    expect(message).toContain('[critical] codename: The codename is ORBIT.');
    expect(message).toContain('[info] unused-rule: Remain concise.');
  });

  it('runs probes on isolated snapshots and summarizes a passing suite', async () => {
    const adapter = mockAdapter((request) =>
      request.context.kind === 'probe' ? 'ORBIT' : 'background answer',
    );
    const report = await runSuite(suite(), adapter);

    expect(report.summary).toMatchObject({
      status: 'passed',
      probes: 2,
      probesPassed: 2,
      passRate: 100,
      scenariosPassed: 1,
    });
    expect(report.rules).toEqual([
      expect.objectContaining({ id: 'codename', status: 'passed', passRate: 100 }),
      expect.objectContaining({ id: 'unused-rule', status: 'not-run', passRate: null }),
    ]);
    expect(adapter.requests.map((request) => request.context.itemId)).toEqual([
      'baseline',
      'turn-1',
      'turn-2',
      'after-two',
    ]);
    expect(adapter.requests[1]?.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
    ]);
    expect(adapter.requests[3]?.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
    ]);
    expect(report.scenarios[0]?.probes[0]?.responseSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('reports the first failing boundary and keeps running the scenario', async () => {
    const adapter = mockAdapter((request) =>
      request.context.itemId === 'after-two'
        ? 'NOVA'
        : request.context.kind === 'probe'
          ? 'ORBIT'
          : 'background',
    );
    const report = await runSuite(suite(), adapter);

    expect(report.summary).toMatchObject({ status: 'failed', probesFailed: 1, passRate: 50 });
    expect(report.rules[0]).toMatchObject({
      status: 'failed',
      firstFailure: { scenarioId: 'conversation', probeId: 'after-two', afterTurn: 2 },
    });
    expect(report.scenarios[0]).toMatchObject({ status: 'failed' });
  });

  it('records adapter failures without losing completed probes', async () => {
    const adapter = mockAdapter((request) => {
      if (request.context.itemId === 'turn-1') throw new Error('local model stopped');
      return 'ORBIT';
    });
    const report = await runSuite(suite(), adapter);

    expect(report.summary).toMatchObject({ status: 'error', scenariosErrored: 1, probes: 1 });
    expect(report.scenarios[0]).toMatchObject({
      status: 'error',
      error: { itemId: 'turn-1', kind: 'turn', message: 'local model stopped' },
    });
  });

  it('records a probe adapter failure', async () => {
    const adapter = mockAdapter(() => Promise.reject(new Error('offline')));
    const report = await runSuite(suite(), adapter);
    expect(report.scenarios[0]).toMatchObject({
      status: 'error',
      error: { itemId: 'baseline', kind: 'probe', message: 'offline' },
    });
    expect(report.rules[0]).toMatchObject({ status: 'not-run', total: 0 });
  });
});
