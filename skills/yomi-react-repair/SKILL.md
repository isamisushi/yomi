---
name: yomi-react-repair
description: Use Yomi repair briefs to debug visible React UI bugs with source-linked state, effect, cache, and trace evidence.
allowed-tools: Bash(yomi *) Read Grep Glob
---

# Yomi React Repair

Use this skill when a user reports a visible React UI bug in an existing React or Next.js app and wants an AI coding agent to locate the behavior owner before editing.

This skill is not a replacement for the generated `yomi` command-reference skill. Use the generated skill for exact command syntax. Use this skill for the repair workflow and editing discipline.

## Default Workflow

1. Run `yomi index --force` for the target project.
2. Run `yomi repair "<visible UI label>"`.
3. Inspect `editTarget` first.
4. Treat `doNotStartFrom` as evidence-only unless source inspection proves Yomi is stale.
5. Read the relevant source around the behavior path in `evidenceTrail`.
6. For async, cache, form, or effect bugs, inspect `data-path`, `runtime-trace`, or the verifier trace before patching.
7. Patch the smallest source owner that explains the visible behavior.
8. Run `yomi index --force` again after source edits.
9. Run the suggested verifier or browser scenario.

## Hard Rules

- Do not start by editing display-only components when Yomi provides a behavior owner.
- Do not trust stale graph output after source edits; re-run `yomi index --force`.
- Do not invent unsupported Yomi flags. Read the generated command docs for exact syntax.
- If Yomi output and source inspection disagree, source inspection wins and the graph should be rebuilt.
- Keep patches scoped to the behavior path shown in `evidenceTrail`.
- Do not widen a frontend fix into unrelated refactors unless the user asks for it.

## Reading Repair Output

- `editTarget` is the first source location to inspect, not an instruction to blindly edit that exact line.
- `whyEditTarget` explains why Yomi thinks this source owns the behavior.
- `evidenceTrail` links the visible surface to state transitions, actions, effects, data/cache ownership, form/store/context ownership, and verification evidence.
- `doNotStartFrom` lists tempting surfaces that render the symptom but probably do not own the bug.
- `suggestedFixShape` describes the repair category, not a complete patch.
- `nextCommands` are the next Yomi commands to run after inspection or patching.

## Bug-Type Playbooks

### Stale async response or race condition

Look for the action, request start, response resolution, and state commit ordering. A common fix is to abort or ignore stale responses before committing state. If the repair brief identifies the likely behavior owner but runtime ordering evidence is missing, use the `yomi-react-instrumentation` skill to add the smallest trace points needed.

### Cache invalidation or stale server state

Run `yomi query data-path <action-id>`. Treat `exact` matches as stronger evidence than `prefix`, and treat `maybe` as a prompt for source inspection. The likely edit target is often the cache operation, mutation callback, or route refresh path rather than the component that renders stale data.

### Effect cleanup or lifecycle bug

Look for `effect-ran`, `cleanup-ran`, mount, unmount, and render events. If lifecycle evidence is missing, use the `yomi-react-instrumentation` skill before changing effect dependencies or cleanup behavior.

### Form validation bug

Prefer form field ownership, resolver/schema ownership, registration, controlled field, and `formState.errors` evidence over display-only error text. Keep the fix at the validation or submit owner unless source inspection proves the graph is stale.

## Prompt Snippet

Use Yomi to debug this visible React UI bug. Start with `yomi index --force`, then run `yomi repair "<visible label>"`. Follow `editTarget`, avoid `doNotStartFrom`, patch only the behavior owner, and verify with the suggested command.
