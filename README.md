# Word Selection Assistant

Windows global word selection assistant built with Electron. Select text in any application to open a small floating toolbar for translation or AI chat.

## Features

- Global text selection capture on Windows via `@mukea/uiohook-napi`
- Floating toolbar near the mouse cursor
- Word and phrase lookup with an offline ECDICT SQLite database
- Sentence translation through an OpenAI-compatible chat completions API
- AI chat using the selected text as context
- Pin expanded panels so translation or chat stays visible while working in other apps
- System tray app with pause/resume, settings, and quit actions
- Settings window for API endpoint, API key, model names, and feature toggles

## Requirements

- Windows x64
- Node.js and npm
- Native build tools required by Electron native modules
- Local dictionary database at `assets/ecdict.db` for offline dictionary lookup

`assets/ecdict.db` is intentionally not tracked in Git because it is a large local data file. Place the database at that path before running dictionary lookup or packaging.

## Setup

```bash
npm install
npm run rebuild
```

## Run

```bash
npm start
```

Development mode:

```bash
npm run dev
```

## Build

```bash
npm run build
```

The Windows portable build output is written to `dist/`.

## API Configuration

Open the settings window from the tray menu and configure:

- API base URL for an OpenAI-compatible endpoint
- API key
- Translation model
- Chat model

The app calls `/v1/chat/completions` when needed and supports streaming responses.

## Project Structure

```text
src/main/       Electron main process, global hooks, tray, windows, AI and dictionary clients
src/preload/    IPC bridge scripts exposed to renderer windows
src/renderer/   Floating toolbar UI and settings UI
assets/         App icons and local dictionary database location
tests/          Local test and simulation helpers
```

## Notes

- `node_modules/`, `dist/`, `assets/ecdict.db`, `.agent/`, `.agents/`, `.claude/`, and `openspec/` are ignored.
- After installing or changing native dependencies, run `npm run rebuild`.
- User settings are stored by `electron-store` in the app user data directory, not in this repository.
