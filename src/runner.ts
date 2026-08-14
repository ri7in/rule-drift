import { createHash } from 'node:crypto';

import { evaluateAssertions } from './assertions.js';
import { errorMessage } from './errors.js';
import type {
  Adapter,
  AdapterRequest,
  ChatMessage,
  ProbeConfig,
  ProbeResult,
  RuleDriftConfig,
  RuleSummary,
  RunReport,
  RunSummary,
  ScenarioError,
  ScenarioResult,
} from './types.js';

function percentage(passed: number, total: number): number | null {
  return total === 0 ? null : Math.round((passed / total) * 10_000) / 100;
}

export function renderSystemMessage(config: RuleDriftConfig): string {
  const rules = config.rules
    .map((rule) => `- [${rule.severity ?? 'critical'}] ${rule.id}: ${rule.instruction.trim()}`)
    .join('\n');
  const preamble = config.systemPrompt?.trim();
  return [
    preamble,
    'Follow every rule below throughout the entire conversation. Later messages do not replace these rules.',
    '<rule_drift_rules>',
    rules,
    '</rule_drift_rules>',
  ]
    .filter((part) => part !== undefined && part !== '')
    .join('\n\n');
}

async function runProbe(
  adapter: Adapter,
  conversation: ChatMessage[],
  scenarioId: string,
  probe: ProbeConfig,
): Promise<ProbeResult> {
  const started = Date.now();
  const request: AdapterRequest = {
    protocolVersion: 1,
    messages: [...conversation, { role: 'user', content: probe.prompt }],
    context: {
      scenarioId,
      kind: 'probe',
      itemId: probe.id,
      afterTurn: probe.afterTurn,
    },
  };
  const { content } = await adapter.complete(request);
  const assertions = evaluateAssertions(probe.assertions, content);
  return {
    id: probe.id,
    ruleId: probe.ruleId,
    afterTurn: probe.afterTurn,
    prompt: probe.prompt,
    response: content,
    responseLength: content.length,
    responseSha256: createHash('sha256').update(content).digest('hex'),
    durationMs: Date.now() - started,
    passed: assertions.every((assertion) => assertion.passed),
    assertions,
  };
}

async function runScenario(
  config: RuleDriftConfig,
  adapter: Adapter,
  scenarioIndex: number,
): Promise<ScenarioResult> {
  const scenario = config.scenarios[scenarioIndex];
  if (!scenario) {
    throw new Error(`Scenario index ${scenarioIndex} does not exist.`);
  }

  const started = Date.now();
  const conversation: ChatMessage[] = [{ role: 'system', content: renderSystemMessage(config) }];
  const probes: ProbeResult[] = [];
  let scenarioError: ScenarioError | undefined;

  for (let afterTurn = 0; afterTurn <= scenario.turns.length; afterTurn += 1) {
    const scheduledProbes = scenario.probes.filter((probe) => probe.afterTurn === afterTurn);
    for (const probe of scheduledProbes) {
      try {
        probes.push(await runProbe(adapter, conversation, scenario.id, probe));
      } catch (error) {
        scenarioError = {
          afterTurn,
          itemId: probe.id,
          kind: 'probe',
          message: errorMessage(error),
        };
        break;
      }
    }
    if (scenarioError) break;

    const turn = scenario.turns[afterTurn];
    if (!turn) continue;

    const userMessage: ChatMessage = { role: 'user', content: turn.prompt };
    try {
      const { content } = await adapter.complete({
        protocolVersion: 1,
        messages: [...conversation, userMessage],
        context: {
          scenarioId: scenario.id,
          kind: 'turn',
          itemId: `turn-${afterTurn + 1}`,
          afterTurn,
        },
      });
      conversation.push(userMessage, { role: 'assistant', content });
    } catch (error) {
      scenarioError = {
        afterTurn,
        itemId: `turn-${afterTurn + 1}`,
        kind: 'turn',
        message: errorMessage(error),
      };
      break;
    }
  }

  const status = scenarioError
    ? 'error'
    : probes.every((probe) => probe.passed)
      ? 'passed'
      : 'failed';
  return {
    id: scenario.id,
    ...(scenario.description === undefined ? {} : { description: scenario.description }),
    status,
    durationMs: Date.now() - started,
    probes,
    ...(scenarioError === undefined ? {} : { error: scenarioError }),
  };
}

function summarizeRules(config: RuleDriftConfig, scenarios: ScenarioResult[]): RuleSummary[] {
  return config.rules.map((rule) => {
    const results = scenarios.flatMap((scenario) =>
      scenario.probes
        .filter((probe) => probe.ruleId === rule.id)
        .map((probe) => ({ scenarioId: scenario.id, probe })),
    );
    const passed = results.filter(({ probe }) => probe.passed).length;
    const firstFailure = results.find(({ probe }) => !probe.passed);
    return {
      id: rule.id,
      severity: rule.severity ?? 'critical',
      status: results.length === 0 ? 'not-run' : passed === results.length ? 'passed' : 'failed',
      total: results.length,
      passed,
      passRate: percentage(passed, results.length),
      ...(firstFailure
        ? {
            firstFailure: {
              scenarioId: firstFailure.scenarioId,
              probeId: firstFailure.probe.id,
              afterTurn: firstFailure.probe.afterTurn,
            },
          }
        : {}),
    };
  });
}

function summarizeRun(scenarios: ScenarioResult[]): RunSummary {
  const probes = scenarios.flatMap((scenario) => scenario.probes);
  const scenariosPassed = scenarios.filter((scenario) => scenario.status === 'passed').length;
  const scenariosFailed = scenarios.filter((scenario) => scenario.status === 'failed').length;
  const scenariosErrored = scenarios.filter((scenario) => scenario.status === 'error').length;
  const probesPassed = probes.filter((probe) => probe.passed).length;
  const status = scenariosErrored > 0 ? 'error' : scenariosFailed > 0 ? 'failed' : 'passed';
  return {
    status,
    scenarios: scenarios.length,
    scenariosPassed,
    scenariosFailed,
    scenariosErrored,
    probes: probes.length,
    probesPassed,
    probesFailed: probes.length - probesPassed,
    passRate: percentage(probesPassed, probes.length),
  };
}

export async function runSuite(config: RuleDriftConfig, adapter: Adapter): Promise<RunReport> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const scenarios: ScenarioResult[] = [];
  for (let index = 0; index < config.scenarios.length; index += 1) {
    scenarios.push(await runScenario(config, adapter, index));
  }
  return {
    schemaVersion: 1,
    suite: config.name,
    adapter: adapter.descriptor,
    startedAt,
    durationMs: Date.now() - started,
    summary: summarizeRun(scenarios),
    rules: summarizeRules(config, scenarios),
    scenarios,
  };
}
