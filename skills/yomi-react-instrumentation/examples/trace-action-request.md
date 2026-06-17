# Trace Action Request Example

Use this when browser output shows the wrong result but the source path from user action to behavior owner is unclear.

Start with the action node from `yomi repair` or `yomi query action-path <action-id>`. Instrument that action before instrumenting display components.

Good action traces have:

- a source location
- a graph node id
- a useful action name
- a correlation id when the action starts async work
