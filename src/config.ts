import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { ConfigError, errorMessage } from './errors.js';
import type {
  AdapterConfig,
  AssertionConfig,
  JsonValue,
  RuleDriftConfig,
  Severity,
} from './types.js';

export const DEFAULT_CONFIG_FILE = 'rule-drift.config.json';
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const MAX_TIMEOUT_MS = 600_000;

export interface LoadedConfig {
  config: RuleDriftConfig;
  path: string;
  baseDir: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateId(value: unknown, path: string, errors: string[]): value is string {
  if (!hasNonEmptyString(value)) {
    errors.push(`${path} must be a non-empty string`);
    return false;
  }
  if (!ID_PATTERN.test(value)) {
    errors.push(`${path} must match ${ID_PATTERN}`);
    return false;
  }
  return true;
}

function validateTimeout(value: unknown, path: string, errors: string[]): void {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || Number(value) <= 0 || Number(value) > MAX_TIMEOUT_MS)
  ) {
    errors.push(`${path} must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function validateAdapter(value: unknown, errors: string[]): value is AdapterConfig {
  if (!isRecord(value)) {
    errors.push('adapter must be an object');
    return false;
  }

  validateTimeout(value.timeoutMs, 'adapter.timeoutMs', errors);

  if (value.type === 'ollama') {
    if (!hasNonEmptyString(value.model)) {
      errors.push('adapter.model must be a non-empty string');
    }
    if (value.baseUrl !== undefined) {
      if (!hasNonEmptyString(value.baseUrl)) {
        errors.push('adapter.baseUrl must be a non-empty URL string');
      } else {
        try {
          const parsed = new URL(value.baseUrl);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            errors.push('adapter.baseUrl must use http or https');
          }
          if (parsed.username !== '' || parsed.password !== '') {
            errors.push('adapter.baseUrl must not include credentials');
          }
        } catch {
          errors.push('adapter.baseUrl must be a valid URL');
        }
      }
    }
    if (value.options !== undefined && (!isRecord(value.options) || !isJsonValue(value.options))) {
      errors.push('adapter.options must contain JSON-compatible values');
    }
    if (value.think !== undefined && typeof value.think !== 'boolean') {
      errors.push('adapter.think must be a boolean');
    }
    return true;
  }

  if (value.type === 'command') {
    if (!hasNonEmptyString(value.command)) {
      errors.push('adapter.command must be a non-empty string');
    }
    if (
      value.args !== undefined &&
      (!Array.isArray(value.args) || !value.args.every((item) => typeof item === 'string'))
    ) {
      errors.push('adapter.args must be an array of strings');
    }
    if (value.cwd !== undefined && !hasNonEmptyString(value.cwd)) {
      errors.push('adapter.cwd must be a non-empty string');
    }
    return true;
  }

  errors.push('adapter.type must be "ollama" or "command"');
  return false;
}

function validateAssertion(
  value: unknown,
  path: string,
  errors: string[],
): value is AssertionConfig {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }

  if (value.type === 'contains' || value.type === 'notContains' || value.type === 'equals') {
    if (typeof value.value !== 'string') {
      errors.push(`${path}.value must be a string`);
    }
    if (value.caseSensitive !== undefined && typeof value.caseSensitive !== 'boolean') {
      errors.push(`${path}.caseSensitive must be a boolean`);
    }
    return true;
  }

  if (value.type === 'matches') {
    if (typeof value.pattern !== 'string') {
      errors.push(`${path}.pattern must be a string`);
      return true;
    }
    if (value.flags !== undefined && typeof value.flags !== 'string') {
      errors.push(`${path}.flags must be a string`);
      return true;
    }
    try {
      new RegExp(value.pattern, typeof value.flags === 'string' ? value.flags : undefined);
    } catch (error) {
      errors.push(`${path} contains an invalid regular expression: ${errorMessage(error)}`);
    }
    return true;
  }

  errors.push(`${path}.type must be contains, notContains, equals, or matches`);
  return false;
}

function validateRules(value: unknown, errors: string[]): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('rules must be a non-empty array');
    return ids;
  }

  for (const [index, rule] of value.entries()) {
    const path = `rules[${index}]`;
    if (!isRecord(rule)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    if (validateId(rule.id, `${path}.id`, errors)) {
      if (ids.has(rule.id)) {
        errors.push(`${path}.id duplicates rule ${JSON.stringify(rule.id)}`);
      }
      ids.add(rule.id);
    }
    if (!hasNonEmptyString(rule.instruction)) {
      errors.push(`${path}.instruction must be a non-empty string`);
    }
    if (
      rule.severity !== undefined &&
      !(new Set<Severity>(['critical', 'warning', 'info']) as Set<unknown>).has(rule.severity)
    ) {
      errors.push(`${path}.severity must be critical, warning, or info`);
    }
  }
  return ids;
}

function validateScenarios(value: unknown, ruleIds: Set<string>, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('scenarios must be a non-empty array');
    return;
  }

  const scenarioIds = new Set<string>();
  for (const [scenarioIndex, scenario] of value.entries()) {
    const path = `scenarios[${scenarioIndex}]`;
    if (!isRecord(scenario)) {
      errors.push(`${path} must be an object`);
      continue;
    }

    if (validateId(scenario.id, `${path}.id`, errors)) {
      if (scenarioIds.has(scenario.id)) {
        errors.push(`${path}.id duplicates scenario ${JSON.stringify(scenario.id)}`);
      }
      scenarioIds.add(scenario.id);
    }
    if (scenario.description !== undefined && typeof scenario.description !== 'string') {
      errors.push(`${path}.description must be a string`);
    }

    const turns = scenario.turns;
    if (!Array.isArray(turns)) {
      errors.push(`${path}.turns must be an array`);
    } else {
      for (const [turnIndex, turn] of turns.entries()) {
        if (!isRecord(turn) || !hasNonEmptyString(turn.prompt)) {
          errors.push(`${path}.turns[${turnIndex}].prompt must be a non-empty string`);
        }
      }
    }

    if (!Array.isArray(scenario.probes) || scenario.probes.length === 0) {
      errors.push(`${path}.probes must be a non-empty array`);
      continue;
    }

    const probeIds = new Set<string>();
    for (const [probeIndex, probe] of scenario.probes.entries()) {
      const probePath = `${path}.probes[${probeIndex}]`;
      if (!isRecord(probe)) {
        errors.push(`${probePath} must be an object`);
        continue;
      }
      if (validateId(probe.id, `${probePath}.id`, errors)) {
        if (probeIds.has(probe.id)) {
          errors.push(`${probePath}.id duplicates probe ${JSON.stringify(probe.id)}`);
        }
        probeIds.add(probe.id);
      }
      if (!hasNonEmptyString(probe.ruleId) || !ruleIds.has(probe.ruleId)) {
        errors.push(`${probePath}.ruleId must reference a configured rule`);
      }
      const maxTurn = Array.isArray(turns) ? turns.length : 0;
      if (
        !Number.isInteger(probe.afterTurn) ||
        Number(probe.afterTurn) < 0 ||
        Number(probe.afterTurn) > maxTurn
      ) {
        errors.push(`${probePath}.afterTurn must be an integer between 0 and ${maxTurn}`);
      }
      if (!hasNonEmptyString(probe.prompt)) {
        errors.push(`${probePath}.prompt must be a non-empty string`);
      }
      if (!Array.isArray(probe.assertions) || probe.assertions.length === 0) {
        errors.push(`${probePath}.assertions must be a non-empty array`);
      } else {
        for (const [assertionIndex, assertion] of probe.assertions.entries()) {
          validateAssertion(assertion, `${probePath}.assertions[${assertionIndex}]`, errors);
        }
      }
    }
  }
}

export function parseConfig(value: unknown): RuleDriftConfig {
  const errors: string[] = [];
  if (!isRecord(value)) {
    throw new ConfigError('Configuration root must be a JSON object.');
  }

  if (value.version !== 1) {
    errors.push('version must be 1');
  }
  if (!hasNonEmptyString(value.name)) {
    errors.push('name must be a non-empty string');
  }
  if (value.systemPrompt !== undefined && typeof value.systemPrompt !== 'string') {
    errors.push('systemPrompt must be a string');
  }

  validateAdapter(value.adapter, errors);
  const ruleIds = validateRules(value.rules, errors);
  validateScenarios(value.scenarios, ruleIds, errors);

  if (errors.length > 0) {
    throw new ConfigError(`Invalid RuleDrift configuration:\n- ${errors.join('\n- ')}`);
  }

  return value as unknown as RuleDriftConfig;
}

export async function loadConfig(configPath = DEFAULT_CONFIG_FILE): Promise<LoadedConfig> {
  const absolutePath = resolve(configPath);
  let source: string;
  try {
    source = await readFile(absolutePath, 'utf8');
  } catch (error) {
    throw new ConfigError(
      `Could not read configuration at ${absolutePath}: ${errorMessage(error)}`,
      {
        cause: error,
      },
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    throw new ConfigError(`Configuration is not valid JSON: ${errorMessage(error)}`, {
      cause: error,
    });
  }

  return {
    config: parseConfig(value),
    path: absolutePath,
    baseDir: dirname(absolutePath),
  };
}
