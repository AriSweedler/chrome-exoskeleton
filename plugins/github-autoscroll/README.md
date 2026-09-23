# github-autoscroll

Keyboard help for reviewing pull requests on github.com.

One file of the pull request is **active**: ringed in soft light yellow. It
is the review cursor. It follows what you are looking at as you scroll (the
file just under the sticky chrome), marking a file Viewed moves it to the
next unviewed file, `J` / `K` step it between unviewed files, and the fold
keys and `R` act on it.

| key                | where             | does                                                                                                                                                                                    |
| ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a`                | PR pages          | toggle autoscroll: marking a file Viewed moves the cursor to the next unviewed file and pins its header to the top of the viewport (wrapping around; a toast when everything is viewed) |
| `zo` / `zc` / `za` | PR pages          | open / close / toggle the active file (vim folds), then pin it back to the top; `zo` on an open file is how you scroll the cursor back into view                                        |
| `c` / `f`          | PR pages          | jump to the Conversation / Files changed tab                                                                                                                                            |
| `d`                | PR pages          | mark the auto-hidden files (generated, deleted) Viewed and scroll down a viewport; hold it to sweep a huge PR                                                                           |
| `D`                | PR pages          | undo `d`: show those files again (files viewed before the page loaded are out of reach: GitHub drops a viewed file's body, which is what identifies it)                                 |
| `gg` / `G`         | every GitHub page | scroll to the top / bottom (this swallows GitHub's own `g` prefix; Ctrl+V passes a literal `g` through)                                                                                 |

Autoscroll starts on its own when a Files changed page has rendered its
files; the popup tab turns that off (stored as `exorun-github-autoscroll`).

## How it scrolls

GitHub renders diffs lazily (`content-visibility: auto`) and collapses a file
a beat after it is marked viewed, so a scroll animated toward a position
measured once lands wrong. Every scroll aimed at a file therefore jumps
instantly to put the header just below whatever sticky chrome covers the top
of the viewport (measured, not configured), then keeps re-measuring for a
second and corrects any drift — until the user scrolls, clicks or types.

## Layout

| module           | owns                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| `files.ts`       | the DOM model: every GitHub selector, viewed / folded / auto-hidden state |
| `cursor.ts`      | the active file (one CSS rule on GitHub's region id), pinning, folds      |
| `autoscroll.ts`  | detecting viewed flips by state diff, moving the cursor                   |
| `auto-hidden.ts` | the `d` / `D` sweep and its memory                                        |
| `scroll.ts`      | page jumps and the settling pin                                           |
| `url.ts`         | PR URL parsing and tab navigation                                         |
| `page.ts`        | keys, auto-run, SPA navigation, popup messages                            |
| `test-dom.ts`    | a GitHub-shaped fixture with click emulation, for unit and e2e tests      |

Real-DOM tests read saved snapshots from `examples/*.html` (gitignored,
machine-local): open a PR's Files changed view, copy the DOM, and save it as
`examples/ghpr-<what-it-shows>.html`.
