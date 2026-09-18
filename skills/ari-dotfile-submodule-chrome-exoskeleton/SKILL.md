---
name: ari-dotfile-submodule-chrome-exoskeleton
description: Work on the Chrome Exoskeleton as a dotfiles citizen — the framework is a shared-tier submodule at ~/.config/chrome-exoskeleton (public repo), private plugins live in the local tier at ~/.local/share/chrome-exoskeleton/plugins, and `exo` drives link, check, build. Commit, push and pointer-bump workflows for each side, submodule mechanics, and what to do when a check refuses.
---

# Chrome Exoskeleton in the dotfiles

The Chrome extension is a framework plus plugins, split across the two dotfiles
tiers of `/ari-dotfiles` (df = shared, `git df`, `~/.config`, every machine;
ldf = local, `git ldf`, `~/.local`, this machine).

## Layout

| Piece | Path | Tier |
|---|---|---|
| Framework (= the submodule = the public repo) and its public plugins under `plugins/` | `~/.config/chrome-exoskeleton/`, submodule of `github.com/AriSweedler/chrome-exoskeleton` (declared in `~/.gitmodules`, gitdir `~/dotfiles.git/modules/`) | df |
| Skills that travel with the framework (this one) | `~/.config/chrome-exoskeleton/skills/<name>/`, linked into `~/.claude/skills` by `/ari-dotfiles-skill-registry` | df |
| `exo`, the driver | `~/.config/bin/exo -> ../chrome-exoskeleton/bin/exo` | df |
| `git_push_as_personal`, the only way the framework is pushed (human-only) | `~/.config/bin/git_push_as_personal` | df |
| Private plugins | `~/.local/share/chrome-exoskeleton/plugins/<name>/` | ldf |
| `env.zsh` (node for hooks), `denylist.txt` (what the public repo must never contain), `plugins/{tsconfig.json,eslint.config.js,package.json}` (editor and Playwright config) | `~/.local/share/chrome-exoskeleton/` | ldf |

`exo status` lists which plugins are mounted from which tier.

**Edit and stage a plugin at its real path**: `plugins/<name>/` in the submodule
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
- **Pushing the framework is the user's, never yours.** They run
  `git_push_as_personal` inside `~/.config/chrome-exoskeleton`; it pushes as
  the personal account whatever gh account or ssh key is active, verifies the
  remote, and refreshes `origin/main`. Claude Code is denied that command and
  MUST NOT push the submodule any other way (`git push`, `git -C … push`,
  `gh auth switch`). Ask, wait, continue.
- **Framework commits go directly on `main`** with explicit paths
  (`git -C ~/.config/chrome-exoskeleton add <files>`): no feature branch, no PR,
  never `git add -A` or `.`. Run `exo check` yourself before committing.
- **Other machines see a framework change only through a shared-tier pointer
  bump**, and the shared-tier pre-commit refuses a bump whose commit is not on
  the framework's `origin/main`. Pushing the tiers follows `/ari-dotfiles`:
  `git ldf push` after a local-tier commit; never `git df push`, end with
  "Run `git_df_push` when ready."
- **`exo` owns the toolchain.** Never bare `npm`/`npx` in the submodule
  (`exo deps <npm args>` pins the registry so the public lockfile never records
  the work mirror); new plugins come from `exo new`, never a hand-made
  directory; run `exo link` after `git ldf pull`, `git df submodule update`, or
  any manual change under a plugin root. If `exo` is not on `PATH`, run
  `~/.config/chrome-exoskeleton/bin/exo`; never substitute raw `npm run`.
- **Every submodule command is `cd ~ && git df submodule …`.** Plain
  `git submodule` targets whatever repo the cwd is in and prints nothing here.
- **Any other checkout of this extension is history only.** Never edit, commit
  or build there; `cd` into the submodule or the local tier first.

## Commands

`exo -h` is authoritative; this is the short list.

