# UOS ARM64 X11 Manual Verification Matrix

Run this matrix on installed UOS ARM64 hardware with `XDG_SESSION_TYPE=x11`.

## Environment

- [ ] `uname -m` reports `aarch64` or `arm64`.
- [ ] `/etc/os-release` identifies UOS or UnionTech OS.
- [ ] `xinput`, `xdotool`, and `xclip` are installed.
- [ ] `./scripts/collect-uos-capture-evidence.sh` completes and its output is attached.
- [ ] `npm run build:linux:arm64` produces an ARM64 `.deb`.
- [ ] The generated `.deb` installs successfully.

## Selection Capture

Repeat each selection case three times in a native UOS text editor and once in a Chromium-based browser.

| Case | Expected result | Result |
| --- | --- | --- |
| Single left click | No toolbar | NOT RUN |
| Drag fewer than 5 pixels | No toolbar | NOT RUN |
| Drag-select text horizontally | Toolbar with selected text | NOT RUN |
| Drag-select text vertically | Toolbar with selected text | NOT RUN |
| Double-click a word | Toolbar with selected word | NOT RUN |
| Triple-click a paragraph | Toolbar with selected paragraph | NOT RUN |
| Empty or whitespace selection | No toolbar | NOT RUN |
| Pause from tray, then select text | No toolbar | NOT RUN |
| Resume from tray, then select text | Toolbar appears | NOT RUN |

## Actions

| Case | Expected result | Result |
| --- | --- | --- |
| Translate captured text | Translation panel opens | NOT RUN |
| AI Chat with captured text | Chat receives selected context | NOT RUN |
| Close or click outside toolbar | Toolbar hides normally | NOT RUN |

Any missed valid selection, toolbar shown for an empty selection, incorrect selected text, process crash, or frozen `xinput` watcher is a failure.
