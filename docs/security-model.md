# Security model

RuleDrift is a developer tool that sends configured conversations to a configured target. Its safest default is local execution without telemetry.

## Trust boundaries

| Boundary        | RuleDrift does                                                  | User must do                                                     |
| --------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Configuration   | Validates structure and limits.                                 | Review rules, prompts, commands, and URLs before running.        |
| Ollama          | Defaults to loopback and uses explicit HTTP requests.           | Trust the configured Ollama endpoint and model.                  |
| Command adapter | Disables shell expansion; limits time/output.                   | Treat the command as trusted executable code.                    |
| MCP client      | Restricts configuration paths to its declared workspace root.   | Approve `run_suite` only when its configured adapter is trusted. |
| Reports         | Omits response bodies from JSON/JUnit by default.               | Protect reports if responses or prompts contain sensitive data.  |
| CI              | Reference CI uses a deterministic adapter and no model secrets. | Do not add provider keys to fork-triggered workflows.            |

## Data flow

RuleDrift stores no database and sends no telemetry. Prompt and response data lives in process memory during a run. It is written only when the user requests report output; machine report response bodies require `--include-responses`.

The Ollama adapter sends messages to the configured URL. Setting a non-loopback URL changes the privacy boundary and is an explicit user decision.

## Process safety

The command adapter is not a sandbox. It runs with the current user's filesystem and environment permissions. Timeout and output limits protect availability, not confidentiality or code execution.

The MCP server exposes `validate_suite` and `run_suite` over local stdio. It accepts only configuration files whose canonical paths remain inside `--root`, permits one active run per connection, and omits response bodies from tool results. `run_suite` still executes the adapter named by that configuration, so the workspace must be trusted.

Subprocess stderr and HTTP error bodies are stripped of ANSI control sequences, truncated, and checked for common credential assignments and bearer tokens. Unknown secret formats can still pass through, so adapters must avoid logging credentials.

## Supply chain

- Runtime dependencies are limited to the official open-source MCP SDK and its Zod schema library.
- CI actions are pinned to full commit SHAs.
- Releases run the full quality gate and package smoke test.
- npm Trusted Publishing/provenance is required for public publication.
- The repository is scanned for common secret patterns before release.

## Out of scope

RuleDrift does not prevent prompt injection, enforce production policy, sandbox agents, or prove safety. It detects configured output-level rule regressions in configured scenarios.
