# Agent Workflow

Yomi is designed for coding agents, not as a human-only inspection UI.

The intended loop is:

```txt
visible bug
  -> Yomi repair query
  -> source-linked owner and repair target
  -> optional trace plan when runtime order is unclear
  -> scoped code edit using normal coding tools
  -> Yomi verifier or scenario
  -> source-linked pass/fail trace
```

## 1. Start From the Visible Symptom

When a user reports a frontend bug, the agent should first identify the visible
surface:

- text label
- input placeholder
- button label
- form field
- status message
- panel or route label

Then run:

```bash
yomi repair "<visible UI label>"
```

or, in this repository:

```bash
npm run yomi -- repair "<visible UI label>"
```

## 2. Read the Repair Contract

The repair output is agent-oriented JSON. The important fields are:

- `editTarget` - the source node Yomi thinks should be inspected or edited first.
- `whyEditTarget` - the reason that node owns the behavior.
- `evidenceTrail` - visible surface, owner, state/action/effect/cache, form, store, context, and verification evidence.
- `doNotStartFrom` - tempting but likely wrong files or display-only nodes.
- `suggestedFixShape` - the repair shape, not a full patch.
- `nextCommands` - commands for verification or follow-up queries.

The agent should treat `editTarget` as the starting point, not as an instruction
to blindly patch that exact line.

## 3. Inspect Before Editing

The agent should inspect the source around:

- the visible UI owner
- the action that mutates state or starts async work
- the effect or cache operation that refreshes data
- the form/store/context boundary if present
- source locations in the evidence trail

The agent should avoid starting from display-only components when Yomi has
identified a behavior owner.

## 4. Plan Runtime Tracing When Needed

When static repair evidence is not enough, ask Yomi for the smallest runtime
trace plan:

```bash
yomi plan-trace "<visible UI label>"
```

Use this for bugs that depend on ordering or history:

- action -> request -> response -> state commit
- effect run -> cleanup -> unmount
- form validation -> submit
- cache mutation -> visible stale data
- parent render/key -> child remount/state loss

The returned `instrumentCommand` should be treated as a proposal. Review the
recommended targets against the repair evidence before applying instrumentation.
See [Runtime Instrumentation](./runtime-instrumentation.md) for the adapter
APIs and verifier flow.

## 5. Patch With Normal Code Tools

Yomi does not need to be the patching mechanism.

The coding agent should use its normal file editing tools, tests, typechecker,
and review workflow. Yomi's role is to reduce search waste and make the repair
target explicit.

## 6. Verify With a Scenario

Prefer a verification command that matches the reported symptom:

```bash
yomi verify <scenario>
```

or:

```bash
yomi verify browser-scenario --scenarioFile <file> --url <url>
```

A failed verifier should return:

- violated rule
- observed trace
- source-linked repair plan
- likely edit target
- do-not-start hints

That lets the agent continue the repair loop without re-deriving ownership from
screenshots and raw DOM.

## When Yomi Is Most Useful

Yomi is most useful for bugs where the visible UI is not owned by the file that
needs the fix:

- stale async response overwrites newer UI state
- wrong cache invalidation leaves stale visible data
- submit action ignores form validation state
- parent key remount loses child local state
- shared hook edit regresses another consumer
- prop boundary rename breaks display
- server action or router refresh affects client-visible data

Yomi is less useful for isolated CSS tweaks or one-line copy changes.
