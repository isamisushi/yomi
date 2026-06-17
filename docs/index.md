---
layout: home

hero:
  name: Yomi
  text: React repair context for AI coding agents
  tagline: Move from a visible UI symptom to the source owner, runtime trace plan, and verification loop.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: See the Demo
      link: /demo
    - theme: alt
      text: Why Yomi
      link: /why-yomi

features:
  - title: Visible symptom to source owner
    details: Start from the label, button, input, or panel the user can see, then get a source-linked repair contract.
  - title: Repair-oriented trace planning
    details: Use plan-trace to pick the smallest action, state, effect, cache, store, form, or render targets before editing.
  - title: Agent-readable JSON
    details: Commands return stable JSON contracts so coding agents can chain repair, instrumentation, and verification.
---

## Minimal Loop

```bash
npx @isamisushi/yomi@latest index --force
npx @isamisushi/yomi@latest repair "Customer search"
npx @isamisushi/yomi@latest plan-trace "Customer search"
npx @isamisushi/yomi@latest verify browser-scenario --scenarioFile <path> --url <url>
```

Yomi is not a browser automation framework, React DevTools replacement, or UI
generator. It is a focused layer for React repair work where the visible UI is
not enough to identify the right source owner.

## Current Status

Yomi is early. It already includes a TypeScript-aware React extractor, compact
graph queries, repair briefs, opt-in runtime instrumentation adapters, verifier
scenarios, and a React repair benchmark fixture.

## Recommended Reading Order

1. [Why Yomi](/why-yomi) - understand the narrow problem Yomi solves.
2. [Demo Walkthrough](/demo) - see `repair`, `plan-trace`, and `verify` together.
3. [Getting Started](/getting-started) - run Yomi locally.
4. [Agent Workflow](/agent-workflow) - use Yomi during real repair work.
5. [Runtime Instrumentation](/runtime-instrumentation) - add focused app traces when ordering matters.
6. [CLI Reference](/cli) - inspect command contracts.
7. [Limitations](/limitations) - know where the current implementation is weak.
