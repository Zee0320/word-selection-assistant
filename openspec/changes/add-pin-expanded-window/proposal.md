## Why

When users expand the translation or AI chat panel, the window currently hides after focus moves elsewhere. This interrupts workflows such as reading, copying, or chatting in WeChat while keeping the assistant result visible.

## What Changes

- Add a pin control that appears only when an expanded floating panel is open.
- When pinned, external clicks and window blur SHALL NOT hide the expanded floating window.
- Clicking the pin control again unpins the window and restores the existing auto-hide behavior.
- While pinned, a new text selection updates the expanded panel content instead of collapsing the window.
- AI chat clears previous messages when pinned content changes to a new selection.

## Capabilities

### New Capabilities

- `floating-window-pin`: Pinning behavior for expanded floating windows, including UI state, hide suppression, and pinned content refresh.

### Modified Capabilities

_None_

## Impact

- Affects floating window lifecycle management in the main process.
- Adds a small IPC surface between the floating renderer and main process for pinned state.
- Updates floating toolbar markup, styles, and renderer state handling.
- No new runtime dependencies, settings persistence, or packaging changes.
