# Limitations

Yomi is early. The public project should be explicit about that.

## Implemented Today

- TypeScript-aware React/TSX extraction through `ts-morph`
- source-linked frontend graph output
- compact graph queries
- visible UI to repair brief flow
- repair contracts with `editTarget`, `evidenceTrail`, `doNotStartFrom`, and
  `suggestedFixShape`
- `plan-trace` for repair-oriented instrumentation target selection
- opt-in React runtime trace adapters
- deterministic verifier scenarios
- React repair benchmark examples
- Crust-based CLI package staging and dry-run verification

## Not Complete Yet

- automatic production instrumentation
- complete React semantics
- complete Next.js Server Component semantics
- every state, form, data, and router library
- automatic code patching
- screenshot or visual AI understanding
- guaranteed correctness on stale or incomplete graphs

## Practical Guidance

Use Yomi as a source-linked repair aid, not an oracle. Agents should still read
the code around the returned source locations, run the normal tests, and verify
the visible behavior after changes.

When `doctor` fails or the graph looks stale, rebuild with:

```bash
yomi index --force
```

If the repair plan points to a display-only surface with weak evidence, inspect
the graph before editing.
