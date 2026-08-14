import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

import { createAdapter } from './adapters/index.js';
import { DEFAULT_CONFIG_FILE, loadConfig } from './config.js';
import { ConfigError, errorMessage } from './errors.js';
import { redactSensitive, truncate } from './redact.js';
import { formatJson } from './reporters/json.js';
import { runSuite } from './runner.js';
import { PACKAGE_NAME, VERSION } from './version.js';

const CONFIG_PATH_INPUT = z.object({
  configPath: z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .default(DEFAULT_CONFIG_FILE)
    .describe('Configuration path inside the MCP workspace root.'),
});

const VALIDATION_OUTPUT = z.object({
  valid: z.literal(true),
  configPath: z.string(),
  suite: z.string(),
  rules: z.number().int().nonnegative(),
  scenarios: z.number().int().nonnegative(),
});

const RUN_OUTPUT = z.object({
  configPath: z.string(),
  suite: z.string(),
  status: z.enum(['passed', 'failed', 'error']),
  probes: z.number().int().nonnegative(),
  probesPassed: z.number().int().nonnegative(),
  passRate: z.number().nullable(),
  report: z.record(z.string(), z.unknown()),
});

export interface RuleDriftMcpOptions {
  root?: string;
}

function displayPath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function safeErrorMessage(error: unknown, root: string): string {
  const withoutRoot = errorMessage(error).split(root).join('<workspace>');
  return truncate(redactSensitive(withoutRoot), 1000);
}

function toolError(error: unknown, root: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `RuleDrift: ${safeErrorMessage(error, root)}` }],
  };
}

export async function resolveMcpRoot(rootPath = '.'): Promise<string> {
  try {
    const root = await realpath(resolve(rootPath));
    const metadata = await stat(root);
    if (!metadata.isDirectory()) {
      throw new ConfigError('The MCP root must be a directory.');
    }
    return root;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(
      `Could not access MCP root ${JSON.stringify(rootPath)}: ${redactSensitive(errorMessage(error))}`,
      { cause: error },
    );
  }
}

export async function resolveMcpConfigPath(root: string, configPath: string): Promise<string> {
  let path: string;
  try {
    path = await realpath(resolve(root, configPath));
  } catch (error) {
    throw new ConfigError(
      `Could not access configuration ${JSON.stringify(configPath)}: ${redactSensitive(errorMessage(error))}`,
      { cause: error },
    );
  }

  const pathFromRoot = relative(root, path);
  if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new ConfigError('MCP configuration paths must stay inside the workspace root.');
  }
  return path;
}

export function createRuleDriftMcpServer(root: string): McpServer {
  const server = new McpServer(
    { name: PACKAGE_NAME, version: VERSION },
    {
      instructions:
        'Use validate_suite before run_suite. Configuration files must be inside the workspace root. run_suite may call a configured local model or trusted command adapter.',
    },
  );
  let runInProgress = false;

  server.registerTool(
    'validate_suite',
    {
      title: 'Validate RuleDrift suite',
      description:
        'Validate a RuleDrift configuration without calling its model or command adapter.',
      inputSchema: CONFIG_PATH_INPUT,
      outputSchema: VALIDATION_OUTPUT,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ configPath }) => {
      try {
        const path = await resolveMcpConfigPath(root, configPath);
        const loaded = await loadConfig(path);
        const output = {
          valid: true as const,
          configPath: displayPath(root, path),
          suite: loaded.config.name,
          rules: loaded.config.rules.length,
          scenarios: loaded.config.scenarios.length,
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: `Valid RuleDrift suite: ${output.suite} (${output.rules} rules, ${output.scenarios} scenarios).`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error, root);
      }
    },
  );

  server.registerTool(
    'run_suite',
    {
      title: 'Run RuleDrift suite',
      description:
        'Run every configured conversation and isolated rule probe. Response bodies are omitted from the returned report.',
      inputSchema: CONFIG_PATH_INPUT,
      outputSchema: RUN_OUTPUT,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ configPath }) => {
      if (runInProgress) {
        return toolError(new Error('A RuleDrift suite is already running.'), root);
      }
      runInProgress = true;
      try {
        const path = await resolveMcpConfigPath(root, configPath);
        const loaded = await loadConfig(path);
        const adapter = createAdapter(loaded.config.adapter, loaded.baseDir);
        const report = await runSuite(loaded.config, adapter);
        const safeReport = JSON.parse(formatJson(report)) as Record<string, unknown>;
        const output = {
          configPath: displayPath(root, path),
          suite: report.suite,
          status: report.summary.status,
          probes: report.summary.probes,
          probesPassed: report.summary.probesPassed,
          passRate: report.summary.passRate,
          report: safeReport,
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: `RuleDrift ${output.status.toUpperCase()}: ${output.probesPassed}/${output.probes} probes passed.`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error, root);
      } finally {
        runInProgress = false;
      }
    },
  );

  return server;
}

export async function serveRuleDriftMcp(options: RuleDriftMcpOptions = {}): Promise<void> {
  const root = await resolveMcpRoot(options.root);
  serveStdio(() => createRuleDriftMcpServer(root), {
    onerror: (error) => process.stderr.write(`RuleDrift MCP: ${safeErrorMessage(error, root)}\n`),
  });
}
