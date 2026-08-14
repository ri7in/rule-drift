# Contributing

Thanks for helping make RuleDrift more useful and honest.

## Before opening work

- Use GitHub Discussions or an issue for changes that alter the config, report, or adapter protocol.
- Keep the scope on instruction-retention testing. General agent observability belongs elsewhere.
- Never add a required paid API, hosted service, account, or telemetry path.

## Local setup

Requirements: Node.js 22 or 24 and npm.

```bash
npm install
npm run check
```

Useful focused commands:

```bash
npm test
npm run test:coverage
npm run lint
npm run typecheck
npm run build
```

Tests must not call a hosted model or require credentials. Use the command fixture or a mocked Ollama response. Manual local-model checks are welcome but do not replace deterministic tests.

## Changes

- Branches: `feat/short-name`, `fix/short-name`, `docs/short-name`, or `chore/short-name`.
- Commits: Conventional Commits, such as `feat(cli): add junit reporter`.
- Add or update tests for behavior changes.
- Update docs and `CHANGELOG.md` when users would notice the change.
- Explain any privacy, compatibility, cost, or schema impact in the pull request.

Do not commit generated `dist`, coverage, model files, reports, `.env` files, or credentials.

## Pull requests

A maintainer will check correctness, test quality, user-facing claims, scope, security boundaries, and backward compatibility. A green test suite does not guarantee acceptance if a change weakens the $0/local-first contract or overstates what the tool proves.

By contributing, you agree that your contribution is licensed under the MIT License.
