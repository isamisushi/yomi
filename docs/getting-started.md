# Getting Started

This guide is for trying Yomi from npm or from this repository.

## Requirements

- Node.js and npm for `npx` / npm installation
- Bun only when developing this repository locally
- Playwright Chromium only when running browser verification

This repository pins local tool versions with `mise.toml`:

```bash
mise install
```

The current pinned versions are Node.js 22.13.1 and Bun 1.3.13.

## Try Without Installing

The fastest way to see Yomi's core contract is to use the bundled demo graph.

```bash
npx @isamisushi/yomi@latest index --demo --output .yomi/demo-graph.json
npx @isamisushi/yomi@latest repair "Customer search" --graph .yomi/demo-graph.json
npx @isamisushi/yomi@latest plan-trace "Customer search" --graph .yomi/demo-graph.json
```

The important output is the repair and trace plan. It should point from a
visible UI label to the React owner, action/state/effect path, likely edit
target, runtime trace targets, and source locations.

## Install Globally

For repeated use:

```bash
npm install -g @isamisushi/yomi
yomi doctor
```

The installed CLI uses a prebuilt platform binary. Bun is not required to run
the installed command.

Supported binary packages:

- macOS arm64 and x64
- Linux arm64 and x64
- Windows arm64 and x64

## Project-Local Install

```bash
npm install --save-dev @isamisushi/yomi
npx yomi index
```

Install agent skills when you want coding agents in the repository to share
Yomi's command guidance and repair workflow:

```bash
npx yomi skill --all --scope project
```

## Develop From Source

Install repository dependencies:

```bash
mise install
npm install
```

If Playwright has not installed a browser runtime yet:

```bash
npx playwright install chromium
```

Run the demo graph through the source checkout:

```bash
npm run yomi -- index --demo --output .yomi/demo-graph.json
npm run yomi -- repair "Customer search" --graph .yomi/demo-graph.json
npm run yomi -- plan-trace "Customer search" --graph .yomi/demo-graph.json
```

To run the small local app:

```bash
npm run dev
```

## Index a React Project

Index the bundled benchmark fixture:

```bash
npm run yomi -- index --project fixtures/react-repair-benchmark --force
```

Run a repair query from a visible UI symptom:

```bash
npm run yomi -- repair "Customer search" --project fixtures/react-repair-benchmark
```

Ask for runtime trace targets when ordering or history matters:

```bash
npm run yomi -- plan-trace "Customer search" --project fixtures/react-repair-benchmark
```

List synchronized examples:

```bash
npm run yomi -- examples react-repair
```

Run the benchmark:

```bash
npm run yomi -- benchmark react-repair
```

## Verify Runtime Behavior

Run a built-in verifier scenario:

```bash
npm run yomi -- verify stale-response
npm run yomi -- verify stale-response-fixed
```

Run the browser E2E suite:

```bash
npm run test:e2e
```

## Validate the Package Shape

```bash
npm run typecheck
npm test
npm run build:cli:package
npm run package:cli
```

`package:cli` performs a dry-run package verification. It does not publish to npm.

## Next Pages

- [Why Yomi](./why-yomi.md)
- [Demo Walkthrough](./demo.md)
- [Agent Workflow](./agent-workflow.md)
- [CLI Reference](./cli.md)
