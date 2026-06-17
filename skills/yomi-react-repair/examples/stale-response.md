# Stale Response Repair Example

Use `yomi repair "<visible label>"` first. For a stale response bug, the useful evidence is the ordering from action to request to response to state commit.

Expected repair shape:

1. Identify the visible UI node and action owner.
2. Inspect the effect or async owner that starts the request.
3. Confirm whether an older response can commit after a newer query.
4. Add abort, request id, or stale-response guard before the state commit.
5. Verify that the final trace no longer contains an older response committing stale state.

Avoid starting from a child component that only renders the stale value.
