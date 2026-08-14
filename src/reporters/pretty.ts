import { truncate } from '../redact.js';
import type { ReportOptions, RunReport } from '../types.js';

const ANSI = {
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  green: '\u001B[32m',
  red: '\u001B[31m',
  reset: '\u001B[0m',
  yellow: '\u001B[33m',
};

function paint(value: string, code: string, color: boolean): string {
  return color ? `${code}${value}${ANSI.reset}` : value;
}

function statusSymbol(status: 'error' | 'failed' | 'not-run' | 'passed'): string {
  switch (status) {
    case 'passed':
      return '✓';
    case 'failed':
      return '✗';
    case 'error':
      return '!';
    case 'not-run':
      return '–';
  }
}

function statusColor(status: 'error' | 'failed' | 'not-run' | 'passed'): string {
  return status === 'passed' ? ANSI.green : status === 'not-run' ? ANSI.yellow : ANSI.red;
}

export function formatPretty(report: RunReport, options: ReportOptions = {}): string {
  const color = options.color ?? false;
  const adapter =
    report.adapter.type === 'ollama'
      ? `ollama (${report.adapter.model ?? 'unknown model'})`
      : 'command';
  const lines = [
    paint('RuleDrift', ANSI.bold, color),
    `${report.suite} · ${adapter}`,
    '',
    paint(
      `${report.summary.status.toUpperCase()} · ${report.summary.probesPassed}/${report.summary.probes} probes passed · ${report.durationMs} ms`,
      statusColor(report.summary.status),
      color,
    ),
    '',
    paint('Rules', ANSI.bold, color),
  ];

  for (const rule of report.rules) {
    const rate = rule.passRate === null ? 'not run' : `${rule.passRate.toFixed(2)}%`;
    const failure = rule.firstFailure
      ? ` · first failure: ${rule.firstFailure.scenarioId}/${rule.firstFailure.probeId} after turn ${rule.firstFailure.afterTurn}`
      : '';
    lines.push(
      paint(
        `${statusSymbol(rule.status)} ${rule.id} [${rule.severity}] · ${rate}${failure}`,
        statusColor(rule.status),
        color,
      ),
    );
  }

  lines.push('', paint('Scenarios', ANSI.bold, color));
  for (const scenario of report.scenarios) {
    lines.push(
      paint(
        `${statusSymbol(scenario.status)} ${scenario.id} · ${scenario.probes.filter((probe) => probe.passed).length}/${scenario.probes.length} probes · ${scenario.durationMs} ms`,
        statusColor(scenario.status),
        color,
      ),
    );
    if (scenario.error) {
      lines.push(`  Error at ${scenario.error.itemId}: ${scenario.error.message}`);
    }
    for (const probe of scenario.probes.filter((item) => !item.passed)) {
      lines.push(`  ${probe.id} (rule ${probe.ruleId}, after turn ${probe.afterTurn})`);
      for (const assertion of probe.assertions.filter((item) => !item.passed)) {
        lines.push(`    - ${assertion.message}`);
      }
      lines.push(`    Response: ${JSON.stringify(truncate(probe.response, 240))}`);
    }
  }

  lines.push('', paint('Machine-readable reports omit response text by default.', ANSI.dim, color));
  return `${lines.join('\n')}\n`;
}
