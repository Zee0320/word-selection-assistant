# Issue 6 Windows Manual Verification

## Status

PASS: user completed cross-application Windows manual verification on 2026-06-17 and reported all rows passed.

Any visible toolbar flash for an empty case was treated as a failure condition.

| Application | Scenario | Repetitions | Expected | Result |
| --- | --- | ---: | --- | --- |
| Notepad | Single click | 3 | No toolbar | PASS |
| Notepad | Drag in blank area | 3 | No toolbar | PASS |
| Notepad | Whitespace-only selection | 3 | No toolbar | PASS |
| Notepad | Double-click word | 3 | Toolbar with captured word | PASS |
| Notepad | Drag-select sentence | 3 | Toolbar with captured sentence | PASS |
| Notepad | Copy blocked or unchanged clipboard | 3 | No stale-text toolbar | PASS |
| Notepad | Valid selection followed rapidly by empty gesture | 3 | Stale capture cannot reopen toolbar | PASS |
| Browser | Single click | 1 | No toolbar | PASS |
| Browser | Drag in blank area | 1 | No toolbar | PASS |
| Browser | Double-click word | 1 | Toolbar with captured word | PASS |
| Browser | Drag-select sentence | 1 | Toolbar with captured sentence | PASS |
| Browser | Translate valid selection | 1 | Translation panel opens | PASS |
| Browser | AI Chat valid selection | 1 | Chat opens with selected context | PASS |
