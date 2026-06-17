# Demo Walkthrough

This walkthrough uses the bundled demo graph. It shows the intended agent loop
without requiring a separate React app.

## 1. Create the Demo Graph

```bash
npx @isamisushi/yomi@latest index --demo --output .yomi/demo-graph.json
```

## 2. Ask for a Repair Plan

```bash
npx @isamisushi/yomi@latest repair "Customer search" --graph .yomi/demo-graph.json
```

The important fields are:

- `editTarget` - the source location Yomi thinks owns the behavior.
- `evidenceTrail` - visible UI, state, effect, cache, and display evidence.
- `doNotStartFrom` - tempting display-only surfaces.
- `nextCommands` - follow-up commands an agent can run.

For the demo, the visible `Customer search` input maps to the effect that owns
stale response behavior, not to the design-system input component.

## 3. Ask for Runtime Trace Targets

```bash
npx @isamisushi/yomi@latest plan-trace "Customer search" --graph .yomi/demo-graph.json
```

The output includes:

- `bugType`
- `recommendedTraceTargets`
- `instrumentCommand`
- the nested `repairPlan`

For a stale response, Yomi should recommend tracing the action, relevant state,
effect, and visible render boundary. It should not default to instrumenting the
whole app.

## 4. Verify Behavior

Run a deterministic verifier:

```bash
npx @isamisushi/yomi@latest verify stale-response
npx @isamisushi/yomi@latest verify stale-response-fixed
```

For a real browser scenario:

```bash
npx @isamisushi/yomi@latest verify browser-scenario \
  --scenarioFile fixtures/scenarios/customer-search-consistency-graph.json \
  --graph .yomi/demo-graph.json \
  --url http://127.0.0.1:5173
```

The verifier output is source-linked JSON. A coding agent should use it to decide
whether to continue editing or stop.
