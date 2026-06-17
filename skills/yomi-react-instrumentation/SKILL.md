---
name: yomi-react-instrumentation
description: Add focused Yomi trace points so AI coding agents can inspect React action, state, effect, render, cache, and lifecycle history.
allowed-tools: Bash(yomi *) Read Grep Glob
---

# Yomi React Instrumentation

Use this skill when a React bug depends on event ordering or runtime history and the existing Yomi graph, repair brief, browser observation, or verifier trace is not enough to prove the cause.

This skill should usually be used after `yomi-react-repair` identifies a likely behavior owner. Instrumentation is evidence gathering, not the default first step for every UI bug.

## Default Workflow

1. Run `yomi index --force`.
2. Run `yomi repair "<visible UI label>"` and identify the smallest behavior path.
3. Run `yomi plan-trace "<visible UI label>"` when the minimum trace targets are not obvious.
4. Use the returned `instrumentCommand` when it fits the repair evidence.
5. Prefer `yomi instrument <graph-node-id>` before hand-editing adapter calls.
6. Use `yomi instrument <first-id> --targets id-a,id-b,id-c` when adding multiple trace points in one source snapshot.
7. Review the proposed patch before using `--apply`.
8. Run the app and the verifier or browser scenario that reproduces the bug.
9. Inspect the source-linked runtime trace before patching behavior.
10. Decide whether the instrumentation should remain as durable dev/test evidence or be removed after the fix.

## Hard Rules

- Do not instrument the whole app. Instrument the smallest behavior path needed to prove the bug.
- Prefer `yomi plan-trace "<visible UI label>"` over manually choosing graph ids when the repair path includes multiple actions, state owners, effects, cache operations, forms, stores, or render boundaries.
- Prefer graph-node instrumentation through `yomi instrument` before manually editing adapter calls.
- Instrument action, state, effect, and render together when debugging race conditions.
- Include correlation ids when connecting action -> request -> response -> state commit.
- Avoid logging raw PII or large objects. Prefer summaries, labels, ids, and redacted previews.
- Do not treat instrumentation as the fix unless the user explicitly asked only for observability.
- After instrumentation, run a browser scenario or verifier and inspect the trace before patching behavior.

## What To Instrument

### Race conditions and stale async responses

Instrument the visible action, request/effect owner, and state commit owner. The useful trace should show action requested, request started, response resolved, state update requested, and state committed in order.

### Remount or state loss

Instrument the parent render path, suspicious `key` or identity owner, child component mount/unmount, and child local state. The useful trace should show whether the same logical record received a new runtime instance id.

### Effect cleanup bugs

Instrument the effect owner and the rendered component. The useful trace should show `effect-ran`, `cleanup-ran`, mount, unmount, and render commits.

### Cache or server-state bugs

Instrument the action and cache operation when static `data-path` evidence is not enough. For TanStack Query operations, prefer the Yomi query adapter path instead of hand-written generic trace calls.

## Adapter Guidance

Use the `@isamisushi/yomi/react` adapter for React behavior:

- `createYomiAction(...)`
- `useYomiTraceEffect(...)`
- `useYomiRenderTrace(...)`
- `useYomiTracedState(...)`
- `useYomiExternalStoreTrace(...)`
- `traceYomiReduxAction(...)`
- `useYomiReduxSelectorTrace(...)`
- `useYomiFormFieldTrace(...)`
- `recordRuntimeTrace(...)`

Use the `@isamisushi/yomi/tanstack-query` adapter for TanStack Query cache operations:

- `createYomiTanStackQueryClient(...)`
- `traceTanStackQueryOperation(...)`

Use the generated command-reference skill for exact flags and command syntax.

## Prompt Snippet

Use Yomi instrumentation to collect the smallest source-linked runtime trace for this React bug. Start from the current Yomi repair brief, run `yomi plan-trace "<visible UI label>"` if the target set is not obvious, instrument only the behavior path needed to prove action/effect/state/render ordering, run the reproducing scenario, and inspect the trace before patching behavior.
