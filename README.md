<div align="center">
  <img src="docs/assets/rule-drift-mark.svg" width="96" height="96" alt="RuleDrift logo">
  <h1>RuleDrift</h1>
  <p><strong>Catch the moment your agent drifts from its rules.</strong></p>
</div>

RuleDrift is a local-first CLI for testing whether an AI agent still follows critical instructions after a conversation gets longer or distracting.

It does not sit in front of every production request. Run it like a test suite when you change a prompt, model, memory strategy, or agent workflow.

```text
rules + conversation scenarios
              │
              ▼
       agent under test
              │
        isolated probes
              │
              ▼
 terminal / JSON / JUnit report
```

## Why this exists

An agent can obey a rule at turn zero and quietly stop obeying it later. Normal unit tests catch code regressions; RuleDrift gives this specific agent failure mode a repeatable test.

RuleDrift records:

- whether each deterministic probe passed;
- the pass rate for every rule;
- the first conversation boundary where a rule failed;
- reproducible scenario, adapter, model, timing, and response hashes.

It deliberately does **not** claim that a passing suite proves an agent is generally safe or reliable. It proves only what the configured scenarios and assertions exercised.

## Quick start — $0 local model

Requirements: Node.js 22 or newer and, for this example, [Ollama](https://ollama.com/).

```bash
ollama pull qwen3:1.7b
npx rule-drift init
npx rule-drift validate
npx rule-drift test
```

The reference model runs on your own machine. There is no model API key, account, backend, telemetry, or usage bill.

During repository development, use:

```bash
npm install
npm run build
node dist/bin.js test --config examples/command/rule-drift.config.json
```

## Configuration

`rule-drift init` creates a versioned JSON file. The important pieces are:

```json
{
  "version": 1,
  "name": "my-agent-rules",
  "adapter": {
    "type": "ollama",
    "model": "qwen3:1.7b",
    "think": false
  },
  "rules": [
    {
      "id": "project-codename",
      "instruction": "The project codename is ORBIT. Never call it NOVA.",
      "severity": "critical"
    }
  ],
  "scenarios": [
    {
      "id": "growing-conversation",
      "turns": [{ "prompt": "Name three colors." }, { "prompt": "Name three cities." }],
      "probes": [
        {
          "id": "after-distraction",
          "ruleId": "project-codename",
          "afterTurn": 2,
          "prompt": "What is the project codename?",
          "assertions": [
            { "type": "contains", "value": "ORBIT" },
            { "type": "notContains", "value": "NOVA" }
          ]
        }
      ]
    }
  ]
}
```

A probe is run on an isolated snapshot. Its answer is checked but is not added to the background conversation, so one probe cannot teach the answer to a later probe.

See [configuration](docs/configuration.md) for the complete format and [command adapter](docs/command-adapter.md) for connecting an existing agent.

## Commands

```text
rule-drift init [--config PATH] [--force]
rule-drift validate [--config PATH]
rule-drift test [--config PATH] [--reporter pretty|json|junit]
```

Useful test options:

```bash
# Human-readable terminal output
rule-drift test

# CI report; raw responses are omitted by default
rule-drift test --reporter json --output rule-drift-report.json

# Test-report integration
rule-drift test --reporter junit --output rule-drift-report.xml

# Explicitly include raw responses when debugging locally
rule-drift test --reporter json --include-responses
```

Exit codes are stable: `0` passed, `1` assertion failure, `2` invalid configuration, `3` adapter or runtime failure, and `64` invalid CLI usage.

## Adapters

RuleDrift ships with two adapters:

- **Ollama:** calls a local Ollama `/api/chat` endpoint. The model is explicit in configuration.
- **Command:** starts your command without a shell, sends versioned JSON on stdin, and expects `{"content":"..."}` on stdout.

The command adapter makes RuleDrift model- and framework-independent. A small example lives in [`examples/command`](examples/command/).

## Privacy and cost

- No telemetry or network call exists outside the configured adapter.
- Machine-readable reports omit response bodies unless `--include-responses` is passed.
- Error details redact common token/password patterns and are length-limited.
- CI uses a deterministic fake adapter; it never downloads a model.
- RuleDrift has zero runtime npm dependencies.

See the [security model](docs/security-model.md) for the trust boundaries and limitations.

## Project status

RuleDrift is preparing its first `0.1.0` public release. The configuration and report schemas are versioned, but pre-1.0 versions may refine them with changelog and migration notes.

Planned after v0.1:

- MCP server mode;
- agent trace import;
- context-compaction and handoff fixtures;
- SARIF output for code-hosting annotations.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), then run `npm run check` before opening a pull request. Security reports follow [SECURITY.md](SECURITY.md).

RuleDrift is available under the [MIT License](LICENSE).
