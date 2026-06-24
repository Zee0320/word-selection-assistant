# Issue 3 UOS ARM64 Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete issue #3 by validating the existing UOS ARM64 X11 backend on real hardware and fixing only defects demonstrated by that evidence.

**Architecture:** Preserve the current Windows backend and the existing UOS-only routing. Add a repeatable evidence collector, build/install the ARM64 deb on UOS X11, exercise selection capture end to end, and keep the issue blocked if real hardware evidence is unavailable.

**Tech Stack:** Electron, Node.js, UOS ARM64, X11, `xinput`, `xdotool`, `xclip`, shell scripts, Debian package build.

---

## Current State

- Branch/worktree: `.claude/worktrees/issue-3-uos-x11`, HEAD `8f00392`.
- Fresh `npm test`: 188 passed, 0 failed.
- Deepin is rejected; missing session type is rejected; required commands are `xinput`, `xdotool`, `xclip`.
- Verification is correctly `BLOCKED`, but still contains unchecked checklist placeholders and no machine output.
- No PR exists and the branch is not integrated.

## Files

- Create: `.claude/worktrees/issue-3-uos-x11/scripts/collect-uos-capture-evidence.sh`
- Create: `.claude/worktrees/issue-3-uos-x11/tests/uos-evidence-script.test.js`
- Modify if hardware reveals defects: `src/main/platform-info.js`, `src/main/linux-selected-text-reader.js`, `src/main/linux-x11-selection-watcher.js`, `src/main/text-capture.js`
- Modify if needed: corresponding tests
- Modify: `.claude/worktrees/issue-3-uos-x11/docs/superpowers/verification/2026-06-14-issue-3.md`

### Task 1: Add A Repeatable UOS Evidence Collector

- [ ] **Step 1: Write a failing structure test**

Create `tests/uos-evidence-script.test.js` that reads `scripts/collect-uos-capture-evidence.sh` and asserts it contains these commands:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('UOS evidence script records required environment and tools', () => {
  const script = fs.readFileSync('scripts/collect-uos-capture-evidence.sh', 'utf8');
  for (const command of ['uname -m', 'XDG_SESSION_TYPE', '/etc/os-release', 'command -v xinput', 'command -v xdotool', 'command -v xclip']) {
    assert.match(script, new RegExp(command.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  }
});
```

- [ ] **Step 2: Create the collector script**

```bash
#!/usr/bin/env bash
set -euo pipefail

OUTPUT="${1:-docs/superpowers/verification/issue-3-uos-environment.txt}"
mkdir -p "$(dirname "$OUTPUT")"

{
  echo "captured_at=$(date --iso-8601=seconds)"
  echo "git_head=$(git rev-parse HEAD)"
  echo "uname_m=$(uname -m)"
  echo "XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-}"
  echo "DISPLAY=${DISPLAY:-}"
  echo "--- /etc/os-release ---"
  cat /etc/os-release
  echo "--- commands ---"
  command -v xinput
  command -v xdotool
  command -v xclip
  echo "--- versions ---"
  xinput --version || true
  xdotool version || true
  xclip -version 2>&1 || true
} | tee "$OUTPUT"

test "$(uname -m)" = "aarch64"
test "${XDG_SESSION_TYPE:-}" = "x11"
grep -Eiq '(^ID=uos$|uniontech|uos)' /etc/os-release
```

- [ ] **Step 3: Run the structure test**

Run: `node --test tests/uos-evidence-script.test.js`

Expected: PASS.

### Task 2: Build And Install On UOS ARM64 X11

- [ ] **Step 1: Collect environment evidence on the target machine**

```bash
chmod +x scripts/collect-uos-capture-evidence.sh
./scripts/collect-uos-capture-evidence.sh
```

Expected: script exits 0 and records `aarch64`, `x11`, UOS/UnionTech OS, and paths for all three commands.

- [ ] **Step 2: Install build/runtime prerequisites**

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 make g++ xinput xdotool xclip
npm ci
npm run rebuild:linux:arm64
```

- [ ] **Step 3: Run automated tests and build**

```bash
npm test
npm run build:linux:arm64
ls -lh dist/*.deb
```

Expected: 188 or more tests pass; an ARM64 `.deb` exists.

- [ ] **Step 4: Install the exact built package**

```bash
sudo apt-get install -y ./dist/*.deb
```

Record the package filename and SHA-256:

```bash
sha256sum dist/*.deb | tee docs/superpowers/verification/issue-3-package-sha256.txt
```

### Task 3: Perform End-to-End Capture Validation

- [ ] **Step 1: Run the app from a terminal with logs captured**

```bash
word-selection-assistant 2>&1 | tee docs/superpowers/verification/issue-3-runtime.log
```

- [ ] **Step 2: Execute the manual matrix**

Record PASS/FAIL for drag word, drag sentence, double-click word, triple-click line, empty drag, right-click, middle-click, pause/resume, missing-command status, and Wayland unsupported status. Test at least two native X11 applications.

- [ ] **Step 3: Investigate failures before changing code**

For each failure, record:

```text
application
gesture
xinput event observed
xclip PRIMARY output
xdotool active window result
application log result
```

Change code only after the failing boundary is identified. Add the smallest automated regression test before the fix.

### Task 4: Replace Checklist Verification With Evidence

- [ ] **Step 1: Rewrite the verification document**

The file must contain status, git SHA, environment evidence file, package SHA file, exact test count, build result, manual matrix, runtime log path, and changed files. Remove all unchecked boxes and `To be completed` text.

- [ ] **Step 2: Keep status honest**

Use `PASS` only when the target machine matrix passes. If no UOS ARM64 X11 machine is available, keep `BLOCKED` and do not close the issue.

- [ ] **Step 3: Run final checks**

```bash
npm test
grep -nE 'To be completed|\[ \]|PENDING|PARTIAL' docs/superpowers/verification/2026-06-14-issue-3.md && exit 1 || true
```

- [ ] **Step 4: Commit evidence**

```bash
git add scripts/collect-uos-capture-evidence.sh tests/uos-evidence-script.test.js docs/superpowers/verification
git commit -m "test: verify UOS ARM64 X11 capture on hardware"
```

