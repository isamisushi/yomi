# Comparison

Yomi overlaps with several tool categories, but it should not be positioned as a
replacement for all of them.

The key distinction is output shape. Most adjacent tools expose browser state,
runtime events, component performance, or code references. Yomi tries to return a
repair contract for an AI coding agent:

- `editTarget`
- `evidenceTrail`
- `doNotStartFrom`
- `suggestedFixShape`
- `recommendedTraceTargets`
- verifier trace

## Where Yomi Plays

Yomi should own the handoff between an observed frontend symptom and a source
edit loop:

```txt
observed UI symptom
  -> React-specific ownership path
  -> likely edit target
  -> do-not-start surfaces
  -> focused runtime trace plan
  -> verification evidence
```

That means Yomi should not try to win by becoming the best browser controller,
the richest time-travel debugger, or the broadest repo index. Those are already
strong categories. Yomi should win when the question is:

> Given this visible React bug, where should the coding agent inspect first, what
> should it avoid editing, and what minimal runtime history would prove the
> cause?

## Competitive Map

| Category | Examples | Strong at | Yomi should own |
| --- | --- | --- | --- |
| Browser automation | [Playwright MCP](https://github.com/microsoft/playwright-mcp), [Stagehand](https://github.com/browserbase/stagehand) | Operating pages, reproducing user flows, reading accessibility/page state | Turning the reproduced symptom into React source ownership and a repair contract |
| Browser/devtools bridge | [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Console, network, performance, DOM, live browser inspection | Mapping browser facts back to component/action/state/effect/cache owners |
| Time-travel debugging | [Replay MCP](https://docs.replay.io/basics/replay-mcp/overview) | Rich recorded runtime history, variables, source, React component inspection | Focused trace target selection and edit-oriented repair routing |
| React inspection/performance | React DevTools, React Scan-style tools | Component trees, renders, performance signals | Agent-readable behavior ownership for visible UI failures |
| Repo graph/code search | Repository graph and symbol retrieval tools | Cross-file navigation, references, dependency structure | React-specific semantics: UI nodes, props, state, actions, effects, cache, forms, stores, traces |
| Coding agents | Codex, Claude Code, Cursor | Editing, terminal use, tests, review loops | Domain context and workflow constraints that make agents start in the right place |

The wedge is not "Yomi can inspect React." The wedge is:

> Yomi makes the first edit target and the verification path explicit for React
> UI bugs.

## Browser Automation

Examples: [Playwright MCP](https://github.com/microsoft/playwright-mcp) and
[Browserbase Stagehand](https://github.com/browserbase/stagehand).

These tools operate the browser, inspect pages, run scenarios, or expose browser
state. Yomi depends on browser verification when runtime behavior matters, but
its core value is mapping a visible React symptom to source-linked ownership and
repair context.

Use browser automation to reproduce and verify. Use Yomi to decide where the
React behavior is owned.

## Browser and DevTools Bridges

Examples: [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp).

DevTools bridges give agents browser-backed debugging facts: console output,
network requests, DOM state, performance traces, and page inspection. Yomi should
not compete by exposing generic browser facts.

Use DevTools-style tools to observe what happened in the browser. Use Yomi to
join those observations to React source ownership and the next repair step.

## Time-Travel Debugging

Examples: [Replay MCP](https://docs.replay.io/basics/replay-mcp/overview) and
similar recording/debugging tools.

Time-travel debugging can expose rich runtime history. Yomi is narrower: it
tries to produce the smallest source-linked trace plan an agent needs before
editing. It is not trying to record every event.

## React Inspection and Performance Tools

Examples: React DevTools, React Scan.

These tools help humans inspect component trees, renders, and performance
signals. Yomi targets coding agents and returns JSON contracts: repair targets,
do-not-start hints, trace targets, and verifier output.

## Repo Graphs and Code Search

Repo graph and code search tools help find symbols and references. Yomi adds
React-specific semantics: visible UI nodes, action/state/effect paths, cache and
form ownership, prop boundaries, and source-linked runtime traces.

## Coding Agents

Examples: Codex, Claude Code, Cursor, and other agentic coding tools.

Yomi is not a replacement for the agent. It is context infrastructure for the
agent. The agent still edits code, runs tests, and reviews the diff. Yomi reduces
the search space and gives the agent a repair-oriented contract.

## Summary

Use the adjacent tools for their native strengths. Use Yomi when the missing
piece is the React-specific ownership path from visible symptom to edit target
and verification evidence.
