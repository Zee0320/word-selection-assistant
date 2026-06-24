# Issue 3 UOS Branch Release Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the UOS ARM64 X11 implementation on a dedicated remote branch and replace the current hardware blocker with reproducible build, install, and selection-capture evidence from real UOS hardware.

**Architecture:** Keep UOS support outside the Windows `master` branch. Rename/publish the local implementation as `uos-arm64-x11`, validate only UOS ARM64 with explicit X11, and store machine-readable environment/build/manual evidence on that branch.

**Tech Stack:** Git, GitHub CLI, Electron Builder, Debian ARM64 package, UOS ARM64 X11, `xinput`, `xdotool`, `xclip`.

---

## Current State

- Local worktree: `.claude/worktrees/issue-3-uos-x11`
- HEAD: `18c597baa8c8f74281ed461916b940c67d7cb9d4`
- Fresh tests: 192 passed, 0 failed.
- Verification status is `BLOCKED`; no UOS hardware output exists.
- `origin` currently has no issue #3/UOS branch.
- Scope is UOS ARM64 X11 only; Deepin and Wayland must remain rejected.

## Files

- Modify: `.claude/worktrees/issue-3-uos-x11/scripts/collect-uos-capture-evidence.sh`
- Modify: `.claude/worktrees/issue-3-uos-x11/tests/uos-evidence-script.test.js`
- Create on UOS machine: `.claude/worktrees/issue-3-uos-x11/docs/superpowers/verification/issue-3/environment.txt`
- Create on UOS machine: `.claude/worktrees/issue-3-uos-x11/docs/superpowers/verification/issue-3/build.txt`
- Create on UOS machine: `.claude/worktrees/issue-3-uos-x11/docs/superpowers/verification/issue-3/package.sha256`
- Create on UOS machine: `.claude/worktrees/issue-3-uos-x11/docs/superpowers/verification/issue-3/manual-matrix.md`
- Modify: `.claude/worktrees/issue-3-uos-x11/docs/superpowers/verification/2026-06-14-issue-3.md`

### Task 1: Publish The Dedicated UOS Branch

- [ ] **Step 1: Verify branch contents and cleanliness**

```powershell
git -C .claude/worktrees/issue-3-uos-x11 status --short
git -C .claude/worktrees/issue-3-uos-x11 rev-parse HEAD
git -C .claude/worktrees/issue-3-uos-x11 log --oneline -8
```

Expected: clean worktree at `18c597b...`.

- [ ] **Step 2: Create the permanent branch name and push it**

```powershell
git -C .claude/worktrees/issue-3-uos-x11 branch -f uos-arm64-x11 HEAD
git push -u origin uos-arm64-x11
git ls-remote --heads origin uos-arm64-x11
```

Expected: remote output contains `refs/heads/uos-arm64-x11` at the pushed SHA. Do not open a PR to Windows `master`.

### Task 2: Make The Evidence Collector Produce Complete Files

- [ ] **Step 1: Add failing structure assertions**

In `tests/uos-evidence-script.test.js`, require the collector to record:

```js
for (const required of [
  'uname -a',
  'uname -m',
  '/etc/os-release',
  'XDG_SESSION_TYPE',
  'node --version',
  'npm --version',
  'xinput --version',
  'xdotool --version',
  'xclip -version',
  'git rev-parse HEAD'
]) {
  assert.match(script, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
```

- [ ] **Step 2: Run and verify failure if fields are absent**

Run: `node --test tests/uos-evidence-script.test.js`

- [ ] **Step 3: Update the collector**

Make `collect-uos-capture-evidence.sh` accept an output directory:

```sh
OUTPUT_DIR="${1:-docs/superpowers/verification/issue-3}"
mkdir -p "$OUTPUT_DIR"
exec > >(tee "$OUTPUT_DIR/environment.txt") 2>&1
```

Fail with non-zero status unless `uname -m` is `aarch64`/`arm64`, `/etc/os-release` identifies UOS/UnionTech, `XDG_SESSION_TYPE=x11`, and all three commands exist.

- [ ] **Step 4: Run tests and commit collector changes**

```powershell
node --test tests/uos-evidence-script.test.js tests/platform-info.test.js
git add scripts/collect-uos-capture-evidence.sh tests/uos-evidence-script.test.js
git commit -m "test: collect complete UOS ARM64 evidence"
git push
```

### Task 3: Build And Install On Real UOS ARM64 X11

- [ ] **Step 1: Clone the exact remote branch on the UOS machine**

```bash
git clone --branch uos-arm64-x11 https://github.com/Zee0320/word-selection-assistant.git
cd word-selection-assistant
git rev-parse HEAD
./scripts/collect-uos-capture-evidence.sh
```

Expected: collector exits 0 and writes `environment.txt`.

- [ ] **Step 2: Install dependencies, test, and build**

```bash
sudo apt-get update
sudo apt-get install -y xinput xdotool xclip
npm ci 2>&1 | tee docs/superpowers/verification/issue-3/npm-ci.txt
npm test 2>&1 | tee docs/superpowers/verification/issue-3/tests.txt
npm run build:linux:arm64 2>&1 | tee docs/superpowers/verification/issue-3/build.txt
sha256sum dist/*.deb | tee docs/superpowers/verification/issue-3/package.sha256
```

Expected: tests pass; one ARM64 `.deb` is created; SHA file is non-empty.

- [ ] **Step 3: Install the generated package**

```bash
sudo apt-get install -y ./dist/*.deb 2>&1 | tee docs/superpowers/verification/issue-3/install.txt
dpkg -l | grep -i word-selection-assistant | tee docs/superpowers/verification/issue-3/package-installed.txt
```

Expected: package is installed without architecture or missing-library errors.

### Task 4: Execute The UOS Manual Matrix

- [ ] **Step 1: Test required applications and gestures**

Create `manual-matrix.md` with actual PASS/FAIL and observed text for:

| Application | Drag selection | Double-click word | Empty drag | Unicode/multiline |
|---|---|---|---|---|
| UOS text editor | Toolbar with exact text | Exact word | No toolbar | Exact content |
| Chromium browser | Toolbar with exact text | Exact word | No toolbar | Exact content |
| Terminal | Toolbar with exact text | Exact word | No toolbar | Exact content |

Also verify pause/resume, tray status, clipboard restoration, and app restart.

- [ ] **Step 2: Record unsupported-session behavior**

On a Wayland session or with `XDG_SESSION_TYPE=wayland` in a controlled launch, verify settings reports `wayland-unsupported` and no X11 watcher starts. Do not claim Wayland support.

### Task 5: Finalize And Push Evidence

- [ ] **Step 1: Update verification**

Change status from `BLOCKED` to `PASS` only when every required manual row passes. Record hardware model, UOS version, kernel, session type, branch SHA, package SHA256, test count, and evidence file list.

- [ ] **Step 2: Commit from the UOS machine**

```bash
git add docs/superpowers/verification
git commit -m "docs: record UOS ARM64 X11 verification"
git push origin uos-arm64-x11
```

- [ ] **Step 3: Verify remote durability**

```bash
git ls-remote --heads origin uos-arm64-x11
gh issue comment 3 --body "UOS ARM64 X11 implementation and verification are maintained on branch uos-arm64-x11. Evidence: docs/superpowers/verification/2026-06-14-issue-3.md"
```

