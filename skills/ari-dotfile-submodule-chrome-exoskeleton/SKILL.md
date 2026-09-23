---
name: ari-dotfile-submodule-chrome-exoskeleton
description: Work on the Chrome Exoskeleton as a dotfiles citizen — the framework repo at ~/.config/chrome-exoskeleton (public) holds the engine and public plugins, private plugins live in the local tier at ~/.local/share/chrome-exoskeleton/plugins, and `exo` drives link, check, build. Where things go, how each side is committed and pushed, and what to do when a check refuses.
---

# Chrome Exoskeleton in the dotfiles

The Chrome extension is a framework plus plugins, split across the two dotfiles
tiers of `/ari-dotfiles` (df = shared, `git df`, `~/.config`, every machine;
ldf = local, `git ldf`, `~/.local`, this machine). The framework directory is
its own git repo inside the shared tier; `/ari-dotfiles` § Submodules says how
a commit there becomes part of a dotfiles change. This skill covers the
framework and its plugins.

## Layout

| Piece | Path | Tier |
|---|---|---|
| Framework (= the public repo) and its public plugins under `plugins/` | `~/.config/chrome-exoskeleton/`, upstream `github.com/AriSweedler/chrome-exoskeleton` | df |
| Skills that travel with the framework (this one) | `~/.config/chrome-exoskeleton/skills/<name>/`, linked into `~/.claude/skills` by `/ari-dotfiles-skill-registry` | df |
| `exo`, the driver | `~/.config/bin/exo -> ../chrome-exoskeleton/bin/exo` | df |
| Private plugins | `~/.local/share/chrome-exoskeleton/plugins/<name>/` | ldf |
| `env.zsh` (node for hooks), `denylist.txt` (what the public repo must never contain), `plugins/{tsconfig.json,eslint.config.js,package.json}` (editor and Playwright config) | `~/.local/share/chrome-exoskeleton/` | ldf |

`exo status` lists which plugins are mounted from which tier.

**Edit and stage a plugin at its real path**: `plugins/<name>/` in the framework
or `~/.local/share/chrome-exoskeleton/plugins/<name>/`. A *mount* is the symlink
`exo link` puts at `~/.config/chrome-exoskeleton/src/plugins/<name>`; never edit
through a mount and never `git add` one, in either tier.

## Rules

- **Tier test: do you use that site only as an employee?** Then the plugin is
  ldf, public SaaS included (Buildkite, Greenhouse). Everything else is df.
  If the request does not settle it, ask; if you must guess, guess ldf
  (ldf → df later is a `git mv`; df → ldf after a push is a public history
  rewrite). Neither tier tracks snapshots (`examples/*.html`).
- **The framework repo is public: files AND commit messages.** No company
  hostnames, ids, ticket numbers or colleague names. `exo check` greps tracked
  files and your `user.email`, `.githooks/commit-msg` greps the message, both
  against the local tier's `denylist.txt`; on a machine without that file
  nothing is enforced, so review the diff by eye.
- **Pushing the framework is the user's, never yours.** `dotfiles push`
  (`/ari-dotfiles` § Pushing) pushes it as the personal account whatever gh
  account or ssh key is active, verifies the remote, and refreshes
  `origin/main`. Claude Code is denied that command and MUST NOT push the
  framework any other way (`git push`, `git -C … push`, `gh auth switch`).
  Ask, wait, continue.
- **Framework commits go directly on `main`** with explicit paths
  (`git -C ~/.config/chrome-exoskeleton add <files>`): no feature branch, no PR,
  never `git add -A` or `.`. Run `exo check` yourself before committing. A
  commit here is not the end of the dotfiles change: `/ari-dotfiles`
  § Submodules says what follows (and how to get back on `main` when
  `branch --show-current` prints nothing).
- **Pushing the tiers follows `/ari-dotfiles`**: `git ldf push` after a
  local-tier commit; never `git df push`, end with "Run `dotfiles push` when ready."
