# Issue 6 Windows Manual Verification

## Status

BLOCKED: the automated review environment cannot perform trustworthy cross-application mouse selection in Notepad and a browser.

Run the exact committed branch and record every row. Any visible toolbar flash for an empty case is a failure.

| Application | Scenario | Repetitions | Expected | Result |
| --- | --- | ---: | --- | --- |
| Notepad | Single click | 3 | No toolbar | NOT RUN |
| Notepad | Drag in blank area | 3 | No toolbar | NOT RUN |
| Notepad | Whitespace-only selection | 3 | No toolbar | NOT RUN |
| Notepad | Double-click word | 3 | Toolbar with captured word | NOT RUN |
| Notepad | Drag-select sentence | 3 | Toolbar with captured sentence | NOT RUN |
| Notepad | Copy blocked or unchanged clipboard | 3 | No stale-text toolbar | NOT RUN |
| Notepad | Valid selection followed rapidly by empty gesture | 3 | Stale capture cannot reopen toolbar | NOT RUN |
| Browser | Single click | 1 | No toolbar | NOT RUN |
| Browser | Drag in blank area | 1 | No toolbar | NOT RUN |
| Browser | Double-click word | 1 | Toolbar with captured word | NOT RUN |
| Browser | Drag-select sentence | 1 | Toolbar with captured sentence | NOT RUN |
| Browser | Translate valid selection | 1 | Translation panel opens | NOT RUN |
| Browser | AI Chat valid selection | 1 | Chat opens with selected context | NOT RUN |
