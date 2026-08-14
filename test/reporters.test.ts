import { describe, expect, it } from 'vitest';

import { formatJson, formatJunit, formatPretty, formatReport } from '../src/reporters/index.js';
import type { RunReport } from '../src/types.js';

function failingReport(): RunReport {
  return {
    schemaVersion: 1,
    suite: 'suite<&',
    adapter: { type: 'ollama', model: 'local-model' },
    startedAt: '2026-08-14T00:00:00.000Z',
    durationMs: 1234,
    summary: {
      status: 'failed',
      scenarios: 1,
      scenariosPassed: 0,
      scenariosFailed: 1,
      scenariosErrored: 0,
      probes: 1,
      probesPassed: 0,
      probesFailed: 1,
      passRate: 0,
    },
    rules: [
      {
        id: 'codename',
        severity: 'critical',
        status: 'failed',
        total: 1,
        passed: 0,
        passRate: 0,
        firstFailure: { scenarioId: 'conversation', probeId: 'final', afterTurn: 2 },
      },
      {
        id: 'unused',
        severity: 'info',
        status: 'not-run',
        total: 0,
        passed: 0,
        passRate: null,
      },
    ],
    scenarios: [
      {
        id: 'conversation',
        status: 'failed',
        durationMs: 1000,
        probes: [
          {
            id: 'final',
            ruleId: 'codename',
            afterTurn: 2,
            prompt: 'Codename?',
            response: 'NOVA & wrong',
            responseLength: 12,
            responseSha256: 'abc123',
            durationMs: 50,
            passed: false,
            assertions: [
              {
                assertion: { type: 'equals', value: 'ORBIT' },
                passed: false,
                message: 'expected response to equal "ORBIT"',
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('reporters', () => {
  it('redacts machine-readable responses unless explicitly included', () => {
    const report = failingReport();
    const redacted = formatJson(report);
    expect(redacted).not.toContain('NOVA & wrong');
    expect(redacted).toContain('responseSha256');
    expect(formatJson(report, { includeResponses: true })).toContain('NOVA & wrong');
  });

  it('prints a useful terminal failure report', () => {
    const output = formatPretty(failingReport());
    expect(output).toContain('FAILED · 0/1 probes passed');
    expect(output).toContain('first failure: conversation/final after turn 2');
    expect(output).toContain('expected response to equal');
    expect(output).toContain('Response: "NOVA & wrong"');
    expect(output).not.toContain('\u001B[');

    expect(formatPretty(failingReport(), { color: true })).toContain('\u001B[');
  });

  it('produces escaped JUnit with response hashes by default', () => {
    const output = formatJunit(failingReport());
    expect(output).toContain('<testsuite name="suite&lt;&amp;" tests="1" failures="1"');
    expect(output).toContain('<failure message="rule assertion failed">');
    expect(output).toContain('responseSha256=abc123');
    expect(output).not.toContain('NOVA &amp; wrong');
    expect(formatJunit(failingReport(), { includeResponses: true })).toContain('NOVA &amp; wrong');
  });

  it('includes scenario adapter errors in JUnit and selects reporters', () => {
    const report = failingReport();
    report.summary.status = 'error';
    report.summary.scenariosErrored = 1;
    report.summary.scenariosFailed = 0;
    report.scenarios[0] = {
      id: 'conversation',
      status: 'error',
      durationMs: 10,
      probes: [],
      error: { afterTurn: 0, itemId: 'turn-1', kind: 'turn', message: 'offline <now>' },
    };
    const junit = formatReport(report, 'junit');
    expect(junit).toContain(
      '<error message="adapter execution failed">offline &lt;now&gt;</error>',
    );
    expect(formatReport(report, 'json')).toContain('"schemaVersion": 1');
    expect(formatReport(report, 'pretty')).toContain('Error at turn-1: offline <now>');
  });
});
