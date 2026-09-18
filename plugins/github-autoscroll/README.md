# github-autoscroll

Keyboard help for reviewing pull requests on github.com.

| key | where | does |
|---|---|---|
| `a` | PR pages | toggle autoscroll: marking a file Viewed scrolls to the next unviewed one |
| `c` / `f` | PR pages | jump to the Conversation / Files changed tab |
| `d` | PR pages | mark the auto-hidden files (generated, deleted) Viewed and scroll down a viewport; hold it to sweep a huge PR |
| `D` | PR pages | undo: show the auto-hidden files again |
| `gg` / `G` | every GitHub page | scroll to the top / bottom (this swallows GitHub's own `g` prefix; Ctrl+V passes a literal `g` through) |

Autoscroll also starts on its own when a Files changed page loads; the popup
tab turns that off (stored as `exorun-github-autoscroll`).

Real-DOM tests read saved snapshots from `examples/*.html` (gitignored,
machine-local): open a PR's Files changed view, copy the DOM, and save it as
`examples/ghpr-with-autohidden-files.html` or `examples/ghpr-with-deleted-files.html`.
