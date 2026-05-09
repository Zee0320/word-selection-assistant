## Context

The floating window is managed by the Electron main process. The renderer owns toolbar/panel UI state and asks the main process to resize, collapse, move, or hide the window through preload IPC. Automatic hiding currently comes from `blur` and global mouse-down handling, both routed through `requestHide()`.

## Goals / Non-Goals

**Goals:**
- Add a pin state for expanded panels that suppresses automatic hide.
- Keep main process as the authoritative owner of pinned state.
- Keep renderer responsible for showing the button and refreshing the currently active panel.
- Preserve current behavior when the window is not pinned.

**Non-Goals:**
- Persist pin state in settings.
- Change always-on-top behavior.
- Add new dependencies or platform-specific focus behavior.

## Decisions

- Store `isPinned` in the main process next to `isExpanded`, because hide decisions happen there and must not depend on renderer timing.
- Add explicit IPC for pin state changes and return the applied state to the renderer, rather than inferring pinning from CSS classes.
- Include the current pinned state in `show-toolbar` payloads so the renderer can preserve expanded-panel refresh behavior for new selections.
- Clear pin state on hide and collapse so fixed behavior never leaks into a later collapsed toolbar session.

## Risks / Trade-offs

- [Risk] A pinned window may obscure other applications longer than expected → Mitigation: pin button has an active visual state and can be toggled off directly.
- [Risk] New selections during pinned AI chat could mix old and new context → Mitigation: clear chat messages when the selected-text context changes.
- [Risk] Renderer and main process pin states could diverge → Mitigation: main process returns the actual state through IPC and includes it in future toolbar payloads.
