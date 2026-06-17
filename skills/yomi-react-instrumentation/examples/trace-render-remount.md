# Trace Render And Remount Example

Use this when local state disappears, an input resets, or a child component appears to remount.

Trace points to prefer:

1. Parent render owner.
2. Suspicious key or identity source.
3. Child component mount/unmount lifecycle.
4. Child local state owner.

The important evidence is whether the same logical entity receives a new runtime instance id after a parent state change.
