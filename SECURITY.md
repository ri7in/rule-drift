# Security policy

## Supported versions

Until `1.0.0`, only the latest released minor version receives security fixes.

## Reporting a vulnerability

Do not open a public issue for a vulnerability or exposed credential.

Use GitHub's **Security → Report a vulnerability** flow for this repository. Include affected versions, reproduction steps, impact, and any suggested mitigation. If private vulnerability reporting is unavailable, contact the maintainer through the email on the `ri7in` GitHub profile without including exploit details in the subject.

You should receive an acknowledgement within 72 hours and an initial assessment within seven days. Timelines may change for complex reports, but status updates will be provided.

## Scope

Security reports may include command execution, credential disclosure, unsafe report handling, request routing, package/release integrity, or bypasses of documented limits.

An AI model producing an incorrect answer is normally a test result rather than a RuleDrift vulnerability. The command adapter intentionally executes trusted user-configured commands and is not a sandbox.
