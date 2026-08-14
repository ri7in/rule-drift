# Architecture

RuleDrift separates agent execution from deterministic evaluation.

```text
config loader ──> scenario runner ──> adapter ──> target agent/model
                       │
                       ├── background conversation state
                       └── isolated probe snapshots
                                      │
                                      ▼
                              assertion engine
                                      │
                                      ▼
                          pretty / JSON / JUnit
```

## Components

- **Config loader:** parses JSON and validates version, IDs, references, boundaries, adapter settings, and assertions before any agent call.
- **Scenario runner:** creates a fresh conversation per scenario, appends background responses, and forks snapshots for probes.
- **Adapters:** translate the common message protocol into either local Ollama HTTP or a subprocess contract.
- **Assertion engine:** applies deterministic string and regular-expression checks. No second LLM judges the first LLM.
- **Reporters:** consume one versioned internal report. JSON/JUnit redact raw responses by default.

## Failure classes

Rule failures and infrastructure failures remain distinct:

- assertion miss → failed probe and exit `1`;
- invalid config → no agent call and exit `2`;
- model/adapter/process failure → scenario error and exit `3`.

This matters in CI: changing a prompt is different from Ollama being offline.

## Reproducibility boundary

RuleDrift makes scenarios, probes, assertion logic, adapter identity, timing, and response hashes reproducible. It cannot make a probabilistic model deterministic or guarantee that two mutable model tags contain identical weights. Model digests and repeated-run policies belong to the deployment using RuleDrift.

## Public API

The npm package exports the config parser, adapters, runner, assertions, reporters, and TypeScript types. The CLI is a thin composition layer over those exports.

The config and report objects each carry version `1`. Breaking schema changes require a new schema version and migration notes even before package `1.0.0`.
