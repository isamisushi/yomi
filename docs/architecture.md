# Architecture

Yomi turns a React codebase into an agent-readable repair surface.

```txt
React source
  -> static extractor
  -> source-linked frontend graph
  -> agent query API
  -> optional runtime instrumentation
  -> verifier trace
```

## Static Extractor

The extractor uses TypeScript-aware analysis through `ts-morph`.

It currently identifies:

- React function components
- render relationships
- visible UI nodes
- local state
- effects and dependencies
- JSX event actions
- handler functions
- prop boundaries and prop-drilled actions
- React Hook Form ownership
- Context, Redux Toolkit, Jotai, and Zustand-style usage
- React Query and SWR reads/mutations
- Next App Router route segment and client/server boundary evidence
- design-system component usage
- selected external package client component metadata

The extractor is intentionally conservative. When it cannot prove ownership, it
should avoid pretending that it can.

## Frontend Graph

The graph is stored as JSON, usually at:

```txt
.yomi/graph.json
```

The graph is source-linked. Nodes and edges should preserve enough file, symbol,
and location data for a coding agent to inspect the right code without scanning
the whole repository.

Yomi also keeps an index cache:

```txt
.yomi/index-cache.json
```

Use `--force` when the agent needs to rebuild the graph.

## Agent Query API

The CLI exposes compact queries such as:

- `find-ui-node`
- `component-owner`
- `action-path`
- `data-path`
- `state-owners`
- `hook-dependencies`
- `source-locations`
- `brief-from-ui`
- `runtime-trace`

The most important public entrypoint is:

```bash
yomi repair "<visible UI label>"
```

That command wraps graph evidence into an explicit repair contract.

## Runtime Instrumentation

Yomi includes opt-in React adapter APIs. They are thin wrappers that record
source-linked runtime events.

Examples:

- `createYomiAction(...)`
- `useYomiTraceEffect(...)`
- `useYomiRenderTrace(...)`
- `useYomiTracedState(...)`
- `useYomiExternalStoreTrace(...)`
- `useYomiReduxSelectorTrace(...)`
- `useYomiFormFieldTrace(...)`

For TanStack Query-style cache operations:

- `createYomiTanStackQueryClient(...)`
- `traceTanStackQueryOperation(...)`

This is not automatic React internals tracing yet. It is an explicit bridge from
static graph nodes to runtime events.

See [Runtime Instrumentation](./runtime-instrumentation.md) for the CLI flow,
adapter APIs, and `window.__YOMI_TRACE__` collector contract.

## Verifier

The verifier runs deterministic scenarios and returns source-linked pass/fail
JSON.

Verifier output should help an agent answer:

- What failed?
- What was observed?
- Which graph node owns the behavior?
- Which source file should be inspected?
- Which target is tempting but wrong?
- What command should run next?

## Boundary With Other Tools

Yomi does not replace:

- Playwright
- React DevTools
- ESLint
- TypeScript
- repo graph tools
- code editing agents

Yomi's role is to join the frontend-specific ownership chain that those tools
usually expose only partially.