- **`exo` owns the toolchain.** Never bare `npm`/`npx` in the framework
  (`exo deps <npm args>` pins the registry so the public lockfile never records
  the work mirror); new plugins come from `exo new`, never a hand-made
  directory; run `exo link` after `git ldf pull`, after `/ari-dotfiles` refreshes
  the framework checkout, or after any manual change under a plugin root. If
  `exo` is not on `PATH`, run `~/.config/chrome-exoskeleton/bin/exo`; never
  substitute raw `npm run`.
- **Any other checkout of this extension is history only.** Never edit, commit
  or build there; `cd` into the framework or the local tier first.

## Commands

`exo -h` is authoritative; this is the short list.

| command | does |
|---|---|
| `exo link` | mount every plugin at `src/plugins/<name>`; prune stale mounts |
| `exo check [--e2e]` | lint, prettier check, tsc, vitest, lockfile-registry assert, leak grep, identity check; `--e2e` adds a build and Playwright (~90 s) |
| `exo build [--personal]` | `dist/` for Load unpacked; `--personal` builds without the local tier into `dist-personal/` (run before shipping a framework change). A loaded dist reloads itself after every build |
| `exo dev` | rebuild `dist/` on every save (`vite build --watch`): the edit loop, no dev server |
| `exo format [--check]` | prettier over framework and mounted plugins |
| `exo status` | mounts per tier, dangling mounts, build age, snapshots |
| `exo deps <npm args>` | npm, registry pinned to npmjs |
| `exo new --name <slug> --tier df\|ldf [--kind page\|tab\|handler]` | scaffold (default kind `page`) and mount |

Both `exo check` and `exo build` end with an `[OK]` line; anything else is a failure.
`exo check --e2e` builds into `dist-e2e/`, never into the `dist/` the user has loaded.

## Hooks

| hook | fires on | runs | skip |
|---|---|---|---|
| `~/.config/chrome-exoskeleton/.githooks/pre-commit` | every framework commit | `exo check` | never |
| `~/.config/chrome-exoskeleton/.githooks/commit-msg` | every framework commit | denylist grep of the message | never |
| `~/.config/git/local-dotfiles-hooks/pre-push` | `git ldf push` touching `share/chrome-exoskeleton/` | `exo check --e2e`; prints `[EXO-PREPUSH] passed\|failed`; no line = out of scope | `EXO_PUSH_E2E=0`, only when the user asks |

`core.hooksPath` for the framework is set by `exo deps ci` (the `prepare`
script); a fresh checkout has no hooks until then.

## Workflow

Change under `~/.local/share/chrome-exoskeleton/` → Private plugin. Change
under `~/.config/chrome-exoskeleton/` → Framework. Both at once → Framework
first (its push and what `/ari-dotfiles` adds), then the local tier. Every
workflow ends with `exo build`; the loaded extension picks the build up by
itself (see Load the build). Never tell the user to reload the extension card
unless the build changed something Chrome rejected.

### New plugin

```zsh
exo new --name <slug> --tier df|ldf --kind page|tab|handler
```

Edit per `~/.config/chrome-exoskeleton/docs/writing-a-plugin.md`, then continue
with the tier's workflow below.

### Private plugin (local tier)

1. `exo check`. Stop and fix if it fails.
2. `git ldf add ~/.local/share/chrome-exoskeleton/<plugins/name | file> && git ldf commit -m "chrome-exoskeleton: <name>: <what changed>"`,
   e.g. `chrome-exoskeleton: spinnaker: 'M' opens every monitoring link`. A
   commit touching only `examples/*.html` stages nothing: that is the exclusion
   working, not an error.
3. `git ldf push` (5-minute tool timeout: the hook builds and runs the browser suite).

### Framework or public plugin

