import { writeFile } from 'node:fs/promises';

import { createAdapter } from './adapters/index.js';
import { DEFAULT_CONFIG_FILE, loadConfig } from './config.js';
import { RuleDriftError, UsageError, errorMessage } from './errors.js';
import { createExampleConfig } from './init.js';
import { serveRuleDriftMcp } from './mcp.js';
import { formatReport } from './reporters/index.js';
import type { Reporter } from './reporters/index.js';
import { runSuite } from './runner.js';
import { VERSION } from './version.js';

export const EXIT = {
  success: 0,
  failed: 1,
  config: 2,
  adapter: 3,
  usage: 64,
  software: 70,
} as const;

interface CliIo {
  stdout(value: string): void;
  stderr(value: string): void;
  isTty: boolean;
}

interface TestArguments {
  command: 'test';
  config: string;
  reporter: Reporter;
  output?: string;
  includeResponses: boolean;
  color: boolean;
  quiet: boolean;
}

interface InitArguments {
  command: 'init';
  config: string;
  force: boolean;
}

interface ValidateArguments {
  command: 'validate';
  config: string;
}

interface McpArguments {
  command: 'mcp';
  root: string;
}

interface StaticArguments {
  command: 'help' | 'version';
}

type CliArguments =
  InitArguments | McpArguments | StaticArguments | TestArguments | ValidateArguments;

const HELP = `RuleDrift ${VERSION} — catch the moment an AI agent drifts from its rules.

Usage:
  rule-drift init [--config PATH] [--force]
  rule-drift validate [--config PATH]
  rule-drift test [--config PATH] [--reporter pretty|json|junit] [--output PATH]
  rule-drift mcp [--root PATH]

Commands:
  init       Create an explained starter configuration
  validate   Validate configuration without calling an agent
  test       Run every scenario and rule probe
  mcp        Serve validate_suite and run_suite over MCP stdio

Test options:
  -c, --config PATH       Configuration file (default: ${DEFAULT_CONFIG_FILE})
  -r, --reporter NAME     pretty, json, or junit (default: pretty)
  -o, --output PATH       Write the selected report to a file
      --include-responses Include raw model responses in JSON/JUnit reports
      --no-color          Disable terminal colors
  -q, --quiet             Suppress normal output

MCP options:
      --root PATH         Restrict configuration access to this directory (default: .)

Other options:
  -h, --help              Show this help
  -v, --version           Show the version

Exit codes: 0 passed, 1 rule failure, 2 invalid config, 3 adapter/runtime error.
`;

function valueAfter(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new UsageError(`${option} requires a value.`);
  }
  return value;
}

function parseCommonConfig(
  args: string[],
  index: number,
): { value: string; consumed: number } | null {
  if (args[index] === '--config' || args[index] === '-c') {
    return { value: valueAfter(args, index, String(args[index])), consumed: 1 };
  }
  return null;
}

