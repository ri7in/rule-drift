# Releasing

RuleDrift uses Semantic Versioning and keeps human-readable changes in `CHANGELOG.md`.

## Private-to-public launch audit

1. Run `npm run check` and `npm run secrets` on a clean checkout.
2. Run both example adapters; record any model-specific limitations honestly.
3. Inspect `git log --all -p` for credentials, private paths, generated files, and misleading claims.
4. Run `npm pack --dry-run`, install the tarball in an empty directory, and exercise both the packaged CLI and MCP server.
5. Confirm the repository topics, description, license, issue templates, vulnerability reporting, and default branch.
6. Confirm `package.json` `mcpName`, `server.json`, and package versions match.
7. Configure npm Trusted Publishing for `ri7in/rule-drift` only after the repository is public.
8. Switch GitHub visibility to public.
9. Push a signed/annotated `v0.1.0` tag to trigger the release workflow.
10. Publish `server.json` to the official MCP Registry and verify discovery by `io.github.ri7in/rule-drift`.

Never publish a private npm package: private npm hosting is outside RuleDrift's $0 constraint.

## Later releases

1. Open a release PR updating package version and `CHANGELOG.md`.
2. Ensure schema changes are backward-compatible or introduce a new explicit schema version.
3. Merge through CI.
4. Tag the merge commit as `vX.Y.Z`.
5. Publish the matching MCP Registry version.
6. Verify npm provenance, the GitHub release, MCP Registry discovery, and a clean `npx rule-drift --version` install.

The workflow refuses to publish while the GitHub repository is private.

## Temporarily making the repository private

Making the GitHub repository private after a public release does not retract an already-public npm package or MCP Registry version. It does hide the source, GitHub release assets, issues, and repository-hosted documentation from unauthenticated users. Source and provenance links may therefore lead to a `404` while the repository is private.

Before announcing the project again:

1. Change the GitHub repository visibility back to public.
2. Verify the repository, tagged release, and documentation from a logged-out browser or unauthenticated request.
3. Manually run CI and CodeQL, because changing visibility does not create a new push event.
4. Confirm npm still marks the intended version as `latest` and still exposes provenance.
5. Confirm the official MCP Registry marks the intended version as active and latest.

Do not republish an unchanged npm version. npm versions are immutable, and the existing package remains usable while the source repository is temporarily private.
