# Clarified Requirements for Issue-6: Empty Selection

## Four Rules

1. **No selected text**: The floating window must not appear, even briefly.
2. **Valid selected text**: Show the floating window as soon as capture confirms the text.
3. **Translation and AI buttons may remain disabled/pending** until their own prerequisites are ready.
4. **Pending action state is not permission to show a textless window**.

## State Table

| Captured text | Action readiness | Window | Buttons |
|---|---|---|---|
| Unknown/unresolved | Any | Hidden | Not applicable |
| Empty/whitespace | Any | Hidden | Not applicable |
| Non-empty | Pending | Visible with selected text | Disabled/loading |
| Non-empty | Ready | Visible with selected text | Enabled |
