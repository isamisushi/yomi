# Yomi

Agent-facing React repair context for AI coding agents.

Yomi helps a coding agent move from a visible React UI symptom to the source
owner, likely edit target, runtime trace plan, and verification loop.

```txt
visible UI bug
  -> source-linked owner
  -> action/state/effect/cache path
  -> likely edit target
  -> minimal trace plan
  -> verifier result
```

Yomi is not another browser automation wrapper, generic repo graph, or UI
generation protocol. It is a React repair context layer for coding agents.

## Quick Start

Try Yomi without installing it globally:

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

The npm package installs a prebuilt `yomi` binary for macOS, Windows, or Linux.
Bun is not required to run the installed CLI.

## Documentation

Start at the public docs site: [yomi-docs.fly.dev](https://yomi-docs.fly.dev/).

Understand Yomi:

- [Why Yomi](https://yomi-docs.fly.dev/why-yomi)
- [Comparison](https://yomi-docs.fly.dev/comparison)
- [Limitations](https://yomi-docs.fly.dev/limitations)

Try it:

- [Getting started](https://yomi-docs.fly.dev/getting-started)
- [Demo walkthrough](https://yomi-docs.fly.dev/demo)

Use it:

- [Agent workflow](https://yomi-docs.fly.dev/agent-workflow)
- [CLI reference](https://yomi-docs.fly.dev/cli)
- [Agent skills](https://yomi-docs.fly.dev/agent-skills)
- [Architecture](https://yomi-docs.fly.dev/architecture)

Project:

- [Docs source](./docs/index.md)
- [Docs deployment](./docs/deployment.md)
- [GitHub publication guide](https://yomi-docs.fly.dev/publication)

The demo shows the product direction: a coding agent should be able to move from
visible UI behavior to source-linked React structure, action paths, hook/effect
risks, and runtime verification traces.

## Demo

For local development from this repository, install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build:

```bash
npm run build
```

The current demo is intentionally small. It models a stale async response bug in
a React customer search screen and shows the kind of IR queries an agent would
use:

- `findUiNode`
- `getComponentOwner`
- `getActionPath`
- `getDataPath`
- `getStateOwners`
- `getHookDependencies`
- `getEffectsTriggeredBy`
- `getImpact`
- `getSourceLocations`
- `getRuntimeTrace`
- `getRepairBrief`
- `getRepairBriefFromUi`

Repair briefs include form field, validation, and error ownership when a visible
UI path is backed by React Hook Form. For Next App Router paths, repair briefs
also include nearby route segment, Server Component -> Client Component
boundary, Suspense fallback, and boundary prop serialization risk evidence when
the action owner is rendered through an RSC boundary.

The important claim is not that the mock app is complex. The claim is that a
frontend coding agent needs a source-linked, runtime-aware workbench instead of
only files, DOM, and screenshots.

## CLI

Yomi also has a first Crust-based CLI. `yomi index` now runs a minimal
ts-morph native TypeScript/React extractor and writes `.yomi/graph.json`.
Graph JSON read from disk or reused from `.yomi/index-cache.json` is parsed
through a runtime boundary validator before queries and instrumentation trust it.

The extractor currently detects:

- React function components in TSX/JSX files
- component render relationships
- local `useState` state nodes
- `useEffect` hooks and dependency names
- JSX event actions such as `onClick` and `onChange`
- local named handlers such as `onChange={handleQueryChange}`
- imported handler functions resolved through TypeScript symbols
- multi-hop prop-drilled actions such as parent `onSelect` props invoked by child UI
- aliased prop objects and JSX spreads such as `<Child {...childProps} />`
- source-linked prop boundary nodes, including direct JSX props and known spread
  props passed across component boundaries
- Context consumer usage through direct `useContext(...)` and custom hooks such
  as `useTheme()`, linked back to the provider declaration when possible
- Zustand-style external store usage through `useXxxStore((state) => state.foo)`
  selectors, including selected field source locations when the store is local
- Jotai atom usage through `useAtom`, `useAtomValue`, and `useSetAtom`, linked
  back to local `atom(...)` declarations
- Redux Toolkit-style `dispatch(sliceAction(...))` ownership back to local
  `createSlice({ reducers })` reducer fields
- Redux selector reads through `useSelector` or typed hooks such as
  `useAppSelector`, including direct `state.slice.field` paths and local
  `createSelector([...], projector)` reads when the input selector and projector
  expose a static path. Selected field sources are recovered when the slice is
  registered in `configureStore`
- remote data reads through `fetch`, React Query `useQuery`, and SWR `useSWR`
- cache operations such as `invalidateQueries`, `setQueryData`, `mutate`, and `refetch`
- React Router route data ownership through route object `loader` / `action`,
  `useLoaderData`, `<Form method="post">`, `useSubmit`, and `useFetcher`
- Next App Router route segment metadata for `app/**/page.tsx`,
  `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, and
  `template.tsx`
- Next App Router component runtime classification for `"use client"` files,
  transitive client imports, default server route files, and direct
  server-to-client render boundaries
- design-system component usages, including the render site and JSX props for
  components under paths such as `components/ui`
- package-level client entry metadata for external components imported from
  package roots, explicit subpath exports, pattern subpath exports, and pnpm
  virtual-store package entries whose resolved entry starts with `"use client"`
- Server Component -> Client Component prop serialization risks such as regular
  function props, nested functions in object/array props, class instances, and
  unknown runtime expressions, while allowing imported Server Actions at the
  boundary
- Manual React `<Suspense>` boundaries around rendered component subtrees,
  including fallback labels used for streaming/loading context
- React Hook Form field ownership through `useForm`, `register(...)`,
  `Controller`, `useController`, validation options, `formState.errors`, and
  `setError(...)`
- React Hook Form resolver schema ownership for patterns such as
  `useForm({ resolver: zodResolver(schema) })`
- visible UI nodes such as inputs, buttons, status areas, panels, forms, and dialogs

Remote data and cache extraction is static and intentionally conservative. It
can surface likely cache consistency risks, and browser scenarios can verify
specific runtime freshness failures such as stale visible data after a wrong
cache invalidation. `data-path` reports cache-to-remote key matches as `exact`,
`prefix`, or `maybe` so agents can distinguish precise invalidations from broad
or ambiguous cache effects.

```bash
npm run yomi -- index
npm run yomi -- index --force
npm run yomi -- query find-ui-node Search
npm run yomi -- query component-owner search-input-node
npm run yomi -- query action-path edit-query-action
npm run yomi -- query data-path edit-query-action
npm run yomi -- query state-owners customer-search-panel
npm run yomi -- query hook-dependencies customer-search-panel
npm run yomi -- query repair-brief edit-query-action
npm run yomi -- query brief-from-ui "Customer search"
npm run yomi -- query source-locations customer-search-effect
npm run yomi -- query runtime-trace stale-response
npm run yomi -- query runtime-trace selected-customer-state
npm run yomi -- query runtime-trace missing-effect-cleanup
npm run yomi -- query runtime-trace viewport-tracker-effect
npm run yomi -- query runtime-trace double-submit
npm run yomi -- query runtime-trace checkout-submit-action
npm run yomi -- query runtime-trace ui-validation-enforcement
npm run yomi -- query runtime-trace support-email-form-field
npm run yomi -- query runtime-trace key-remount-state-loss
npm run yomi -- query runtime-trace profile-editor-key-prop
npm run yomi -- query runtime-trace shared-hook-regression
npm run yomi -- query runtime-trace use-shared-search-params-hook
npm run yomi -- query runtime-trace prop-rename-impact
npm run yomi -- query runtime-trace customer-summary-name-prop
npm run yomi -- repair "Customer search"
npm run yomi -- repair "Customer search" --scenarioFile fixtures/scenarios/customer-search-consistency-graph.json --url http://127.0.0.1:5173
npm run yomi -- plan-trace "Customer search"
npm run yomi -- doctor "Customer search"
npm run yomi -- verify stale-response
npm run yomi -- verify stale-response-fixed
npm run yomi -- verify missing-effect-cleanup
npm run yomi -- verify missing-effect-cleanup-fixed
npm run yomi -- verify double-submit
npm run yomi -- verify double-submit-fixed
npm run yomi -- verify ui-validation-enforcement
npm run yomi -- verify ui-validation-enforcement-fixed
npm run yomi -- verify key-remount-state-loss
npm run yomi -- verify key-remount-state-loss-fixed
npm run yomi -- verify shared-hook-regression
npm run yomi -- verify shared-hook-regression-fixed
npm run yomi -- verify prop-rename-impact
npm run yomi -- verify prop-rename-impact-fixed
npm run yomi -- verify stale-response --url http://127.0.0.1:5173
npm run yomi -- verify stale-response --fixed --url http://127.0.0.1:5173
npm run yomi -- verify browser-scenario --scenarioFile fixtures/scenarios/customer-search-consistency.json --url http://127.0.0.1:5173
npm run yomi -- index --demo --output .yomi/demo-graph.json
npm run yomi -- verify browser-scenario --scenarioFile fixtures/scenarios/customer-search-consistency-graph.json --graph .yomi/demo-graph.json --url http://127.0.0.1:5173
npm run yomi -- index --project fixtures/cache-inconsistency --force
npm run yomi -- query brief-from-ui "Archive Paper" --project fixtures/cache-inconsistency
npm run yomi -- examples react-repair
npm run yomi -- benchmark react-repair
npm run yomi -- explain
npm run yomi -- skill --all --scope project
```

`yomi explain` returns the latest known verifier failure with the same
graph-linked `repairBrief` shape as `query brief-from-ui`, plus the observed bug,
edit target, do-not-start hints, suggested fix shape, and next commands.
`yomi repair <visible-ui-label-or-id>` is the direct agent entrypoint for a known
visible symptom: it wraps the graph-linked repair brief with an explicit
`editTarget`, `whyEditTarget`, `confidence`, `evidenceTrail`, `doNotStartFrom`,
`suggestedFixShape`, `nextCommands`, and a verification plan. `evidenceTrail`
classifies each source-linked clue as visible surface, behavior owner,
state transition, side effect, data/cache ownership, form/store ownership,
context boundary, display evidence, or verification risk so agents can inspect
the right owner before editing display-only UI.
Pass `--scenarioFile` and optionally `--url` to `yomi repair` when a reproducing
browser scenario already exists; the returned `nextCommands` then include a
concrete `yomi verify browser-scenario ...` command instead of a placeholder.
`yomi plan-trace <visible-ui-label-or-id>` is the bridge from repair context to
runtime history: it runs the repair plan, classifies the likely bug type, picks
the smallest source-linked instrumentation targets, and returns a ready
`yomi instrument <first-id> --targets ...` command. Use it when the agent needs
state/effect/cache/render history to prove ordering before editing, instead of
instrumenting broad component trees or choosing trace points by hand.
`yomi skill --all --scope project` installs generated Yomi command guidance into
project-local agent skill directories, including the Yomi-specific repair
workflow instructions agents should follow.
`yomi doctor [visible-ui-label-or-id]` checks the indexed graph against Yomi's
agent-facing concept contract: source-linked graph, compact repair queries,
agent-ready repair plans, and source-linked runtime trace joining. It also
returns `nextCommands` such as `yomi repair "<label>"`, `yomi index --force`, or
`yomi benchmark react-repair` so agents can recover from a failed contract check
without guessing the next CLI step. Use it after `yomi index` when the agent
needs to verify that Yomi is giving a reliable repair surface before trusting
the output.

The bundled mock graph is still available for the product demo:

```bash
npm run yomi -- index --demo --output .yomi/demo-graph.json
npm run yomi -- query data-path edit-query-action --graph .yomi/demo-graph.json
npm run yomi -- query repair-brief edit-query-action --graph .yomi/demo-graph.json
npm run yomi -- query brief-from-ui "Customer search" --graph .yomi/demo-graph.json
```

The CLI returns JSON designed for coding agents rather than prose written for
humans. Successful commands return `{ "ok": true, "data": ... }`; thrown command
errors return `{ "ok": false, "error": { "name", "message", "code"? } }` without
requiring agents to scrape stack traces.

`verify stale-response` runs a deterministic runtime scenario harness that
starts two overlapping customer search requests and records trace events joined
back to source locations, graph node ids, and a correlation id.
`verify stale-response-fixed` runs the same scenario with stale-response guarding
enabled and should pass. `query runtime-trace` exposes the same trace in the
short `QueryResult` shape when an agent wants trace context without the full
verifier report.
`verify missing-effect-cleanup` runs a deterministic effect lifecycle scenario
that mounts a viewport tracker, enables a resize listener, unmounts the
component, and fails when no cleanup ran before unmount. The fixed variant emits
`cleanup-ran` and passes. Both built-in verifier classes return source-linked
trace events, top-level `violations`, and graph-linked repair plans.
`verify double-submit` runs a deterministic submit lifecycle scenario where the
user clicks the same submit button twice before the first request resolves. The
broken report points to the submit handler as the edit target and treats the
button/disabled prop as evidence, not the primary repair target. The fixed
variant ignores the second submit while pending and passes.
`verify ui-validation-enforcement` runs a deterministic form scenario where a
Support email validation error is visible but submit still proceeds. The broken
report points to the React Hook Form validation rule as the edit target and
treats the input as a visible surface. The fixed variant blocks submit while the
validation error is present and passes.
`verify key-remount-state-loss` runs a deterministic component identity scenario
where a parent sort change changes a child `key`, remounts `ProfileEditor`, and
loses unsaved local draft state. The broken report points to the parent `key`
prop as the edit target and treats the input as visible-surface evidence. The
fixed variant keeps component identity stable and preserves the draft.
`verify shared-hook-regression` runs a deterministic shared-hook scenario where
editing Inventory search goes through `useSharedSearchParams` and accidentally
regresses Order search. The broken report points to the shared hook
implementation as the edit target and treats both visible inputs as consumer
evidence. The fixed variant preserves caller-specific search state across hook
consumers.
`verify prop-rename-impact` runs a deterministic component-boundary scenario
where a parent still passes `displayName` after the child prop contract was
renamed to `name`, leaving the visible Customer name empty. The broken report
points to the parent prop boundary as the edit target and treats the child label
as display evidence. The fixed variant aligns the prop contract and passes.
Verifier failures also include the same `repairPlan` contract returned by
`yomi repair` when graph-linked repair context is available, plus top-level
`violations` and `confidence` for the failure report itself, so an agent can move
directly from a failed browser/runtime check to the violated rule, `editTarget`,
`whyEditTarget`, `evidenceTrail`, and `doNotStartFrom` without re-deriving the
repair target.

Pass `--url` to run the verifier against a real browser page with Playwright.
For the demo, Yomi opens the page, reads the visible customer search state, and
returns the same agent-readable pass/fail shape with browser-observed trace
events.

Pass `--scenarioFile` to run a JSON-authored browser scenario. Scenario files can
open a page, wait for / click / fill `data-testid` controls, collect text/input
observations, and assert expected values. A failed assertion returns a
top-level `violations` array with expected/actual values, a source-linked trace,
`editTarget`, `doNotStartFrom`, and `suggestedFixShape`.
If the scenario declares `repairTarget`, Yomi reads the graph from `--graph`,
runs the relevant repair query, and includes the graph-linked repair brief in the
verifier output plus the full graph-linked `repairPlan`. This lets an agent
author a scenario from a visible UI target without hand-copying the source edit
target into the scenario file. This is still DOM/test-id based and does not yet
provide full React runtime instrumentation.

The demo app also installs a small development runtime trace collector at
`window.__YOMI_TRACE__`. It records source-linked action, effect, cleanup, and
render events from the app and the scenario verifier joins those events into the
same verifier output. This is the first runtime instrumentation path; it is
explicit opt-in app instrumentation, not automatic React internals tracing.

React apps can use the first opt-in adapter APIs from `src/react-instrumentation`:

- `createYomiAction(...)` records source-linked action events around handlers.
- `useYomiTraceEffect(...)` records effect and cleanup lifecycle events.
- `useYomiRenderTrace(...)` records component mount/unmount lifecycle events and
  committed render observations with a stable runtime instance id.
- `useYomiTracedState(...)` records state update requests and committed state.
- `useYomiExternalStoreTrace(...)` records source-linked external store or atom
  read/write evidence after store hooks have run.
- `traceYomiRouterRefresh(...)` records source-linked `router.refresh()` calls
  without changing the router object itself.
- `traceYomiReduxAction(...)` records source-linked Redux dispatches without
  needing a Redux-specific runtime dependency.
- `useYomiReduxSelectorTrace(...)` records source-linked Redux selector read
  evidence after selector hooks have run, without writing trace events during
  render.
- `useYomiFormFieldTrace(...)` records source-linked React Hook Form field,
  validation, and error ownership after the owning component commits.

These APIs are intentionally thin. They prove the shape of a React runtime
bridge for agents without requiring a compiler plugin or patching React itself.

TanStack Query-shaped cache operations can use `@isamisushi/yomi/tanstack-query`:

- `createYomiTanStackQueryClient(...)` wraps `invalidateQueries`,
  `setQueryData`, and `refetchQueries` and emits source-linked cache trace
  events.
- `traceTanStackQueryOperation(...)` records a cache operation when an app wants
  direct control instead of wrapping the client.

The adapter is structurally typed and does not import `@tanstack/react-query`.
It supports the v5 object argument style such as
`invalidateQueries({ queryKey: ["products"] })` and still reads legacy array
keys for instrumentation. The E2E fixture uses a real
`@tanstack/react-query` `QueryClientProvider`, `useQuery`, and `useQueryClient`
flow to verify the adapter against the actual library surface.

`yomi instrument <graph-node-id>` is the first bridge from static graph context
to app-side runtime tracing. It reads a source-linked graph node, proposes a
patch that imports the React adapter, inserts `YomiTraceMetadata`, and wraps the
target with the matching adapter API:

- component nodes -> `useYomiRenderTrace(...)`
- `useEffect` hook nodes -> `useYomiTraceEffect(...)`
- local `useState` state nodes -> `useYomiTracedState(...)`
- JSX event action nodes -> `createYomiAction(...)`
- TanStack Query cache operation nodes -> `traceTanStackQueryOperation(...)`
- Next client `router.refresh()` hook nodes -> `traceYomiRouterRefresh(...)`
- external store usage nodes -> `useYomiExternalStoreTrace(...)`
- Redux action usage nodes -> `traceYomiReduxAction(...)`
- Redux selector usage nodes -> `useYomiReduxSelectorTrace(...)`
- React Hook Form field nodes -> `useYomiFormFieldTrace(...)`

By default it returns the proposed before/after patch as JSON; pass `--apply` to
write the source file. The default adapter import is `@isamisushi/yomi/react`, which is
staged into the npm root package as a real subpath export with runtime and type
checks. `--adapter` can still point to a local adapter path for monorepo or
fixture workflows. `--queryAdapter` defaults to `@isamisushi/yomi/tanstack-query` for cache
operation tracing.

The E2E suite covers this loop on a temporary React app: index the app, apply
component/action/state/effect instrumentation in one source snapshot, boot the
instrumented app in Vite, run a browser scenario, and assert that the verifier
receives source-linked `component-mounted`, `render-committed`, `action-requested`,
`state-update-requested`, `state-committed`, and `effect-ran` runtime events.

```bash
npm run yomi -- index --project fixtures/react-repair-benchmark --output .yomi/benchmark-graph.json
npm run yomi -- plan-trace "Customer search" --project fixtures/react-repair-benchmark --graph .yomi/benchmark-graph.json
npm run yomi -- instrument orders-panel --project fixtures/react-repair-benchmark --graph .yomi/benchmark-graph.json
npm run yomi -- instrument orders-panel-status-filter-effect --project fixtures/react-repair-benchmark --graph .yomi/benchmark-graph.json
npm run yomi -- instrument orders-panel-status-filter-state --project fixtures/react-repair-benchmark --graph .yomi/benchmark-graph.json
npm run yomi -- instrument orders-panel-on-change-1-action --project fixtures/react-repair-benchmark --graph .yomi/benchmark-graph.json
npm run yomi -- instrument orders-panel-on-change-1-action --targets orders-panel-status-filter-state,orders-panel-status-filter-effect --project fixtures/react-repair-benchmark --graph .yomi/benchmark-graph.json
npm run yomi -- instrument product-archive-panel-invalidate-1-cache --project fixtures/cache-inconsistency --graph .yomi/graph.json
npm run yomi -- instrument invoice-client-router-refresh --project fixtures/react-repair-benchmark --graph .yomi/benchmark-graph.json
npm run yomi -- instrument inventory-sort-panel-uses-use-inventory-view-store-2-external-store --project fixtures/react-repair-benchmark --graph .yomi/benchmark-graph.json
npm run yomi -- instrument inventory-filter-panel-dispatches-set-availability-1-redux-action --project fixtures/react-repair-benchmark --graph .yomi/benchmark-graph.json
npm run yomi -- instrument inventory-filter-panel-selects-inventory-filter-availability-1-redux-selector --project fixtures/react-repair-benchmark --graph .yomi/benchmark-graph.json
npm run yomi -- instrument support-validation-form-support-email-form-field --project fixtures/react-repair-benchmark --graph .yomi/benchmark-graph.json
```

`yomi index` keeps an incremental index cache at `.yomi/index-cache.json` using
`@crustjs/store`. The cache stores a source fingerprint and graph JSON. When the
fingerprint is unchanged, Yomi reuses the cached graph instead of rerunning the
ts-morph extractor. Use `--force` to rebuild and refresh the cache.

Indexed graphs now include `designSystemUsages` and `props`, so query results can
show the source render site, JSX props, and prop boundary path for UI primitives
such as `SearchInput` or a shadcn-style `Button` without confusing those
wrappers with the behavior owner.

`yomi benchmark react-repair` runs the bundled React repair benchmark in
`fixtures/react-repair-benchmark`. The benchmark checks whether Yomi can start
from visible UI symptoms and reach the expected source-linked edit target while
avoiding display-only components. It also scores the `yomi repair` contract an
agent consumes: edit target, do-not-start hints, next commands, and verification
plan. `yomi examples react-repair` returns the same cases as an examples catalog
with symptom text, UI target, expected edit target, required evidence, known-limit
reason, and commands to run repair or the benchmark. This keeps examples and
evaluation synchronized instead of maintaining demo copies by hand. `yomi doctor`
is the lighter project-level contract check; `benchmark`
measures fixture precision, while `doctor` checks whether the current indexed
graph has the minimum agent-facing repair surface. The current must-pass cases cover stale async
response repair, wrong cache-key repair, `useReducer` logic owned by an
imported `.ts` reducer, async behavior hidden inside an imported custom hook,
Zustand-style external store setter ownership, Jotai atom ownership through
`useSetAtom`, Redux Toolkit slice reducer ownership with matching selector read
evidence, missing effect cleanup for listener/timer/subscription-style
resources, and derived values owned by a Context Provider. Mutation cases include
`useMutation({ onSuccess })` cache ownership and mutate call options such as
`mutation.mutate(input, { onSettled })`, with mutation callback trigger evidence
in the repair brief. SWR cases include wrong-key `mutate(key)` ownership,
bound mutate ownership from `const { mutate } = useSWR(key)`, and optimistic
update policy evidence such as `optimisticData` plus `rollbackOnError`. Router
cases include URL search param ownership reached from form controls that call
`setSearchParams` and React Router route action ownership reached from
`<Form method="post">`, `useSubmit`, and `useFetcher` / `fetcher.Form`. Form
cases include React Hook Form field ownership reached from visible inputs
registered through `register(...)`, plus validation/error ownership from
`register("field", options)`, `formState.errors.field`, and
`setError("field", ...)`, plus controlled field ownership from `Controller`
rules and `useController({ name, rules })`, plus resolver schema ownership from
`useForm({ resolver: zodResolver(schema) })`. Next App Router cases include
Server Action ownership reached from `<form action={serverAction}>`,
`button formAction={serverAction}`, and client event handlers that call an
imported `"use server"` action, plus server-action cache evidence from
`revalidatePath(...)` and `revalidateTag(...)` calls imported from
`next/cache`. Tagged server fetches such as
`fetch(url, { next: { tags: ["invoices"] } })` are represented as
`next-fetch` remote data, so a repair brief can show which server data a
matching `revalidateTag("invoices")` may refresh. Yomi also resolves simple
shared string constants used for tags, so `revalidateTag(INVOICE_CACHE_TAG)` can
match `tags: [INVOICE_CACHE_TAG]`. Client-side `router.refresh()` calls from
`next/navigation` are represented as router refresh evidence on the owning
action, distinct from server-side cache invalidation. Benchmark cases can still
be marked as known limits when fixtures describe React patterns Yomi cannot
localize yet. Imported higher-order event handler factories such as
`onClick={createReportRunner(reportId)}` are now covered as a must-pass case,
including a design-system `Button` wrapper where the wrapper usage is evidence
and the `onClick` prop boundary is visible, but the factory remains the likely
edit target. A known-limit case tracks event handlers hidden inside dynamically
returned JSX prop objects such as `<button {...buildPresetButtonProps(...)}/>`,
where Yomi currently falls back to the component owner instead of the hidden
handler. Missing-cleanup effect cases expose both the owning `useEffect`
and the resource cue, such as `addEventListener`, in the repair brief. External
store cases expose the `useXxxStore` selector or Jotai atom hook, selected
field/binding, and local store or atom source so the store setter or atom
declaration can be the likely edit target instead of a display-only child.
Redux cases expose the dispatched action, action export,
local slice reducer field, and selector-read path, including local
`createSelector` selector reads, so the reducer can be the likely edit target
while the read side remains visible.

Context benchmark cases also include consumer evidence such as
`context: ThemeContext` for both the action owner and rendered consumer subtree,
so an agent can see why editing the display-only preview is the wrong starting
point.

## CLI Packaging

Yomi uses Crust for npm CLI packaging.

```bash
npm run build:cli
npm run build:cli:package
npm run package:cli
npm run publish:npm:dry-run
npm run test:e2e
```

`build:cli` creates a local standalone binary in `.crust/bin`.
`build:cli:package` stages npm packages in `.crust/npm` using Crust's
optional-dependency platform package layout and adds the `@isamisushi/yomi/react` adapter
and `@isamisushi/yomi/tanstack-query` adapter subpath exports to the staged root package.
The staged platform packages currently cover:

- macOS arm64 and x64
- Linux arm64 and x64
- Windows arm64 and x64

`package:cli` and `publish:npm:dry-run` build the staged packages, verify the
staged `@isamisushi/yomi/react` runtime/type export, pack the root package plus
the current platform package with `npm pack`, install those tarballs into a
temporary consumer project, check the installed CLI bin and JSON error output
plus `yomi skill` / `yomi doctor` commands, check `@isamisushi/yomi/react`
runtime import and TypeScript consumption, then run `crust publish --dry-run`.
`publish:npm` performs the same checks before publishing.

Do not put CLI staging output under `dist/`; Vite clears `dist/` during web
builds.

Yomi currently uses `@crustjs/core`, `@crustjs/plugins`, `@crustjs/crust`,
`@crustjs/store`, and `@crustjs/skills`. Browser verification uses Playwright; run
`npx playwright install chromium` once if the Chromium runtime is missing. As the
CLI grows, `@crustjs/progress` and `@crustjs/validate` are the likely next Crust
packages to add.
Agent-facing commands should stay non-interactive and JSON-capable by default.
