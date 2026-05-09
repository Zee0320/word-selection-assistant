## 1. Pin State and IPC

- [x] 1.1 Add main-process pinned state and expose set/toggle helpers.
- [x] 1.2 Add preload and main IPC for renderer pin state changes.
- [x] 1.3 Include current pinned state in floating toolbar show payloads.

## 2. Hide Behavior

- [x] 2.1 Suppress `requestHide()` while an expanded window is pinned.
- [x] 2.2 Suppress blur-triggered hide while pinned.
- [x] 2.3 Clear pinned state when the window hides or collapses.

## 3. Renderer UI and Refresh

- [x] 3.1 Add a pin toolbar button that appears only for expanded panels.
- [x] 3.2 Sync pin button active state and title from main-process responses.
- [x] 3.3 Preserve the active pinned panel on new selections and refresh translation or AI chat content.

## 4. Verification

- [x] 4.1 Run JavaScript syntax checks for changed main/preload/renderer files.
- [x] 4.2 Verify OpenSpec status shows the change is apply-ready.
