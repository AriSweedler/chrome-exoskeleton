---
name: ari-dotfile-submodule-chrome-exoskeleton
description: Work on the Chrome Exoskeleton as a dotfiles citizen — the framework is a shared-tier submodule at ~/.config/chrome-exoskeleton (public repo), private plugins live in the local tier at ~/.local/share/chrome-exoskeleton/plugins, and `exo` drives link, check, build. Commit, push and pointer-bump workflows for each side, plus submodule mechanics.
---

# Chrome Exoskeleton in the dotfiles

The Chrome extension is a framework plus plugins, split across the two dotfiles
tiers (`/ari-dotfiles`). This skill lives in the framework repo's `skills/`
folder and reaches `~/.claude/skills` through `/ari-dotfiles-skill-registry`,
which links every submodule's top-level `skills/`.

| Piece | Path | Tier |
|---|---|---|
| Framework and its public plugins (`plugins/richlink`, `plugins/github-autoscroll`, `plugins/playground`) | `~/.config/chrome-exoskeleton/`: a git submodule of `https://github.com/AriSweedler/chrome-exoskeleton` (PUBLIC). `~/.gitmodules` records it; its gitdir sits in `~/dotfiles.git/modules/` | df |
| `exo`, the driver, on `$PATH` | `~/.config/bin/exo -> ../chrome-exoskeleton/bin/exo` | df |
| Private plugins (`spinnaker`, `opensearch`, `spacelift`, `airtable`, `buildkite`, `greenhouse`) | `~/.local/share/chrome-exoskeleton/plugins/<name>/` | ldf |
| `env.zsh` (how hooks find node), `denylist.txt` (regexes the public repo must never contain), `plugins/{tsconfig.json,eslint.config.js,package.json}` (editor and Playwright config) | `~/.local/share/chrome-exoskeleton/` | ldf |

Plugin contract: `~/.config/chrome-exoskeleton/docs/writing-a-plugin.md`. A
plugin for a public site goes in the submodule's `plugins/`; a company-site
plugin goes in the local tier. Snapshots (`examples/*.html`) are never tracked
in either tier.

## Rules

- **The framework repo is public.** No company hostnames, ids or ticket
  numbers in it. `exo check` greps every tracked file against the local
  tier's `denylist.txt` and fails on a hit.
- **`git submodule` runs from `$HOME`.** Git refuses it from outside the
  worktree: `cd ~ && git df submodule status`.
- **Push the framework as the personal GitHub account**, never the work one.
  `origin` fetches over https and pushes over ssh, so either swap ssh keys the
  way `git_df_push` does, or use the `gh` recipe below.
- **A framework change reaches other machines only through a pointer bump**
  in the shared tier, and only after the framework commit is on `origin/main`;
  the shared-tier pre-commit hook refuses anything else. Never push the shared
  tier yourself: end with "Run `git_df_push` when ready."

## Commands

| command | does |
|---|---|
| `exo link` | mount every plugin at `~/.config/chrome-exoskeleton/src/plugins/<name>` (symlinks; prunes stale ones) |
| `exo check [--e2e]` | lint, format, tsc, vitest, lockfile-registry assert, leak grep; `--e2e` adds a build and Playwright |
| `exo build [--personal]` | `dist/` for Load unpacked; `--personal` leaves the local tier out, into `dist-personal/` |
| `exo status` | mounts per tier, dangling mounts, build age, saved snapshots |
| `exo deps <npm args>` | npm with the registry pinned to npmjs, so the public lockfile never records a private mirror |
| `exo new --name <slug> --tier df\|ldf --kind page\|tab\|handler` | scaffold a plugin in the right tier and mount it |

Chrome loads `~/.config/chrome-exoskeleton/dist` (Load unpacked once; `exo build`,
then reload the extension card).

## Workflow

### Private plugin (local tier)

```zsh
exo check
git ldf add ~/.local/share/chrome-exoskeleton/plugins/<name> && git ldf commit -m "chrome-exoskeleton: <name>: <what changed>"
git ldf push
```

The push runs `~/.config/git/local-dotfiles-hooks/pre-push`, which runs
`exo check --e2e` (about 90 seconds) whenever `share/chrome-exoskeleton/`
changed and prints `[EXO-PREPUSH] passed|failed`. `dotfiles::commit` treats
`failed` as fatal; git itself reports every hook failure as exit 1.
`EXO_PUSH_E2E=0 git ldf push` skips the browser suite.

### Framework or public plugin (submodule)

1. Commit inside `~/.config/chrome-exoskeleton`. Its `.githooks/pre-commit` is
   `exo check`; use conventional commits (`feat(plugins/richlink): ...`).
2. Push as the personal account:
   ```zsh
   env -u GITHUB_TOKEN gh auth switch -u AriSweedler
   env -u GITHUB_TOKEN git -C ~/.config/chrome-exoskeleton -c credential.helper= -c 'credential.helper=!gh auth git-credential' push https://github.com/AriSweedler/chrome-exoskeleton.git main:main
   env -u GITHUB_TOKEN gh auth switch -u <work-account>
   ```
3. Bump the shared-tier pointer, then end with "Run `git_df_push` when ready.":
   ```zsh
   cd ~ && git df add ~/.config/chrome-exoskeleton && git df commit -m "chrome-exoskeleton: bump to <short sha>"
   ```

### Another machine picks up a framework change

```zsh
git df pull && cd ~ && git df submodule update
exo build
```

### Fresh machine

`new-machine apply dotfiles_repo` runs `submodule update --init` after the
checkout; `new-machine check` reports `submodule_uninitialized` and
`submodule_drift`. Then `exo build` (needs node; the local tier's `env.zsh`
provides it on a work machine) and Load unpacked.

### A skill that belongs to this repo

Skills that only make sense with the framework (this one) live in
`~/.config/chrome-exoskeleton/skills/<name>/` and are committed in the
framework repo (step list above), not with `git df add`. `/ari-dotfiles-skill-registry`'s
`link` symlinks them into `~/.claude/skills`.

## Key locations

- Local-tier allowlist rules for `share/chrome-exoskeleton/` (tracked minus
  `examples/*`, `plugins/node_modules`, `test-results/`): both
  `~/.local/local-dotfiles.git/info/exclude` and the shared-tier template
  `~/.config/new-machine/local-dotfiles-exclude`.
- Hooks: `~/.config/git/local-dotfiles-hooks/pre-push` (exo check on push),
  `~/.config/git/dotfiles-hooks/pre-commit` (pointer must be on `origin/main`).
- The legacy single repo: `~/h/source/chrome-extension-exoskeleton`.
