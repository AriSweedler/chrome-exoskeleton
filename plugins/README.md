# plugins/ — plugins shipped with the framework

Each directory here is a plugin (see `docs/writing-a-plugin.md`). `bin/exo link`
mounts them at `src/plugins/<name>`, and that mount is the only path the build
and the tests use. Private, per-machine plugins live outside this repo, in the
local dotfiles tier: `~/.local/share/chrome-exoskeleton/plugins/<name>/`.

The `tsconfig.json` and `eslint.config.js` here exist for editors that open a
plugin at its real path; `exo check` always checks through the mount.
