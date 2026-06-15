# Word Selection Assistant

Global word selection assistant built with Electron. On Windows and UOS ARM64 X11, selecting text in another application opens a small floating toolbar for translation or AI chat. Other Linux environments use the standalone AI chat window and clipboard text from the tray.

## Features

- Global text selection capture on Windows via `@mukea/uiohook-napi`
- UOS ARM64 X11 automatic selection capture and Linux ARM64 deb packaging
- Floating toolbar near the mouse cursor
- Word and phrase lookup with an offline ECDICT SQLite database
- Sentence translation through an OpenAI-compatible chat completions API
- AI chat using the selected text as context
- Pin expanded panels so translation or chat stays visible while working in other apps
- System tray app with pause/resume, settings, and quit actions
- Settings window for API endpoint, API key, model names, and feature toggles

## Requirements

- Windows x64, or UOS ARM64/aarch64 with an X11 desktop session
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

Windows x64:

```bash
npm run build:win:x64
```

Linux ARM64/UOS deb:

```bash
npm run build:linux:arm64
```

Build the Linux ARM64 package on a Linux ARM64 environment, such as a UOS ARM64 machine or ARM64 Linux CI. In Linux package terminology the architecture is `arm64`; `uname -m` commonly reports the same hardware family as `aarch64`.

For Linux ARM64/UOS builds, rebuild only the native module needed by the chat-first package:

```bash
npm run rebuild:linux:arm64
```

## API Configuration

Open the settings window from the tray menu and configure:

- API base URL for an OpenAI-compatible endpoint
- API key
- Optional API request path, such as `/v1/chat/completions` or an internal gateway path
- Optional custom HTTP headers for intranet gateways or compatible API proxies
- Translation model
- Chat model

When the request path is empty, the app keeps its default behavior and calls `/v1/chat/completions` when needed. Custom headers are merged into AI requests after the default JSON and bearer authorization headers, so they can add gateway headers or override defaults when required.

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
- After installing or changing native dependencies, run `npm run rebuild`. For UOS/Linux ARM64 packaging, use `npm run rebuild:linux:arm64`.
- Automatic cross-application text capture on Linux is limited to UOS ARM64 X11. Other Linux environments use the tray action to ask AI with clipboard text.
- User settings are stored by `electron-store` in the app user data directory, not in this repository.

## UOS ARM64 X11 Capture

Automatic word selection capture is supported on UOS ARM64 when the desktop session is X11.

Required runtime commands:

- `xinput`
- `xdotool`
- `xclip`

Install them on UOS with:

```bash
sudo apt install xinput xdotool xclip
```

Wayland sessions are not supported for automatic capture. On Wayland or unsupported Linux environments, use the tray AI Chat entry or "Ask AI with clipboard text".
