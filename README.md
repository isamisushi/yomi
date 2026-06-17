# Yomi

Agent-facing React repair context for AI coding agents.

Yomi helps a coding agent move from a visible React UI symptom to the source owner, likely edit target, runtime trace plan, and verification loop.

```txt
visible UI bug
  -> source-linked owner
  -> action/state/effect/cache path
  -> likely edit target
  -> minimal trace plan
  -> verifier result
```

Yomi is not a browser automation wrapper, generic repo graph, or UI generation protocol. It is a React repair context layer for coding agents.

## Quick Start

Try the demo graph:

```bash
npx @isamisushi/yomi@latest index --demo --output .yomi/demo-graph.json
npx @isamisushi/yomi@latest repair "Customer search" --graph .yomi/demo-graph.json
npx @isamisushi/yomi@latest plan-trace "Customer search" --graph .yomi/demo-graph.json
```

For repeated use:

```bash
npm install -g @isamisushi/yomi
yomi doctor
```

The npm package installs a prebuilt `yomi` binary for macOS, Windows, and Linux on arm64/x64. Bun is not required to run the installed CLI.

## What It Does

- Indexes React and TypeScript apps into a source-linked frontend graph.
- Answers repair questions from visible UI labels.
- Identifies behavior owners across state, effects, actions, forms, stores, and cache operations.
- Produces `doNotStartFrom` hints for display-only surfaces.
- Plans focused runtime instrumentation when ordering or history matters.
- Runs verifier scenarios that return source-linked pass/fail traces.

## Documentation

Start here: [yomi-docs.fly.dev](https://yomi-docs.fly.dev/)

- [Why Yomi](https://yomi-docs.fly.dev/why-yomi)
- [Getting Started](https://yomi-docs.fly.dev/getting-started)
- [Demo Walkthrough](https://yomi-docs.fly.dev/demo)
- [CLI Reference](https://yomi-docs.fly.dev/cli)
- [Runtime Instrumentation](https://yomi-docs.fly.dev/runtime-instrumentation)
- [Agent Skills](https://yomi-docs.fly.dev/agent-skills)
- [Comparison](https://yomi-docs.fly.dev/comparison)
- [Limitations](https://yomi-docs.fly.dev/limitations)

## Local Development

```bash
mise install
npm install
npm run yomi -- index --demo --output .yomi/demo-graph.json
npm run yomi -- repair "Customer search" --graph .yomi/demo-graph.json
```

Useful checks:

```bash
npm run typecheck
npm test
npm run docs:build
npm run publish:npm:dry-run
```

## Agent Skills

Install project-local guidance for coding agents:

```bash
yomi skill --all --scope project
```

This installs generated command guidance plus Yomi's React repair and instrumentation workflows.

## Package

The npm package is prepared as `@isamisushi/yomi` and exposes:

- `yomi` CLI
- `@isamisushi/yomi/react`
- `@isamisushi/yomi/tanstack-query`

Platform packages are staged for macOS, Linux, and Windows on arm64/x64.

## License

MIT
