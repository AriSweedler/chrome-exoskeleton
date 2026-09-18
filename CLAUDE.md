# chrome-exoskeleton — notes for coding agents

## What this is
A Chrome extension framework. Site-specific behavior is a **plugin**: a
directory with `page.ts(x)` (content script side) and/or `tab.tsx` (popup
side), plus tests. This repo ships public plugins in `plugins/`; a machine's
private plugins live in `~/.local/share/chrome-exoskeleton/plugins/` (the
local dotfiles tier) and are never committed here.

## Commands (always through the driver, never npx)
- `zsh bin/exo check` — the pre-commit hook; lint, format check, tsc, vitest, lockfile, leak grep
- `zsh bin/exo check --e2e` — plus build and Playwright
- `zsh bin/exo build` — dist/ for Load unpacked; `--personal` = without local-tier plugins
- `zsh bin/exo format` — prettier --write over framework and mounted plugins
- `zsh bin/exo link` / `status` / `deps <npm args>` / `new --name x --tier df|ldf --kind page|tab|handler`
- Binaries run as `node node_modules/<pkg>/bin/...` inside the driver; `npx` is slow and network-touching.

## Layout rules
- Plugins are reached ONLY through the mount `src/plugins/<name>` (symlinks made by `exo link`, gitignored). Imports inside a plugin use `@exo/plugins/<name>/...`; never `plugins/...` or relative paths.
- A plugin imports `@exo/lib/*`, `@exo/theme/*` and itself. Never another plugin, never `@exo/popup/*`, `@exo/index`, `@exo/service-worker`. eslint enforces this per mounted plugin.
- Shared code goes in `src/lib`. `src/lib/api.snapshot.test.ts` pins the framework's export names; update it deliberately when the API changes.
- `src/lib/dom.ts`, `src/lib/keybindings.tsx`, `src/lib/toast-notification/` are standalone libraries: no `@exo` imports (eslint sandboxes).
- Tests are colocated (`x.test.ts` next to `x.ts`). Real-DOM snapshots live in a plugin's `examples/` and are gitignored; suites `skipIf` when none are saved.
- Plugin e2e specs live in `<plugin>/e2e/*.spec.ts` and import `@exo-e2e/fixtures`, `@exo-e2e/helpers`.
- Colors: `@exo/theme/default` for shared tokens, HSLA; a color one plugin uses is a local const in that plugin.

## Repo hygiene
- This repo is public. No hostnames, ids or ticket numbers from any employer; fixtures use `example.com`, `exo-test/repo`, neutral file paths.
- `package-lock.json` must resolve from registry.npmjs.org only; use `exo deps` for dependency changes.
- Conventional commits (`feat(plugins/<name>): ...`, `fix(lib): ...`). Release with `npm run bump:*`.
- This repo is consumed as a git submodule at `~/.config/chrome-exoskeleton` by a dotfiles repo whose worktree is `$HOME`. Do not run `git submodule` from inside this directory; run it from `$HOME`.
