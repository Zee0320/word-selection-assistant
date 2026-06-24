# Issue 5 Evidence And Test Flake Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make issue #5's screenshots reproducible from a clean checkout and remove the wall-clock-dependent selection test before publishing the branch.

**Architecture:** Commit the mock preload used by the real Electron capture script and strengthen its test to verify every dependency exists. Replace the 200ms `Date.now()` gate with a deferred promise so suite load cannot change behavior.

**Tech Stack:** Electron BrowserWindow capture, Node.js `node:test`, Git.

---

## Current State

- Branch HEAD: `5c51d9cae3974b703e89775c147a7c8b5ce27564`
- Remote branch exists at the same SHA.
- Five screenshots are real 404x561 PNG files and visually match required states.
- `scripts/capture-context-card-evidence.js` requires `scripts/capture-mock-preload.js`, but that preload is untracked.
- First fresh full test run failed 1/122 at `tests/text-capture-ignored-gesture.test.js:81`; later full run passed and 20 isolated runs passed.
- Root cause: selected text is returned only while `Date.now() - mouseUpAt < 200`.

## Files

- Add: `.claude/worktrees/issue-5/scripts/capture-mock-preload.js`
- Modify: `.claude/worktrees/issue-5/tests/context-card-evidence-script.test.js`
- Modify: `.claude/worktrees/issue-5/tests/text-capture-ignored-gesture.test.js`
- Modify: `.claude/worktrees/issue-5/docs/superpowers/verification/2026-06-14-issue-5.md`

### Task 1: Make Screenshot Capture Self-Contained

- [ ] **Step 1: Strengthen the evidence-script test**

Add:

```js
test('capture script dependencies exist in the repository', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'capture-context-card-evidence.js');
  const preloadPath = path.join(__dirname, '..', 'scripts', 'capture-mock-preload.js');

  assert.equal(fs.existsSync(scriptPath), true);
  assert.equal(fs.existsSync(preloadPath), true);
  assert.match(fs.readFileSync(scriptPath, 'utf8'), /capture-mock-preload\.js/);
  assert.match(fs.readFileSync(preloadPath, 'utf8'), /contextBridge\.exposeInMainWorld/);
});
```

- [ ] **Step 2: Prove a clean commit currently fails**

Temporarily move the untracked preload outside the worktree, run `node --test tests/context-card-evidence-script.test.js`, and confirm failure. Restore the file immediately afterward.

- [ ] **Step 3: Add the preload to Git**

Review it for secrets and machine-specific paths, then:

```powershell
git add scripts/capture-mock-preload.js tests/context-card-evidence-script.test.js
git commit -m "test: make context card evidence reproducible"
```

### Task 2: Replace Wall-Clock Test Logic

- [ ] **Step 1: Replace the first test with a deferred capture**

In `tests/text-capture-ignored-gesture.test.js`, use:

```js
let resolveCapture;
const capturePromise = new Promise(resolve => { resolveCapture = resolve; });
const { textCapture, handlers, restore } = loadTextCaptureWithFakes({
  readSelectedText: async () => capturePromise
});

let resolveCaptured;
const capturedPromise = new Promise(resolve => { resolveCaptured = resolve; });
textCapture.init({
  onTextCaptured: text => {
    capturedTexts.push(text);
    resolveCaptured();
  },
  onCapturePending: () => {},
  onCaptureMissed: () => {}
});
```

Trigger the original gesture, trigger the ignored gesture, assert `capturedTexts` is empty, call `resolveCapture('hello')`, await `capturedPromise`, then assert `['hello']`. Remove `originalMouseUpAt` and the `< 200` condition.

- [ ] **Step 2: Run focused stress verification**

```powershell
1..20 | ForEach-Object { node --test tests/text-capture-ignored-gesture.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Expected: 20 passes.

- [ ] **Step 3: Commit the deterministic test**

```powershell
git add tests/text-capture-ignored-gesture.test.js
git commit -m "test: remove timing dependency from selection capture"
```

### Task 3: Reproduce All Evidence From The Commit

- [ ] **Step 1: Verify no untracked dependency remains**

Run `git status --short`. Expected: clean.

- [ ] **Step 2: Regenerate screenshots**

Run: `npx electron scripts/capture-context-card-evidence.js`

Expected: all five files are regenerated, each 404x561 and larger than 1024 bytes.

- [ ] **Step 3: Run final tests and publish**

```powershell
npm test
npm test
git add docs/superpowers/verification/issue-5/*.png docs/superpowers/verification/2026-06-14-issue-5.md
git commit -m "docs: refresh reproducible context card evidence"
git push origin worktree-issue-5
```

Record both full test counts and the 20-run stress result in verification.

