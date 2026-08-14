import type { ProbeResult, ReportOptions, RunReport } from '../types.js';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function probeCase(
  suite: string,
  scenarioId: string,
  probe: ProbeResult,
  includeResponses: boolean,
): string {
  const name = `${scenarioId}/${probe.id}`;
  const failure = probe.assertions
    .filter((assertion) => !assertion.passed)
    .map((assertion) => assertion.message)
    .join('; ');
  const response = includeResponses
    ? `<system-out>${escapeXml(probe.response)}</system-out>`
    : `<system-out>responseSha256=${probe.responseSha256}; responseLength=${probe.responseLength}</system-out>`;
  return [
    `  <testcase classname="${escapeXml(suite)}.${escapeXml(scenarioId)}" name="${escapeXml(name)}" time="${(probe.durationMs / 1000).toFixed(3)}">`,
    ...(probe.passed
      ? []
      : [`    <failure message="rule assertion failed">${escapeXml(failure)}</failure>`]),
    `    ${response}`,
    '  </testcase>',
  ].join('\n');
}

export function formatJunit(report: RunReport, options: ReportOptions = {}): string {
  const cases: string[] = [];
  for (const scenario of report.scenarios) {
    for (const probe of scenario.probes) {
      cases.push(probeCase(report.suite, scenario.id, probe, options.includeResponses === true));
    }
    if (scenario.error) {
      cases.push(
        [
          `  <testcase classname="${escapeXml(report.suite)}.${escapeXml(scenario.id)}" name="${escapeXml(`${scenario.id}/${scenario.error.itemId}`)}">`,
          `    <error message="adapter execution failed">${escapeXml(scenario.error.message)}</error>`,
          '  </testcase>',
        ].join('\n'),
      );
    }
  }

  const errors = report.summary.scenariosErrored;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${escapeXml(report.suite)}" tests="${cases.length}" failures="${report.summary.probesFailed}" errors="${errors}" time="${(report.durationMs / 1000).toFixed(3)}">`,
    ...cases,
    '</testsuite>',
    '',
  ].join('\n');
}
