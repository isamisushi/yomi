# Trace State And Effect Example

Use this when the suspected bug is caused by state/effect ordering.

Trace points to prefer:

1. The user action that starts the behavior.
2. The state owner that receives updates.
3. The effect that reacts to the state or prop.
4. The state commit that changes visible output.

For race conditions, the trace should make the order explicit enough to explain why an older event committed after a newer one.
