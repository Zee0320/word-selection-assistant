## 1. Project Scaffolding

- [x] 1.1 Initialize Electron project with npm, create package.json with project metadata and scripts (dev, build, pack)
- [x] 1.2 Install core dependencies: electron, electron-builder, uiohook-napi, better-sqlite3, electron-store
- [x] 1.3 Create directory structure: src/main/, src/renderer/floating/, src/renderer/settings/, src/preload/, assets/
- [x] 1.4 Create main process entry point (src/main/index.js) with basic Electron app lifecycle (ready, window-all-closed, activate)
- [x] 1.5 Download and place ECDICT SQLite database file into assets/ecdict.db

## 2. Settings Store

- [x] 2.1 Create src/main/store.js using electron-store with schema definition and defaults (apiBaseUrl, apiKey, modelName, translationEnabled, aiChatEnabled, phraseThreshold)
- [x] 2.2 Implement IPC handlers for get-settings, save-settings, and on-settings-changed events
- [x] 2.3 Create src/preload/settings-preload.js exposing settings API via contextBridge

## 3. System Tray

- [x] 3.1 Create tray icon asset (assets/icon.png, 16x16 and 32x32)
- [x] 3.2 Create src/main/tray.js with Tray initialization and context menu (Settings, Pause/Resume, Quit)
- [x] 3.3 Implement Pause/Resume toggle that enables/disables text capture and updates menu label
- [x] 3.4 Implement double-click tray icon to open settings window
- [x] 3.5 Wire tray into main process app lifecycle (create on ready, cleanup on quit)

## 4. Text Capture

- [x] 4.1 Create src/main/text-capture.js with uiohook-napi global mouseup listener
- [x] 4.2 Implement click-vs-drag detection (5px threshold between mousedown and mouseup positions)
- [x] 4.3 Implement clipboard simulation sequence: backup → Ctrl+C → read → restore, with 50ms delays
- [x] 4.4 Implement empty selection filtering (clipboard unchanged = no text selected)
- [x] 4.5 Implement self-window exclusion (skip capture when mouseup is in own BrowserWindow)
- [x] 4.6 Emit captured text + mouse coordinates to floating window manager

## 5. Floating Window

- [x] 5.1 Create src/main/floating-window.js managing a frameless, transparent, alwaysOnTop BrowserWindow (skipTaskbar, no show in Alt+Tab)
- [x] 5.2 Implement window positioning logic: 10px below/right of cursor, with screen bounds clamping
- [x] 5.3 Implement show/hide lifecycle: show on text capture, hide on blur event
- [x] 5.4 Create src/preload/floating-preload.js exposing IPC bridge for translation, chat, and settings data
- [x] 5.5 Handle new selection while window is open: close current, re-open with new content

## 6. Floating Toolbar UI

- [x] 6.1 Create src/renderer/floating/index.html with base structure for toolbar, translation panel, and chat panel
- [x] 6.2 Create src/renderer/floating/style.css with dark theme, glassmorphism effects, smooth transitions for panel expansion
- [x] 6.3 Implement toolbar buttons (Translate, AI Chat) that show/hide based on feature toggles received via IPC
- [x] 6.4 Implement panel expand/collapse animations (toolbar → translation panel, toolbar → chat panel)

## 7. Dictionary Service

- [x] 7.1 Create src/main/dictionary.js with ECDICT SQLite query function (lookup by word, return phonetic, translation, definition)
- [x] 7.2 Implement Free Dictionary API client (GET https://api.dictionaryapi.dev/api/v2/entries/en/{word}) with timeout and error handling
- [x] 7.3 Implement dual-source merge: combine Free Dictionary API results (English definitions, phonetics, examples) with ECDICT results (Chinese definitions)
- [x] 7.4 Implement fallback logic: if Free Dictionary API fails, return ECDICT-only results
- [x] 7.5 Register IPC handler for translate-word requests from renderer

## 8. Translation Feature

- [x] 8.1 Implement text classification function: count whitespace-split words, compare against phraseThreshold setting
- [x] 8.2 Implement language detection (Chinese vs English) using Unicode range check
- [x] 8.3 Implement translation panel renderer UI: dictionary mode (phonetics, POS, definitions, examples sections) and AI mode (streaming text area)
- [x] 8.4 Wire translate button click → IPC → classify text → dictionary lookup or AI translate → render results
- [x] 8.5 Handle word-not-found case: fallback from dictionary mode to AI translation

## 9. AI Client

- [x] 9.1 Create src/main/ai-client.js with OpenAI-compatible API client (POST /v1/chat/completions)
- [x] 9.2 Implement streaming SSE parser: parse `data: {...}` lines, extract delta content tokens
- [x] 9.3 Implement translation prompt template: system message for Chinese↔English translation based on detected language
- [x] 9.4 Implement IPC streaming bridge: main process sends chunks to renderer via webContents.send() as they arrive
- [x] 9.5 Implement error handling: network errors, API errors, incomplete responses
- [x] 9.6 Implement API configuration validation: check that baseUrl, apiKey, and model are set before making requests

## 10. AI Chat Feature

- [x] 10.1 Implement chat panel UI: context display area (shows selected text), message list with user/assistant bubbles, input textarea with send button
- [x] 10.2 Implement chat message rendering with streaming: append tokens to latest assistant message as they arrive, auto-scroll
- [x] 10.3 Implement conversation history management: maintain messages array, include system context (selected text) + full history in each request
- [x] 10.4 Implement input handling: Enter to send, Shift+Enter for newline, empty message prevention
- [x] 10.5 Implement chat session lifecycle: reset on new text selection, discard on window close
- [x] 10.6 Implement error display and retry mechanism in chat UI

## 11. Settings Window

- [x] 11.1 Create src/main/settings-window.js managing a standard BrowserWindow for settings
- [x] 11.2 Create src/renderer/settings/index.html with form layout: API config section (base URL, API key, model name), feature toggles, phrase threshold slider
- [x] 11.3 Create src/renderer/settings/style.css with clean form styling matching the app's dark theme
- [x] 11.4 Create src/renderer/settings/script.js: load current settings on open, auto-save on change, validate API configuration
- [x] 11.5 Implement missing API config warning: show inline notification when AI features are used without API configuration

## 12. Integration & Polish

- [x] 12.1 Wire all modules together in src/main/index.js: tray → text-capture → floating-window → dictionary/ai-client
- [ ] 12.2 Test full flow: select text in Notepad → toolbar appears → translate word → dictionary results shown
- [ ] 12.3 Test full flow: select text in browser → toolbar appears → AI translate sentence → streaming result shown
- [ ] 12.4 Test full flow: select text → AI chat → multi-turn conversation with context
- [ ] 12.5 Test feature toggles: disable translation → only chat button shown, disable chat → only translate shown, disable both → no toolbar
- [ ] 12.6 Test system tray: pause/resume, settings open, quit
- [ ] 12.7 Configure electron-builder.yml for Windows x64 NSIS installer packaging
