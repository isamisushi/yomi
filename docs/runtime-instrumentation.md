# Runtime Instrumentation

Yomi can collect source-linked runtime history, but it does not automatically
trace every React component.

The default workflow is:

```txt
repair
  -> plan-trace
  -> instrument the smallest target set
  -> run a verifier or browser scenario
  -> inspect source-linked trace events
```

Use runtime instrumentation when the bug depends on order or history:

- stale response overwrites newer state
- effect cleanup is missing or late
- submit happens while validation is failing
- cache mutation leaves visible data stale
- parent render or key change remounts a child
- store, selector, or form ownership is unclear from static evidence

## Preferred CLI Flow

Start from a visible symptom:

```bash
yomi repair "Customer search"
yomi plan-trace "Customer search"
```

`plan-trace` returns recommended trace targets and an `instrumentCommand`.
Review those targets before applying them.

Apply instrumentation only when it matches the repair evidence:

```bash
yomi instrument <graph-node-id> --apply
```

For multiple targets from one source snapshot:

```bash
yomi instrument <first-graph-node-id> --targets id-a,id-b,id-c --apply
```

This is usually better than hand-writing adapter calls because Yomi can attach
the graph node id, source location, and metadata expected by the verifier.

For agents, install the bundled instrumentation skill so they prefer this flow
over broad manual tracing:

```bash
yomi skill --all --scope project
```

## What Gets Added

`yomi instrument` inserts imports from:

```ts
import {
  createYomiAction,
  useYomiRenderTrace,
  useYomiTraceEffect,
  useYomiTracedState,
} from "@isamisushi/yomi/react";
```

Depending on the graph node, it may add:

- `createYomiAction(...)` around event handlers
- `useYomiTraceEffect(...)` around effects and cleanup
- `useYomiRenderTrace(...)` for component mount/render history
- `useYomiTracedState(...)` for state update and commit events
- `useYomiExternalStoreTrace(...)` for Zustand/Jotai-style store evidence
- `traceYomiReduxAction(...)` for Redux dispatches
- `useYomiReduxSelectorTrace(...)` for selector reads
- `useYomiFormFieldTrace(...)` for React Hook Form field ownership
- `traceYomiRouterRefresh(...)` for Next client `router.refresh()`

For TanStack Query cache operations, it uses:

```ts
import {
  createYomiTanStackQueryClient,
  traceTanStackQueryOperation,
} from "@isamisushi/yomi/tanstack-query";
```

The TanStack Query adapter is structurally typed. It does not import
`@tanstack/react-query` directly.

## Runtime Collector

The adapters record events through a small runtime collector exposed as:

```ts
window.__YOMI_TRACE__
```

The browser scenario verifier reads that collector and joins app-emitted runtime
events with browser observations and assertion failures.

The collected event kinds include:

- `action-requested`
- `state-update-requested`
- `state-committed`
- `effect-ran`
- `cleanup-ran`
- `component-mounted`
- `component-unmounted`
- `render-committed`

## Manual Use

Manual adapter calls are valid, but they are the fallback path.

Use them when:

- `yomi instrument` cannot transform the source pattern yet
- the app needs a durable dev/test trace point
- the agent needs to trace custom behavior outside the current graph model

Keep metadata source-linked:

```ts
const metadata = {
  name: "Customer search query",
  graphNodeId: "customer-search-query-state",
  source: {
    file: "src/features/customers/CustomerSearchPanel.tsx",
    line: 42,
    symbol: "CustomerSearchPanel",
  },
};
```

Do not instrument the whole app. Yomi is useful when the trace is small enough
for an agent to read before editing.

## Verification

After adding instrumentation, run the reproducing scenario:

```bash
yomi verify browser-scenario \
  --scenarioFile <scenario.json> \
  --graph .yomi/graph.json \
  --url http://127.0.0.1:5173
```

The verifier output should show both browser-observed state and source-linked
runtime events. Use that trace to decide whether the repair target is correct
before changing behavior.

## Current Limits

- Instrumentation is opt-in and intended for development/test workflows.
- It is not automatic React internals tracing.
- It does not replace React DevTools, browser tracing, or Playwright.
- Broad instrumentation makes agent output worse. Prefer the smallest behavior
  path that proves the bug.
