<div align="center">
  <img src="docs/assets/rule-drift-mark.svg" width="88" height="88" alt="RuleDrift logo">
  <h1>RuleDrift</h1>
  <p><strong>Catch the moment your agent drifts from its rules.</strong></p>
</div>

RuleDrift tests whether an AI agent still follows important instructions after a conversation becomes long or distracting.

Run it like a test suite when you change a prompt, model, memory system, or agent workflow. It runs locally and does not sit in front of production requests.

## Quick start

Requires Node.js 22+ and [Ollama](https://ollama.com/).

```bash
ollama pull qwen3:1.7b
npx rule-drift init
npx rule-drift test
```

No paid API, account, backend, telemetry, or runtime npm dependency is required.

## What you get

- The first conversation point where a rule fails
- Terminal, JSON, and JUnit reports
- Local Ollama and bring-your-own-agent support
- Stable exit codes for CI

## Documentation

- [Full guide](docs/guide.md)
- [All documentation](docs/README.md)

Contributions are welcome—see [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under [MIT](LICENSE).
