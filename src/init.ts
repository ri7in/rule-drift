import { constants } from 'node:fs';
import { access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DEFAULT_CONFIG_FILE } from './config.js';
import { ConfigError, errorMessage } from './errors.js';
import type { RuleDriftConfig } from './types.js';

export const EXAMPLE_CONFIG: RuleDriftConfig & { $schema: string } = {
  $schema: 'https://raw.githubusercontent.com/ri7in/rule-drift/main/schema/rule-drift.schema.json',
  version: 1,
  name: 'instruction-retention-example',
  systemPrompt: 'You are a concise project assistant.',
  adapter: {
    type: 'ollama',
    model: 'qwen3:1.7b',
    think: false,
    timeoutMs: 120_000,
    options: {
      temperature: 0,
      seed: 42,
    },
  },
  rules: [
    {
      id: 'project-codename',
      instruction: 'The project codename is ORBIT. Never call it NOVA.',
      severity: 'critical',
    },
  ],
  scenarios: [
    {
      id: 'growing-conversation',
      description: 'Checks the codename before and after unrelated conversation turns.',
      turns: [
        { prompt: 'Give me three short names for a coffee shop.' },
        { prompt: 'Explain why leaves look green in one sentence.' },
        { prompt: 'List the weekdays in reverse order.' },
        { prompt: 'Write a two-line poem about rain.' },
      ],
      probes: [
        {
          id: 'baseline',
          ruleId: 'project-codename',
          afterTurn: 0,
          prompt: 'What is the project codename? Reply with only the codename.',
          assertions: [
            { type: 'contains', value: 'ORBIT' },
            { type: 'notContains', value: 'NOVA' },
          ],
        },
        {
          id: 'after-distraction',
          ruleId: 'project-codename',
          afterTurn: 4,
          prompt: 'What is the project codename? Reply with only the codename.',
          assertions: [
            { type: 'contains', value: 'ORBIT' },
            { type: 'notContains', value: 'NOVA' },
          ],
        },
      ],
    },
  ],
};

export async function createExampleConfig(
  configPath = DEFAULT_CONFIG_FILE,
  force = false,
): Promise<string> {
  const absolutePath = resolve(configPath);
  if (!force) {
    try {
      await access(absolutePath, constants.F_OK);
      throw new ConfigError(
        `${absolutePath} already exists. Use --force only if you intend to replace it.`,
      );
    } catch (error) {
      if (error instanceof ConfigError) throw error;
    }
  }

  try {
    await writeFile(absolutePath, `${JSON.stringify(EXAMPLE_CONFIG, null, 2)}\n`, 'utf8');
  } catch (error) {
    throw new ConfigError(`Could not write ${absolutePath}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  return absolutePath;
}