| command | does |
|---|---|
| `exo link` | mount every plugin at `src/plugins/<name>`; prune stale mounts |
| `exo check [--e2e]` | lint, prettier check, tsc, vitest, lockfile-registry assert, leak grep, identity check; `--e2e` adds a build and Playwright (~90 s) |
| `exo build [--personal]` | `dist/` for Load unpacked; `--personal` builds without the local tier into `dist-personal/` (run before shipping a framework change) |
| `exo format [--check]` | prettier over framework and mounted plugins |
| `exo status` | mounts per tier, dangling mounts, build age, snapshots |
| `exo deps <npm args>` | npm, registry pinned to npmjs |
| `exo new --name <slug> --tier df\|ldf [--kind page\|tab\|handler]` | scaffold (default kind `page`) and mount |

Both `exo check` and `exo build` end with an `[OK]` line; anything else is a failure.

## Hooks

| hook | fires on | runs | skip |
|---|---|---|---|
| `~/.config/chrome-exoskeleton/.githooks/pre-commit` | every framework commit | `exo check` | never |
| `~/.config/chrome-exoskeleton/.githooks/commit-msg` | every framework commit | denylist grep of the message | never |
| `~/.config/git/local-dotfiles-hooks/pre-push` | `git ldf push` touching `share/chrome-exoskeleton/` | `exo check --e2e`; prints `[EXO-PREPUSH] passed\|failed`; no line = out of scope | `EXO_PUSH_E2E=0`, only when the user asks |
| `~/.config/git/dotfiles-hooks/pre-commit` | staged `.config/chrome-exoskeleton` pointer | fetches the framework's `origin/main`, refuses a pointer not on it | never |

`core.hooksPath` for the framework is set by `exo deps ci` (the `prepare`
script); a fresh checkout has no hooks until then.

## Workflow

Change under `~/.local/share/chrome-exoskeleton/` → Private plugin. Change
under `~/.config/chrome-exoskeleton/` → Framework. Both at once → Framework
first (its push and pointer bump), then the local tier. Every workflow ends with
`exo build` and telling the user to reload the extension card at
`chrome://extensions`.

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

### Framework or public plugin (submodule)

0. **Be on `main`.** `git -C ~/.config/chrome-exoskeleton branch --show-current`
   must print `main`. It prints nothing after any `git df pull` or
   `git df submodule update`: the shared tier has `submodule.recurse=true`, which
   checks the recorded pointer out detached. Nothing committed yet →
   `git -C ~/.config/chrome-exoskeleton switch main`. Committed while detached →
   `git -C ~/.config/chrome-exoskeleton branch -f main HEAD`, only if
   `git -C ~/.config/chrome-exoskeleton merge-base --is-ancestor main HEAD`
   succeeds; otherwise stop and ask.
1. Check identity: `git -C ~/.config/chrome-exoskeleton config user.email` is the
   personal address. Commit on `main` with explicit paths. Messages are
   conventional commits as in the log: `feat(plugins): <name> — <summary>`,
   `fix(exo): …`, `docs(skills): …`, scopes `plugins`, `exo`, `skills`, `e2e`,
   `ci`, `docs`.
2. Tell the user: "run `git_push_as_personal` in `~/.config/chrome-exoskeleton`",
   and wait. Only when they asked to ship; otherwise stop here and say the
   commit is local. Confirm with `git -C ~/.config/chrome-exoskeleton status -sb`
   → `## main...origin/main`, no `[ahead N]`.
3. Bump the shared-tier pointer, unless `git df diff --quiet HEAD -- .config/chrome-exoskeleton` says there is nothing to bump:
   ```zsh
   git df add ~/.config/chrome-exoskeleton && git df commit -m "chrome-exoskeleton: bump to $(git -C ~/.config/chrome-exoskeleton rev-parse --short HEAD) (<what it carries>)"
   ```
   End with "Run `git_df_push` when ready."

Skills in `~/.config/chrome-exoskeleton/skills/<name>/` follow these same steps.
`git df add` refuses them (`fatal: Pathspec '…' is in submodule
'.config/chrome-exoskeleton'`): the only thing `git df add` accepts under that
path is the directory itself, the pointer.

End state, all four must hold:

