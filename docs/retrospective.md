# Building RuleDrift

This is the technical record of why RuleDrift exists, how it was designed, what was verified, and what the project does not claim to prove. It covers the first public release and the `0.1.1` verification follow-up.

## The problem

An agent can follow an instruction in a short exchange and quietly lose it after more turns, distractions, prompt changes, memory changes, or a model update. Ordinary unit tests can verify code paths, but they do not naturally express this conversation-level regression.

RuleDrift treats instruction retention as a test suite:

1. Write the rules the agent must retain.
2. Define background conversation turns.
3. Probe a rule at selected conversation boundaries.
4. Check the answer with deterministic assertions.
5. Report the first point where the rule failed.

The project deliberately solves only this narrow problem. It is not a production proxy, an observability platform, a safety proof, or a replacement for broader agent evaluation.

## Constraints that shaped the product

The first version had four hard constraints:

- **Zero required cash cost:** no paid API, hosted backend, database, account, domain, or telemetry service.
- **Useful outside a demo:** a real CLI, machine-readable reports, CI behavior, an integration protocol, and public package distribution.
- **Understandable results:** users should not need a second model to decide whether the first model passed.
- **Reviewable engineering:** strict types, tests, security boundaries, release provenance, conventional history, and honest limitations.

Those constraints ruled out a hosted dashboard and an LLM-as-judge core. They led to a local-first CLI with deterministic assertions and optional local Ollama inference.

## Core design decisions

### Local-first execution

The reference path runs with Ollama on the user's machine. RuleDrift stores no account or database and sends no telemetry. A user can replace Ollama with a command adapter that calls an existing agent.

This moves inference cost and privacy decisions to the user. RuleDrift itself does not require a model API key or recurring service.

### Deterministic evaluation

The evaluator supports `contains`, `notContains`, `equals`, and regular-expression assertions. These checks are limited, but they are inspectable, repeatable, and easy to use in CI.

An LLM judge could grade semantic behavior that string assertions cannot express. It would also add cost, nondeterminism, a second failure surface, and the problem of deciding whether the judge is correct. The first version chose the smaller, auditable contract.

### Isolated probes

A probe runs on a copy of the conversation at a configured boundary. The probe and its answer are not appended to the background conversation.

Without isolation, an early question can remind the model of the answer and make a later check look better than the underlying conversation state. Isolated snapshots prevent the test from teaching the behavior it is measuring.

### One runner, multiple adapters

The scenario runner knows nothing about Ollama, a particular framework, or a hosted provider. Adapters translate a common message list into a target call.

- The Ollama adapter uses explicit local HTTP requests.
- The command adapter exchanges versioned JSON over stdin and stdout without invoking a shell.

This keeps the evaluator model-independent and lets an existing agent expose a very small integration boundary.

### Separate rule failures from tool failures

The CLI uses distinct stable exits:

| Exit | Meaning                               |
| ---: | ------------------------------------- |
|    0 | All probes passed                     |
|    1 | A rule assertion failed               |
|    2 | The configuration is invalid          |
|    3 | The adapter or runtime failed         |
|   64 | The command line was used incorrectly |

This distinction matters in automation. A prompt regression is not the same event as an unavailable Ollama process or a malformed configuration.

### Evidence with conservative defaults

Reports retain probe identity, timing, assertion results, response length, and a SHA-256 response fingerprint. JSON, JUnit, and MCP results omit raw response bodies by default.

There are two important limits:

- The terminal reporter shows a short response preview when an assertion fails, so terminal and CI logs may contain response text.
- An unsalted response hash is a change fingerprint, not a confidentiality control. A short guessable answer can be recovered by trying likely values.

### Explicit MCP tools

The MCP server exposes only `validate_suite` and `run_suite`. It runs over local stdio and only acts when the client calls one of those tools. It does not intercept every LLM request.

Configuration paths are restricted to a declared workspace root, including canonical-path checks that block symlink escapes. Running a suite can still execute its configured adapter, so the workspace and configuration must be trusted.

