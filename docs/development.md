# Development

## Day to day

```bash
exo dev            # rebuild dist/ on every save; the loaded extension reloads itself
exo build          # one production build to dist/ (also reloads a loaded extension)
exo status         # what is mounted, from where, and how stale dist/ is
```

Load `dist/` once as an unpacked extension (`chrome://extensions`, Developer
mode, Load unpacked). That is the last time the extension card is needed:
every build afterwards — `exo build`, or a save under `exo dev` — is picked up
by the loaded extension within about a second. Two exceptions: a build whose
manifest Chrome rejects disables the extension until it is fixed and reloaded
by hand, and Developer mode must stay on (since Chrome 134 an unpacked
extension that reloads into a profile without it is left disabled).

How: every build writes `dist/build-stamp.json`; Chrome reads an unpacked
extension's files from disk, so the service worker polls its own copy of the
stamp (`src/lib/service-worker/auto-reload.ts`) and calls
`chrome.runtime.reload()` when it changes. The fresh worker injects the new
content script into every open tab, where it retires the old copy in place
(`src/lib/lifecycle.ts`: a page module registers its cleanup with
`onDispose`), and announces the build once, as a toast in the page being
looked at. Pages never reload; their state survives. `dist/` is always a
real build — nothing depends on a dev server, so the extension keeps working
when nothing is watching.

Editing a plugin at its real path (`plugins/<name>/x.ts` or the local tier's
directory) is fine: Vite watches through the `src/plugins/<name>` mount.
`npm run dev` (the `@crxjs/vite-plugin` dev server with HMR) still exists,
but it leaves `dist/` dependent on that server; prefer `exo dev`.

`exo build --personal` builds without the local tier's plugins into
`dist-personal/`, so a work machine can also load the exact build a personal
machine would get. `EXO_DIST=dist-personal npx playwright test` drives it.
`exo check --e2e` builds into `dist-e2e/` for the same reason in reverse: the
suite's build must not reload the extension loaded from `dist/`.

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
