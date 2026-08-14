import { access } from 'node:fs/promises';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const [command, root] = process.argv.slice(2);
if (!command || !root) throw new Error('Usage: mcp-smoke.mjs COMMAND ROOT');
await access(command);

const client = new Client({ name: 'rule-drift-package-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command,
  args: ['mcp', '--root', root],
  cwd: root,
  stderr: 'pipe',
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  if (tools.tools.map((tool) => tool.name).join(',') !== 'validate_suite,run_suite') {
    throw new Error('The packed MCP server did not expose the expected tools.');
  }

  const validation = await client.callTool({ name: 'validate_suite', arguments: {} });
  if (validation.isError) throw new Error('The packed MCP server could not validate its example.');

  const run = await client.callTool({ name: 'run_suite', arguments: {} });
  if (run.isError || run.structuredContent?.status !== 'passed') {
    throw new Error('The packed MCP server could not run its example.');
  }
} finally {
  await client.close();
}
