# Docs Inventory

This file is a repository-local inventory of Yomi documentation. The public docs
site is [yomi-docs.fly.dev](https://yomi-docs.fly.dev/), backed by
[docs/index.md](./index.md).

Use this file when adding, moving, or reviewing docs. Reader-facing navigation is
defined in [docs/.vitepress/config.ts](./.vitepress/config.ts).

## Reader-Facing Docs

- [Docs Home](./index.md) - public documentation landing page.
- [Why Yomi](./why-yomi.md) - the product argument and when Yomi helps.
- [Demo Walkthrough](./demo.md) - a short repair -> plan-trace -> verify walkthrough.
- [Getting Started](./getting-started.md) - install, index a project, run repair queries, and verify behavior.
- [Agent Workflow](./agent-workflow.md) - how an AI coding agent should use Yomi during frontend repair work.
- [CLI Reference](./cli.md) - current command surface and expected JSON contracts.
- [Runtime Instrumentation](./runtime-instrumentation.md) - when and how to add opt-in app traces.
- [Agent Skills](./agent-skills.md) - generated and bundled agent skills.
- [Architecture](./architecture.md) - how static extraction, graph queries, instrumentation, and verification fit together.
- [Docs Deployment](./deployment.md) - how the documentation site is deployed to Fly.io.
- [Comparison](./comparison.md) - how Yomi differs from browser automation, debugger, React inspection, and coding agent tools.
- [Limitations](./limitations.md) - what is and is not implemented.

## Project Docs

- [GitHub Publication Guide](./publication.md) - what should be ready before making the repository public.

## Current Implementation Status

Yomi is an early implementation. It already includes:

- a ts-morph based React/TypeScript extractor
- source-linked frontend graph output
- agent-facing repair briefs
- runtime trace adapters for opt-in instrumentation
- deterministic verifier scenarios
- a React repair benchmark fixture
- Crust-based CLI packaging work

It is not yet a production-grade automatic React instrumentation system.
