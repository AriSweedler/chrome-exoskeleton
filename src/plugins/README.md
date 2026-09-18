# src/plugins/ — the plugin mount point

Every entry here except `index.tsx`, `contract.test.ts` and this file is a
symlink created by `bin/exo link`, pointing at a plugin directory in one of the
plugin roots:

| root | who | path |
|---|---|---|
| this repo | plugins shipped with the framework | `plugins/<name>/` |
| local tier | this machine's private plugins | `${XDG_DATA_HOME:-~/.local/share}/chrome-exoskeleton/plugins/<name>/` |
| extra | anything in `EXO_PLUGIN_DIRS` (colon-separated) | `<dir>/<name>/` |

The mounts are gitignored. They exist so that every plugin has exactly one
path in every tool: the build's `import.meta.glob` calls, `tsc`, vitest,
eslint and a plugin's own `@exo/plugins/<name>/...` imports all see
`src/plugins/<name>`, never the realpath. `resolve.preserveSymlinks` in the
Vite and vitest configs keeps it that way.

`contract.test.ts` checks every mounted plugin against the contract in
`docs/writing-a-plugin.md`.
