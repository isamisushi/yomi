# CLI Reference

Yomi's CLI is built with Crust.

During local development, run commands through:

```bash
npm run yomi -- <command>
```

Without a global install:

```bash
npx @isamisushi/yomi-cli@latest <command>
```

After global or project-local package installation, the intended command is:

```bash
yomi <command>
```

## Output Contract

Commands should return JSON that is easy for coding agents to consume.

Successful commands:

```json
{ "ok": true, "data": {} }
```

Failed commands:

```json
{ "ok": false, "error": { "name": "Error", "message": "..." } }
```

Agents should not need to scrape stack traces or prose.

## Core Commands

### `index`

Build a source-linked frontend graph.

```bash
yomi index
yomi index --force
yomi index --project fixtures/react-repair-benchmark --force
yomi index --demo --output .yomi/demo-graph.json
```

### `repair`

Return an agent-facing repair contract from a visible UI label or graph node id.

```bash
yomi repair "Customer search"
yomi repair "Customer search" --project fixtures/react-repair-benchmark
```

With a browser scenario:

```bash
yomi repair "Customer search" \
  --scenarioFile fixtures/scenarios/customer-search-consistency-graph.json \
  --url http://127.0.0.1:5173
```

### `plan-trace`

Return a repair-oriented instrumentation plan from a visible UI label or graph
node id.

```bash
yomi plan-trace "Customer search"
yomi plan-trace "Customer search" --project fixtures/react-repair-benchmark
```

Use this between `repair` and `instrument` when the agent needs runtime state,
effect, cache, form, store, or render history before editing. The output includes
`bugType`, `recommendedTraceTargets`, and a ready `instrumentCommand`.

### `query`

Run lower-level graph queries.

```bash
yomi query find-ui-node Search
yomi query component-owner search-input-node
yomi query action-path edit-query-action
yomi query data-path edit-query-action
yomi query state-owners customer-search-panel
yomi query hook-dependencies customer-search-panel
yomi query source-locations customer-search-effect
yomi query brief-from-ui "Customer search"
yomi query runtime-trace stale-response
```

### `verify`

Run deterministic verifier scenarios.

```bash
yomi verify stale-response
yomi verify stale-response-fixed
yomi verify missing-effect-cleanup
yomi verify missing-effect-cleanup-fixed
yomi verify double-submit
yomi verify double-submit-fixed
yomi verify ui-validation-enforcement
yomi verify ui-validation-enforcement-fixed
yomi verify key-remount-state-loss
yomi verify key-remount-state-loss-fixed
yomi verify shared-hook-regression
yomi verify shared-hook-regression-fixed
yomi verify prop-rename-impact
yomi verify prop-rename-impact-fixed
```

Run a browser scenario:

```bash
yomi verify browser-scenario \
  --scenarioFile fixtures/scenarios/customer-search-consistency.json \
  --url http://127.0.0.1:5173
```

### `instrument`

Propose or apply source instrumentation for a graph node.

```bash
yomi instrument <graph-node-id>
yomi instrument <graph-node-id> --apply
```

By default this returns a proposed patch. Use `--apply` only when the agent has
confirmed the target.

### `doctor`

Check whether the indexed project satisfies Yomi's minimum agent-facing repair
contract.

```bash
yomi doctor
yomi doctor "Customer search"
```

### `benchmark`

Run the bundled React repair benchmark.

```bash
yomi benchmark react-repair
```

### `examples`

List synchronized repair examples from the benchmark cases.

```bash
yomi examples react-repair
```

### `explain`

Return the latest known verifier failure in repair-plan shape.

```bash
yomi explain
```

### `skill`

Install generated Yomi command guidance into project-local agent skill
directories.

```bash
yomi skill --all --scope project
yomi skill update --all --scope project
```

`yomi` is the generated command-reference skill. `yomi-react-repair` and
`yomi-react-instrumentation` are bundled workflow skills.

## Package Verification Commands

```bash
npm run build:cli
npm run build:cli:package
npm run package:cli
npm run publish:npm:dry-run
```

`package:cli` and `publish:npm:dry-run` build the staged CLI/runtime packages,
stage GitHub Release binary assets, verify the installed binary and runtime
subpath exports, then run a dry-run publish. Tagged releases use GitHub Actions
to upload binary assets. Run `npm run publish:npm` locally after those assets
exist.
