import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { McpServer } from '@modelcontextprotocol/server';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';

import { createRuleDriftMcpServer, resolveMcpConfigPath, resolveMcpRoot } from '../src/mcp.js';
import type { RuleDriftConfig } from '../src/types.js';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const builtCli = join(repositoryRoot, 'dist', 'bin.js');
const adapterPath = join(repositoryRoot, 'test', 'fixtures', 'command-adapter.mjs');
const openClients: Client[] = [];
const openServers: McpServer[] = [];

function suite(): RuleDriftConfig {
  return {
    version: 1,
    name: 'mcp-suite',
    adapter: { type: 'command', command: process.execPath, args: [adapterPath] },
    rules: [{ id: 'codename', instruction: 'The codename is ORBIT.' }],
    scenarios: [
      {
        id: 'retention',
        turns: [{ prompt: 'Name one color.' }],
        probes: [
          {
            id: 'codename-after-turn',
            ruleId: 'codename',
            afterTurn: 1,
            prompt: 'What is the codename?',
            assertions: [{ type: 'equals', value: 'ORBIT' }],
          },
        ],
      },
    ],
  };
}

async function createSuiteDirectory(): Promise<{ directory: string; configPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'rule-drift-mcp-'));
  const configPath = join(directory, 'rule-drift.config.json');
  await writeFile(configPath, JSON.stringify(suite()), 'utf8');
  return { directory, configPath };
}

async function connectStdio(directory: string): Promise<Client> {
  const client = new Client({ name: 'rule-drift-test-client', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [builtCli, 'mcp', '--root', directory],
    cwd: repositoryRoot,
    stderr: 'pipe',
  });
  await client.connect(transport);
  openClients.push(client);
  return client;
}

async function connectInMemory(directory: string): Promise<Client> {
  const client = new Client({ name: 'rule-drift-test-client', version: '1.0.0' });
  const server = createRuleDriftMcpServer(await resolveMcpRoot(directory));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  openClients.push(client);
  openServers.push(server);
  return client;
}

afterEach(async () => {
  delete process.env.RULE_DRIFT_TEST_DELAY_MS;
  await Promise.allSettled(openClients.splice(0).map((client) => client.close()));
  await Promise.allSettled(openServers.splice(0).map((server) => server.close()));
});

describe('MCP server', () => {
  it('resolves configuration only inside its workspace root', async () => {
    const inside = await createSuiteDirectory();
    const outside = await createSuiteDirectory();
    const root = await resolveMcpRoot(inside.directory);

    await expect(resolveMcpConfigPath(root, inside.configPath)).resolves.toBe(
      await realpath(inside.configPath),
    );
    await expect(resolveMcpConfigPath(root, outside.configPath)).rejects.toThrowError(
      /inside the workspace root/u,
    );
    await expect(resolveMcpRoot(inside.configPath)).rejects.toThrowError(/must be a directory/u);
    await expect(resolveMcpRoot(join(inside.directory, 'missing'))).rejects.toThrowError(
      /Could not access MCP root/u,
    );
    await expect(resolveMcpConfigPath(root, 'missing.json')).rejects.toThrowError(
      /Could not access configuration/u,
    );
  });

  it('lists, validates, and runs RuleDrift tools in memory', async () => {
    const { directory } = await createSuiteDirectory();
    const client = await connectInMemory(directory);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(['validate_suite', 'run_suite']);

    const validation = await client.callTool({ name: 'validate_suite', arguments: {} });
    expect(validation.isError).not.toBe(true);
    expect(validation.structuredContent).toMatchObject({
      valid: true,
      configPath: 'rule-drift.config.json',
      suite: 'mcp-suite',
      rules: 1,
      scenarios: 1,
    });

    const run = await client.callTool({ name: 'run_suite', arguments: {} });
    expect(run.isError).not.toBe(true);
    expect(run.structuredContent).toMatchObject({
      configPath: 'rule-drift.config.json',
      suite: 'mcp-suite',
      status: 'passed',
      probes: 1,
      probesPassed: 1,
      passRate: 100,
    });
    expect(JSON.stringify(run.structuredContent)).not.toMatch(/"response":/u);
  });

  it('returns a tool error for paths outside its root', async () => {
    const inside = await createSuiteDirectory();
    const outside = await createSuiteDirectory();
    const client = await connectInMemory(inside.directory);

    const result = await client.callTool({
      name: 'validate_suite',
      arguments: { configPath: outside.configPath },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('inside the workspace root');
  });

  it('redacts tool errors and prevents concurrent suite runs', async () => {
    const { directory } = await createSuiteDirectory();
    const client = await connectInMemory(directory);

    const invalid = await client.callTool({
      name: 'validate_suite',
      arguments: { configPath: 'missing-api_key=supersecret.json' },
    });
    const invalidText = JSON.stringify(invalid.content);
    expect(invalid.isError).toBe(true);
    expect(invalidText).toContain('api_key=[REDACTED]');
    expect(invalidText).not.toContain('supersecret');
    expect(invalidText).not.toContain(directory);

    process.env.RULE_DRIFT_TEST_DELAY_MS = '100';
    const first = client.callTool({ name: 'run_suite', arguments: {} });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await client.callTool({ name: 'run_suite', arguments: {} });
    expect(second.isError).toBe(true);
    expect(JSON.stringify(second.content)).toContain('already running');
    expect((await first).isError).not.toBe(true);
  });

  it('negotiates with the packaged stdio entry point', async () => {
    const { directory } = await createSuiteDirectory();
    const client = await connectStdio(directory);

    await expect(client.listTools()).resolves.toMatchObject({
      tools: [{ name: 'validate_suite' }, { name: 'run_suite' }],
    });
  });
});