```
git -C ~/.config/chrome-exoskeleton status -sb         → ## main...origin/main
cd ~ && git df submodule status                         →  <sha> .config/chrome-exoskeleton (heads/main)   leading space, not +
git df status --short -- .config/chrome-exoskeleton    → (empty)
git df log --oneline -1                                 → <hash> chrome-exoskeleton: bump to <sha> (…)
```

`submodule status` prefixes: space = checkout matches the pointer; `+` = checkout
ahead of the pointer (bump needed, or update on another machine); `-` = not
initialized.

### Load the build

`exo build`, then the user reloads the extension card (Load unpacked
`~/.config/chrome-exoskeleton/dist` once per profile; `dist-personal/` for a
personal-only build).

### Sync a machine

Existing machine, after `git df pull`:

```zsh
cd ~ && git df submodule update --init
exo link && exo build
```

If `package-lock.json` changed in the pull, `exo deps ci` first. The pull leaves
the submodule detached; step 0 above puts it back on `main` before the next
framework commit.

Fresh machine: `new-machine apply dotfiles_repo` initializes the submodule and
`new-machine apply chrome_exoskeleton` runs `exo deps ci` (wires the hooks) and
`exo build`; `new-machine check` reports `submodule_uninitialized`,
`submodule_drift` and the exoskeleton's own verdicts. Then Load unpacked. On a
personal machine node must be on `PATH` (no `env.zsh`) and there is no
denylist.

## When it fails

Never `--no-verify`, in any repo. Never edit `denylist.txt` to make a check pass.

| symptom | cause | do |
|---|---|---|
| `exo check`: `denylisted identifiers in tracked framework files` | a company hostname, id or ticket number in the public tree | move the plugin or the identifier to the local tier; re-run |
| `exo check`: `commit identity matches the denylist` | work `user.email` in the submodule | `git -C ~/.config/chrome-exoskeleton config user.email <personal address>` |
| `commit-msg`: denylisted identifier in the message | the message | reword; commit again |
| `exo check`: lint, prettier, tsc or vitest red | code | fix (`exo format` for format-only); commit again |
| `git ldf push` prints `[EXO-PREPUSH] failed` | the suite failed; the commit stands, nothing pushed | fix, commit, push again; `exo check --e2e` reproduces it. `EXO_PUSH_E2E=0` only when the user asks, never for a red suite |
| `git ldf push` exits 1 with no `[EXO-PREPUSH]` line | network or ssh to the local tier's remote | the commit is safe; retry later |
| `git ldf push`: `framework missing` | submodule not initialized on this machine | `cd ~ && git df submodule update --init`, `exo deps ci` |
| shared-tier pre-commit: `pointer … is not on origin/main` | step 2 not done; a stale `main` pushed (step 0 skipped); or offline, so `origin/main` is stale | do steps 0 and 2, then re-run the `git df commit`; no re-stage needed |
| `git_push_as_personal`: `Personal account is not logged into gh` | no personal gh login on this machine | stop; `gh auth login` is the user's to run |
| push rejected non-fast-forward, or `Remote ref does not match after push` | remote `main` moved | `git -C ~/.config/chrome-exoskeleton pull --rebase origin main`, re-run `exo check` by hand (a rebase skips the hook), ask for the push again |
| `exo`: `node not found` | personal machine without node, or `env.zsh` missing | stop and report; do not install node |
| `exo new`: `plugin name present in two roots` | the name exists in the other tier | `rm -r` the half-scaffold, `exo link`, pick another name or the other tier |
| `git df commit`: nothing to commit on a bump | pointer already at HEAD | nothing to bump; say so |

## Key locations

- Framework docs: `~/.config/chrome-exoskeleton/docs/{writing-a-plugin,development,testing,keybindings,richlink-handlers}.md`.
- Local-tier tracking rules for `share/chrome-exoskeleton/`: `~/.local/local-dotfiles.git/info/exclude` and its shared-tier template `~/.config/new-machine/local-dotfiles-exclude`; change one, change the other.
- Hooks: see the table above.
