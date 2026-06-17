# Cache Invalidation Repair Example

Use `yomi query data-path <action-id>` when a visible list, detail panel, or summary remains stale after a mutation.

Read cache match strength carefully:

- `exact`: the operation targets the same key as the remote read.
- `prefix`: the operation targets a broader key family.
- `maybe`: source inspection is required before editing.

The likely edit target is usually the cache operation, mutation callback, SWR `mutate`, TanStack Query invalidation, router refresh, or server revalidation path.
