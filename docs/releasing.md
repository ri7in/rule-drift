# Release process

RuleDrift uses Semantic Versioning and keeps human-readable changes in `CHANGELOG.md`.

## Private-to-public launch audit

1. Run `npm run check` and `npm run secrets` on a clean checkout.
2. Run both example adapters; record any model-specific limitations honestly.
3. Inspect `git log --all -p` for credentials, private paths, generated files, and misleading claims.
4. Run `npm pack --dry-run`, install the tarball in an empty directory, and execute the packaged CLI.
5. Confirm the repository topics, description, license, issue templates, vulnerability reporting, and default branch.
6. Configure npm Trusted Publishing for `ri7in/rule-drift` only after the repository is public.
7. Switch GitHub visibility to public.
8. Push a signed/annotated `v0.1.0` tag to trigger the release workflow.

Never publish a private npm package: private npm hosting is outside RuleDrift's $0 constraint.

## Later releases

1. Open a release PR updating package version and `CHANGELOG.md`.
2. Ensure schema changes are backward-compatible or introduce a new explicit schema version.
3. Merge through CI.
4. Tag the merge commit as `vX.Y.Z`.
5. Verify npm provenance, the GitHub release, and a clean `npx rule-drift --version` install.

The workflow refuses to publish while the GitHub repository is private.