## Runtime flow

```text
CLI or MCP request
        |
        v
parse and validate versioned JSON
        |
        v
create a fresh conversation per scenario
        |
        +--> run background turn through adapter
        |        |
        |        +--> append response to background state
        |
        +--> copy state at each probe boundary
                 |
                 +--> run isolated probe through adapter
                          |
                          +--> deterministic assertions
                                   |
                                   v
                         pretty / JSON / JUnit / MCP report
```

## Technology and package shape

- TypeScript with strict checking, compiled to ESM for Node.js 22 and newer.
- A versioned JSON configuration contract plus a published JSON Schema.
- Hand-written runtime validation and cross-field checks, aligned with the published schema.
- Vitest with V8 coverage.
- ESLint, Prettier, Secretlint, and npm audit in the quality gate.
- The official open-source Model Context Protocol SDK and its Zod schema dependency for the optional MCP server.
- A small npm runtime dependency tree and no native build step.

The npm package exports the parser, adapters, runner, assertions, reporters, MCP server, version constants, and TypeScript types. The CLI composes those same public modules rather than maintaining a separate implementation.

## What shipped

The `0.1.x` line includes:

- `init`, `validate`, `test`, and `mcp` commands;
- versioned rules, scenarios, turns, probes, and assertions;
- Ollama and generic command adapters;
- terminal, JSON, and JUnit reports;
- response-redacted machine output by default;
- stable exits for rule, configuration, runtime, and usage failures;
- a local stdio MCP server with two explicit tools;
- examples, JSON Schema, security guidance, contribution guidance, and release operations documentation;
- npm distribution, the official MCP Registry entry, and GitHub release archives.

## Quality strategy

The deterministic suite covers configuration validation, assertion behavior, scenario isolation, both adapters, CLI behavior, reporters, redaction, MCP behavior, and error mapping.

At the `0.1.1` release:

- 12 test files passed;
- 47 tests passed;
- statement coverage was 92.98 percent;
- branch coverage was 89.69 percent;
- function coverage was 95.55 percent;
- line coverage was 92.90 percent;
- npm audit reported zero known vulnerabilities.

GitHub CI runs the complete gate on Node.js 22 and 24. A separate job packs the package, installs it into an empty project, exercises the repository examples, verifies the installed CLI, and drives the installed MCP server over the real protocol. CodeQL runs when the repository is public.

Real-model checks are deliberately separate from deterministic CI. CI must never require a model download, hosted account, key, or paid inference. Manual Ollama runs prove the reference integration while fixtures keep pull-request results stable.

## Release and supply-chain design

A `vX.Y.Z` tag triggers one release workflow that:

1. installs from the lockfile;
2. reruns the complete quality gate;
3. confirms the tag matches package and MCP metadata;
4. downloads a checksum-verified MCP Registry publisher;
5. validates the MCP manifest;
6. creates the npm archive;
7. generates a build-provenance attestation;
8. publishes to npm through Trusted Publishing with GitHub OIDC;
9. publishes the MCP Registry version through GitHub OIDC;
10. creates the matching GitHub Release with the same archive.

The workflow has no long-lived npm publication token. GitHub Actions are pinned to full commit SHAs, and the public npm package exposes registry signatures and SLSA provenance.

## Independent verification

The first public release was tested from scratch on a second Mac that initially had neither RuleDrift nor Ollama installed. The verification used Node.js 25, Ollama `0.32.11`, and the free local `qwen3:1.7b` model.

The verifier confirmed:

- the GitHub repository, release, npm package, documentation, and MCP Registry entry were discoverable while the repository was public;
- the tagged source passed the full 47-test gate with the published coverage values;
- a fresh npm installation exposed the expected CLI and public API;
- eight independent Ollama runs passed all 16 probes with the seeded reference configuration;
- a deliberately impossible assertion failed with exit `1`, proving the runner did not always report success;
- JSON and JUnit parsed successfully and omitted response bodies by default;
- CLI and MCP paths both returned structured results;
- five path-escape attempts, including a symlink escape, were blocked by the MCP root restriction;
- documented exits `0`, `1`, `2`, `3`, and `64` behaved as specified;
- the npm and GitHub archives were byte-for-byte identical.