export function parseArguments(args: string[], isTty = false): CliArguments {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { command: 'help' };
  }
  if (args.includes('--version') || args.includes('-v')) {
    return { command: 'version' };
  }

  const command = args[0];
  if (command === 'init') {
    let config = DEFAULT_CONFIG_FILE;
    let force = false;
    for (let index = 1; index < args.length; index += 1) {
      const common = parseCommonConfig(args, index);
      if (common) {
        config = common.value;
        index += common.consumed;
      } else if (args[index] === '--force') {
        force = true;
      } else {
        throw new UsageError(`Unknown init option: ${String(args[index])}`);
      }
    }
    return { command, config, force };
  }

  if (command === 'validate') {
    let config = DEFAULT_CONFIG_FILE;
    for (let index = 1; index < args.length; index += 1) {
      const common = parseCommonConfig(args, index);
      if (!common) {
        throw new UsageError(`Unknown validate option: ${String(args[index])}`);
      }
      config = common.value;
      index += common.consumed;
    }
    return { command, config };
  }

  if (command === 'mcp') {
    let root = '.';
    for (let index = 1; index < args.length; index += 1) {
      const argument = args[index];
      if (argument === '--root') {
        root = valueAfter(args, index, argument);
        index += 1;
      } else {
        throw new UsageError(`Unknown mcp option: ${String(argument)}`);
      }
    }
    return { command, root };
  }

  if (command === 'test') {
    let config = DEFAULT_CONFIG_FILE;
    let reporter: Reporter = 'pretty';
    let output: string | undefined;
    let includeResponses = false;
    let color = isTty && process.env.NO_COLOR === undefined;
    let quiet = false;
    for (let index = 1; index < args.length; index += 1) {
      const common = parseCommonConfig(args, index);
      if (common) {
        config = common.value;
        index += common.consumed;
        continue;
      }
      const argument = args[index];
      if (argument === '--reporter' || argument === '-r') {
        const value = valueAfter(args, index, argument);
        if (!['pretty', 'json', 'junit'].includes(value)) {
          throw new UsageError('--reporter must be pretty, json, or junit.');
        }
        reporter = value as Reporter;
        index += 1;
      } else if (argument === '--output' || argument === '-o') {
        output = valueAfter(args, index, argument);
        index += 1;
      } else if (argument === '--include-responses') {
        includeResponses = true;
      } else if (argument === '--no-color') {
        color = false;
      } else if (argument === '--quiet' || argument === '-q') {
        quiet = true;
      } else {
        throw new UsageError(`Unknown test option: ${String(argument)}`);
      }
    }
    return {
      command,
      config,
      reporter,
      ...(output === undefined ? {} : { output }),
      includeResponses,
      color,
      quiet,
    };
  }

  throw new UsageError(`Unknown command: ${String(command)}`);
}

function exitForError(error: RuleDriftError): number {
  switch (error.category) {
    case 'config':
      return EXIT.config;
    case 'adapter':
      return EXIT.adapter;
    case 'usage':
      return EXIT.usage;
  }
}

export async function runCli(
  args: string[],
  io: CliIo = {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
    isTty: process.stdout.isTTY,
  },
): Promise<number> {
  try {
    const parsed = parseArguments(args, io.isTty);
    switch (parsed.command) {
      case 'help':
        io.stdout(HELP);
        return EXIT.success;
      case 'version':
        io.stdout(`${VERSION}\n`);
        return EXIT.success;
      case 'init': {
        const path = await createExampleConfig(parsed.config, parsed.force);
        io.stdout(`Created ${path}\nNext: edit the file, then run rule-drift test.\n`);
        return EXIT.success;
      }
      case 'validate': {
        const loaded = await loadConfig(parsed.config);
        io.stdout(
          `Valid RuleDrift configuration: ${loaded.path} (${loaded.config.rules.length} rules, ${loaded.config.scenarios.length} scenarios)\n`,
        );
        return EXIT.success;
      }
      case 'mcp':
        await serveRuleDriftMcp({ root: parsed.root });
        return EXIT.success;
      case 'test': {
        const loaded = await loadConfig(parsed.config);
        const adapter = createAdapter(loaded.config.adapter, loaded.baseDir);
        const report = await runSuite(loaded.config, adapter);
        const formatted = formatReport(report, parsed.reporter, {
          includeResponses: parsed.includeResponses,
          color: parsed.color,
        });
        if (parsed.output) {
          await writeFile(parsed.output, formatted, 'utf8');
          if (!parsed.quiet) {
            io.stdout(
              `RuleDrift ${report.summary.status.toUpperCase()}: ${report.summary.probesPassed}/${report.summary.probes} probes passed. Report: ${parsed.output}\n`,
            );
          }
        } else if (!parsed.quiet) {
          io.stdout(formatted);
        }
        return report.summary.status === 'passed'
          ? EXIT.success
          : report.summary.status === 'failed'
            ? EXIT.failed
            : EXIT.adapter;
      }
    }
  } catch (error) {
    if (error instanceof RuleDriftError) {
      io.stderr(`RuleDrift: ${error.message}\n`);
      if (error.category === 'usage') io.stderr('Run rule-drift --help for usage.\n');
      return exitForError(error);
    }
    io.stderr(`RuleDrift: unexpected error: ${errorMessage(error)}\n`);
    return EXIT.software;
  }
}