1. `exo check`. Check identity: `git -C ~/.config/chrome-exoskeleton config user.email`
   is the personal address. Commit on `main` with explicit paths. Messages are
   conventional commits as in the log: `feat(plugins): <name> — <summary>`,
   `fix(exo): …`, `docs(skills): …`, scopes `plugins`, `exo`, `skills`, `e2e`,
   `ci`, `docs`.
2. The push is the user's: say "Run `dotfiles push --submodules` when
   ready" (`/ari-dotfiles` § Submodules step 3) and wait. Only when they asked
   to ship; otherwise stop here and say the commit is local. Confirm with
   `git -C ~/.config/chrome-exoskeleton status -sb` → `## main...origin/main`,
   no `[ahead N]`.
3. Hand over to `/ari-dotfiles` § Submodules for the rest of the dotfiles change.

Skills in `~/.config/chrome-exoskeleton/skills/<name>/` follow these same steps;
they are files of this repo, not of the shared tier.

### Load the build

`exo build`. A loaded extension notices the new build within about a second,
reloads itself, swaps its content script into the open tabs (no page reloads)
and toasts once in the active page. The extension card is only for the first
load per profile (Load unpacked `~/.config/chrome-exoskeleton/dist`;
`dist-personal/` for a personal-only build) and for a build Chrome rejected.
While iterating, `exo dev` does the build on every save.

### Sync a machine

After `/ari-dotfiles` has refreshed the framework checkout on a machine:

```zsh
exo link && exo build
```

If `package-lock.json` changed, `exo deps ci` first. Fresh machine:
`new-machine apply chrome_exoskeleton` runs `exo deps ci` (wires the hooks) and
`exo build`; `new-machine check` reports its verdicts. Then Load unpacked. On a
personal machine node must be on `PATH` (no `env.zsh`) and there is no
denylist.

## When it fails

Never `--no-verify`, in any repo. Never edit `denylist.txt` to make a check pass.

| symptom | cause | do |
|---|---|---|
| `exo check`: `denylisted identifiers in tracked framework files` | a company hostname, id or ticket number in the public tree | move the plugin or the identifier to the local tier; re-run |
| `exo check`: `commit identity matches the denylist` | work `user.email` in the framework repo | `git -C ~/.config/chrome-exoskeleton config user.email <personal address>` |
| `commit-msg`: denylisted identifier in the message | the message | reword; commit again |
| `exo check`: lint, prettier, tsc or vitest red | code | fix (`exo format` for format-only); commit again |
| `git ldf push` prints `[EXO-PREPUSH] failed` | the suite failed; the commit stands, nothing pushed | fix, commit, push again; `exo check --e2e` reproduces it. `EXO_PUSH_E2E=0` only when the user asks, never for a red suite |
| `git ldf push` exits 1 with no `[EXO-PREPUSH]` line | network or ssh to the local tier's remote | the commit is safe; retry later |
| `git ldf push`: `framework missing` | the framework is not checked out on this machine | `/ari-dotfiles` § Submodules, then `exo deps ci` |
| `dotfiles push` log: `Personal account is not logged into gh` | no personal gh login on this machine | stop; `gh auth login` is the user's to run |
| `dotfiles push` log: `Push rejected` (non-fast-forward) or `Remote ref does not match after push` | remote `main` moved | `git -C ~/.config/chrome-exoskeleton pull --rebase origin main`, re-run `exo check` by hand (a rebase skips the hook), ask for the push again |
| `exo`: `node not found` | personal machine without node, or `env.zsh` missing | stop and report; do not install node |
| `exo new`: `plugin name present in two roots` | the name exists in the other tier | `rm -r` the half-scaffold, `exo link`, pick another name or the other tier |

## Key locations

- Framework docs: `~/.config/chrome-exoskeleton/docs/{writing-a-plugin,development,testing,keybindings,richlink-handlers}.md`.
- Local-tier tracking rules for `share/chrome-exoskeleton/`: `~/.local/local-dotfiles.git/info/exclude` and its shared-tier template `~/.config/new-machine/local-dotfiles-exclude`; change one, change the other.
- Hooks: see the table above.
