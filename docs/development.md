# Development

## Day to day

```bash
npm run dev        # Vite dev server with hot reload (mounts plugins first)
exo build          # production build to dist/
exo status         # what is mounted, from where, and how stale dist/ is
```

Load `dist/` once as an unpacked extension (`chrome://extensions`, Developer
mode, Load unpacked). Content-script changes apply on the next page load;
`manifest.json` changes need the reload icon on the extension card.

Hot reload comes from `@crxjs/vite-plugin`: edits to the popup or a content
script apply live, a service-worker edit restarts the worker. Editing a
plugin at its real path (`plugins/<name>/x.ts` or the local tier's
directory) is fine: Vite watches through the `src/plugins/<name>` mount.

`exo build --personal` builds without the local tier's plugins into
`dist-personal/`, so a work machine can also load the exact build a personal
machine would get. `EXO_DIST=dist-personal npx playwright test` drives it.

## Editors

Open a plugin through its mount, `src/plugins/<name>/`, and the editor sees
the framework's tsconfig, eslint config and prettier settings. Opening the
real path works too: `plugins/tsconfig.json` and `plugins/eslint.config.js`
(and their twins in the local tier) give the editor the base rules there.
The per-plugin import fence is only applied through the mount, which is what
`exo check` uses.

## Dependencies

```bash
exo deps install <pkg>@latest
exo deps ci
```

`exo deps` pins npm's registry to registry.npmjs.org so the tracked lockfile
never records a private mirror, and `exo check` refuses a lockfile that does.

## Snapshot tooling

Real-DOM snapshots are gitignored files under a plugin's `examples/`. Two
CLIs work with them through the mounts:

```bash
npm run handler -- GitHubHandler ghpr.html https://github.com/o/r/pull/1   # run one rich-link handler
npm run plugin-cli src/plugins/<name>/cli/<tool>.ts -- <args>             # any plugin's own CLI
```

`exo status` lists how many snapshots each plugin has saved, so a suite that
`skipIf`s on missing snapshots is visible rather than silent.

## Releasing

```bash
npm run bump          # from conventional commits (feat → minor, fix → patch)
npm run bump:patch    # or force a level
git push origin main --follow-tags
```

`commit-and-tag-version` bumps `manifest.json`, `package.json` and the
lockfile together, prepends `CHANGELOG.md` from the conventional commit
messages and tags `vX.Y.Z`. CI then publishes a GitHub release with the
zipped build when it sees the manifest version change.

| prefix | changelog section |
|---|---|
| `feat` | Features |
| `fix` | Bug Fixes |
| `refactor` | Refactors |
| `chore`, `test`, `docs`, `ci` | hidden |

Scope by plugin where it applies: `feat(plugins/github-autoscroll): ...`.

## Consumed as a dotfiles submodule

This repo is meant to live at `~/.config/chrome-exoskeleton` as a git
submodule of a dotfiles repo whose worktree is `$HOME`. Git refuses
`git submodule` commands from outside that worktree, so run them from `$HOME`.
A dotfiles commit that bumps the submodule pointer should reference a commit
already on this repo's `main`, or other machines cannot check it out.
