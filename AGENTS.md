# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

A global word selection assistant for Windows that provides instant translation and AI chat when selecting text in any application. Runs as a system tray application with a floating toolbar.

## Commands

```bash
npm start          # Run the Electron app
npm run dev        # Run with --dev flag
npm run build      # Build Windows installer (electron-builder)
npm run rebuild    # Rebuild native modules (better-sqlite3, uiohook-napi)
```

## Architecture

Electron app with three layers:

**Main Process** (`src/main/`)
- `index.js` - Entry point, IPC handlers, lifecycle management
- `text-capture.js` - Global mouse hook via uiohook-napi, captures selected text by simulating Ctrl+C
- `floating-window.js` - Frameless transparent window management, positioning near mouse cursor
- `settings-window.js` - Settings window management
- `tray.js` - System tray icon with context menu (pause/resume/settings/quit)
- `ai-client.js` - OpenAI-compatible API client with streaming support
- `dictionary.js` - ECDICT offline SQLite dictionary + Free Dictionary API
- `store.js` - Settings persistence via electron-store

**Preload Scripts** (`src/preload/`)
- Bridge IPC between main and renderer processes
- Expose `window.api` to renderer with invoke/send methods
- `marked` library for Markdown rendering

**Renderer** (`src/renderer/`)
- `floating/` - Floating toolbar UI (translation button, AI chat button, panels)
- `settings/` - Settings window UI (API config, feature toggles)

## Key Patterns

- **IPC Communication**: Main process uses `ipcMain.handle()` for async requests, `ipcMain.on()` for streaming. Renderer calls via preload-exposed `window.api`.
- **Streaming Responses**: AI translation/chat use SSE streaming via `ipcRenderer.on()` event listeners in preload.
- **Text Classification**: Words/phrases (≤threshold words) use dictionary lookup; sentences use AI translation.
- **Window Management**: Floating window is preloaded and reused; hidden on blur, shown on text capture.
- **Single Instance**: `app.requestSingleInstanceLock()` prevents multiple instances.

## Native Dependencies

- `@mukea/uiohook-napi` - Global keyboard/mouse hooks for capturing text selection
- `better-sqlite3` - ECDICT offline English-Chinese dictionary database

After installing or updating these, run `npm run rebuild` to rebuild for Electron's Node version.

## Data Files

- `assets/ecdict.db` - ECDICT SQLite dictionary (~30MB), packaged as extraResource in builds
- Settings stored in electron-store (JSON file in user data directory)

## API Configuration

User must configure in settings:
- `apiBaseUrl` - OpenAI-compatible API endpoint
- `apiKey` - API key
- `translateModel` / `chatModel` - Model names for translation and chat

The client auto-appends `/v1/chat/completions` if needed and handles SiliconFlow/DeepSeek special paths.