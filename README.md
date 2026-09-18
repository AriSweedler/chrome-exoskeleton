# Chrome Exoskeleton

[![check](https://github.com/AriSweedler/chrome-exoskeleton/actions/workflows/check.yml/badge.svg)](https://github.com/AriSweedler/chrome-exoskeleton/actions/workflows/check.yml)

A Chrome extension framework for site-specific keyboard shortcuts, rich links
and popup tools. The framework is the engine; every site-specific behavior is
a **plugin**: a directory with a page module and/or a popup tab.

- **Keybindings** on any page, with modifier combos, vim-style chords (`gg`),
  guards, a Ctrl+V pass-through and a `?` help overlay.
- **Rich links**: Cmd+Shift+C copies a well-titled link to the current page;
  plugins add site-specific formats.
- **Popup tabs**: a plugin can render a tab in the extension popup for the
  pages it knows.
- **Toasts**, storage, clipboard and typed popup-to-page actions as libraries.

Plugins shipped here live in `plugins/`. Private, per-machine plugins live
outside this repo (`~/.local/share/chrome-exoskeleton/plugins/`) and are built
in just the same. See [docs/writing-a-plugin.md](docs/writing-a-plugin.md).

## Install

```bash
git clone https://github.com/AriSweedler/chrome-exoskeleton.git
cd chrome-exoskeleton
npm ci
zsh bin/exo build          # mounts plugins, type-checks, builds dist/
```

Then in Chrome: `chrome://extensions` → Developer mode → Load unpacked →
this repo's `dist/` directory. After a rebuild, press the reload icon on the
extension's card.

`bin/exo` is the driver for everything. Put it on your `PATH` (for example
`ln -s $PWD/bin/exo ~/.local/bin/exo`) and the commands below read as shown.

## Commands

| command | does |
|---|---|
| `exo link` | mount every plugin at `src/plugins/<name>` (idempotent; prunes stale mounts) |
| `exo check` | link, eslint, prettier, tsc, vitest, lockfile and leak checks; `--e2e` adds a build and the Playwright suite |
| `exo build` | link, type-check, build to `dist/`; `--personal` builds without the local tier's plugins into `dist-personal/` |
| `exo format` | prettier over the framework and every mounted plugin; `--check` to verify |
| `exo status` | what is mounted from where, dangling mounts, build age, saved snapshots |
| `exo deps <npm args>` | npm with the registry pinned to registry.npmjs.org |
| `exo new --name <n> --tier df\|ldf [--kind page\|tab\|handler]` | scaffold a plugin from `templates/` |

`npm run dev` starts Vite with hot reload for the popup and content script.
The usual npm scripts (`test`, `lint`, `format`, `build`) wrap the same driver.

## Layout

```
bin/exo                  the driver
src/
  index.tsx              content script: loads every mounted plugin's page module
  service-worker.tsx     background worker: injects the content script into open tabs
  popup/                 the popup shell; renders mounted plugins' tabs
  lib/                   the framework API plugins import (@exo/lib/*)
  theme/                 shared color tokens (@exo/theme/default)
  plugins/               the mount point: symlinks made by exo link (gitignored)
plugins/                 plugins shipped with the framework
templates/               scaffolds for exo new
skills/                  Claude Code skills that travel with this repo (linked by the owner's dotfiles)
e2e/                     Playwright harness and framework specs
docs/                    guides
```

Plugins import `@exo/lib/*`, `@exo/theme/*` and themselves (`@exo/plugins/<name>/*`)
and nothing else; eslint enforces it per plugin, and a test pins the export
names of every framework module so the API changes only on purpose.

## Testing

```bash
exo check          # ~15 s: everything but the browser
exo check --e2e    # + build + Playwright, ~1 min
```

Unit tests are colocated (`x.test.ts` beside `x.ts`) in the framework and in
each plugin, and all run in one vitest pass. Plugin e2e specs live in
`<plugin>/e2e/` and reuse the harness in `e2e/`. Details in
[docs/testing.md](docs/testing.md).

## Release

Bump with `npm run bump:patch|minor|major` (updates `manifest.json`,
`package.json`, the lockfile and `CHANGELOG.md`, tags the commit), then push.
CI runs `exo check --e2e` on every push and publishes a GitHub release with
the zipped build when the manifest version changed.

## License

MIT