The verification found two documentation gaps rather than functional defects. CLI help did not list exit `64`, and the security model did not say clearly enough that terminal failure previews can enter CI logs. Both were fixed, regression-tested, and released in `0.1.1`.

The `0.1.1` public verification then confirmed a fresh registry install, CLI, JavaScript exports, and MCP smoke test; zero known vulnerabilities; verified registry signatures and attestations; and byte-identical npm and GitHub archives with SHA-256:

```text
a22acdf803159223aa99ff950b81eaf8febd7b944707694e15dff78195d053e1
```

## What a passing result means

A pass means the configured agent produced outputs satisfying the configured assertions in the configured scenarios during that run.

It does not mean:

- the agent is generally safe;
- the model will always behave the same way;
- untested instructions are retained;
- the configured assertions fully capture the intended behavior;
- the same mutable model tag contains identical weights forever;
- a response hash keeps short responses secret.

Important suites should pin model artifacts where possible, record deployment context, cover more than one scenario, and repeat probabilistic runs.

## What the project cost

Required cash spend for development and maintenance was zero:

- real inference ran on existing hardware through Ollama;
- deterministic CI used fixtures rather than model inference;
- the source repository and public Actions workflow used GitHub's public-project infrastructure;
- npm publication and the MCP Registry required no paid account;
- no backend, database, domain, analytics, or hosted runtime was created.

The honest cost was engineering time and existing local compute. A user can also point the command adapter at a paid service, but that is the user's adapter choice rather than a RuleDrift requirement.

## Lessons from the build

### A narrow evaluator can be more credible than a broad judge

RuleDrift does not try to score every quality of an agent. Its usefulness comes from making one failure mode concrete and testable.

### Evaluation tools need evaluation

Testing only the success path would leave open the possibility that the tool always passes. The manual failure case, separate infrastructure exits, reporter parsing, and second-machine run were part of proving the evaluator itself.

### Isolation is part of measurement design

The isolated-probe decision is not just an implementation detail. It prevents the test from altering the conversation state it is trying to observe.

### Reproducibility has a boundary

Seeds and zero temperature improved stability in the tested local model, but a model runtime and mutable model tag remain outside the evaluator's control. Good documentation states that boundary instead of implying perfect determinism.

### Redaction claims must include logs

Protecting JSON output is not enough if terminal output reaches a persistent CI log. Security documentation must describe every output channel, not only report files.

### Distribution is part of production quality

The npm install, package exports, executable bit, provenance, release archive, MCP manifest, and registry discovery are all user-facing behavior. A green source test suite alone does not prove them.

### Small dependencies reduce more than bundle size

A small runtime tree reduces supply-chain exposure, audit noise, installation failure modes, and the number of upstream changes that maintenance must track.

### Independent testing finds expectation gaps

The second-machine test found two details that the implementation and normal test suite did not surface. Neither blocked the release, but both improved the contract presented to users.

## Maintenance state

`0.1.1` is the finalized initial release. Maintenance priorities are:

1. security and compatibility fixes;
2. dependency and action updates after review;
3. reproducible bug reports from real users;
4. narrowly scoped features that preserve the local-first, zero-required-cost contract.

Possible later work includes agent trace import, context-compaction and handoff fixtures, and SARIF output. None is required for the initial project to remain usable.

## Related documentation

- [Guide](guide.md)
- [Architecture](architecture.md)
- [Configuration reference](reference/configuration.md)
- [Command adapter protocol](reference/command-adapter.md)
- [MCP setup](mcp.md)
- [Security model](security-model.md)
- [Release process](maintainers/releasing.md)
- [Architecture decision](decisions/0001-local-first-deterministic-core.md)
