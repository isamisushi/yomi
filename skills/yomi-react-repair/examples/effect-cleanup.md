# Effect Cleanup Repair Example

Use repair output and runtime trace to distinguish display symptoms from lifecycle ownership.

Useful trace events:

- `effect-ran`
- `cleanup-ran`
- `component-mounted`
- `component-unmounted`
- `render-committed`

For listener, timer, subscription, request, and observer bugs, inspect the effect body and cleanup behavior before changing rendered output.
