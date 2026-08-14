# ADR 0001: Local-first execution and deterministic evaluation

- **Status:** Accepted
- **Date:** 2026-08-14

## Context

RuleDrift must remain free to develop, use, and maintain. Its results also need to be understandable without trusting another model's opinion.

## Decision

The core has no hosted service and no paid provider dependency. Real-model examples use local Ollama. Assertions are deterministic string/exact/regular-expression checks. Existing agents connect through a small command protocol.

## Consequences

- A user can run the complete reference workflow offline after downloading a model.
- CI needs no model, account, or secret.
- The package has no runtime npm dependencies.
- Semantic grading and hosted dashboards are outside v0.1.
- Some useful agent behaviours cannot be judged until the user expresses them as observable assertions.
