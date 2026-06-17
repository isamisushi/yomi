# Why Yomi

AI coding agents are good at editing code once they know where to work. React UI
bugs often hide that location.

A visible stale value may be rendered by a design-system component, owned by a
parent state transition, refreshed by an effect, invalidated through a cache
operation, or broken across a prop/form/store boundary. Screenshots, DOM
inspection, and file search usually expose only part of that chain.

Yomi's narrow job is to expose the repair chain:

```txt
visible UI symptom
  -> source-linked owner
  -> action/state/effect/cache/form/store path
  -> likely edit target
  -> minimal runtime trace plan
  -> verifier result
```

## What Makes It Different

Yomi is repair-oriented. It does not try to show every browser event, every DOM
mutation, or every React render. It tries to answer the question an agent needs
before editing:

> Which source owner should I inspect first, and what runtime history would prove
> the cause?

That is why `repair` returns `editTarget`, `evidenceTrail`, `doNotStartFrom`,
and `suggestedFixShape`, while `plan-trace` returns the smallest instrumentation
targets and a ready `instrumentCommand`.

## When It Helps

Yomi is most useful for bugs where the rendered surface is not the behavior
owner:

- stale async response overwrites newer UI state
- wrong cache invalidation leaves stale visible data
- form submit ignores validation ownership
- parent key remount loses child local state
- shared hook change regresses another consumer
- prop boundary rename breaks visible display
- server action or route refresh changes client-visible data

Yomi is not the right tool for isolated copy edits, CSS-only layout tweaks, or
bugs where a direct compiler/test failure already points to the exact file.
