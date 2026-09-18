# Testing

One command runs everything: `exo check` (add `--e2e` for the browser suite).
The pre-commit hook is `exo check`; CI is `exo check --e2e`.

| step | what |
|---|---|
| link | mount every plugin; fail on a name used by two roots |
| folders | every mount has `page.ts(x)` and/or `tab.tsx` |
| eslint | `eslint . src/plugins/*/ --max-warnings 0` (mounts are passed explicitly: `eslint .` skips symlinked directories) |
| prettier | `--check` over `find -L src e2e` (the mounts included) with `.prettierignore` |
| tsc | `tsc --noEmit`, follows the mounts |
| vitest | framework + contract + API snapshot + every mounted plugin's tests |
| lockfile | every `resolved` URL in `package-lock.json` is registry.npmjs.org |
| leak grep | tracked files against `~/.local/share/chrome-exoskeleton/denylist.txt`, when that file exists |
| `--e2e` | `exo build`, then Playwright |

## Unit tests (vitest)

jsdom, `globals: true`, `chrome.*` mocked by sinon-chrome in
`src/test/setup.tsx`. Tests are colocated with the code they test, in the
framework and in every plugin. vitest reaches plugin tests only through the
`src/plugins/<name>` mounts; `plugins/**` itself is excluded so nothing runs
twice.

```bash
npm test                # watch
npm run test:run        # once
npm run test:coverage   # coverage report (informational, no gate)
```

Two framework tests guard the plugin contract: `src/plugins/contract.test.ts`
(see writing-a-plugin.md) and `src/lib/api.snapshot.test.ts`, which pins the
export names of every module a plugin may import. Changing the framework API
means updating that inline snapshot on purpose.

## Real-DOM snapshot tests

A plugin that scrapes a site keeps saved copies of that site's DOM under its
`examples/` directory (gitignored, machine-local) and runs its helpers over
every saved file: data-driven, no hard-coded ids. `createExampleDomLoader`
from `@exo/lib/example-dom` resolves the directory beside the calling module,
lists snapshots and prints a save hint; the suite skips loudly when none are
saved, so committed tests never depend on uncommitted files.

Save one: open the real page, copy its DOM (devtools: copy outerHTML), then
`pbpaste > plugins/<name>/examples/<what>.html` (or the local tier's path).

## End-to-end tests (Playwright)

`e2e/fixtures.ts` launches a persistent Chromium with `dist/` loaded as an
unpacked extension and exposes `context` and `extensionId`. Chromium only,
one worker, and the popup is tested by navigating to
`chrome-extension://<id>/src/popup/index.html`.

`playwright.config.ts` defines one project per place specs live:

| project | testDir | holds |
|---|---|---|
| `framework` | `e2e/` | extension load, content script, popup, toast pipeline, help overlay, sequence engine |
| `plugins-df` | `plugins/` | each shipped plugin's `e2e/*.spec.ts` |
| `plugins-ldf` | `~/.local/share/chrome-exoskeleton/plugins/` | each local-tier plugin's `e2e/*.spec.ts` (only where that directory exists) |

Plugin specs import the harness as `@exo-e2e/fixtures` and `@exo-e2e/helpers`;
the alias is declared in each plugin root's `tsconfig.json`. (Playwright's
testDir does not follow symlinks, hence realpath projects rather than the
mounts.) A plugin root outside this repo also carries a `node_modules` symlink
and a `package.json` with `"type": "module"`, both created by `exo link`:
Playwright picks a file's module format from its nearest `package.json`, and a
run that mixes ESM and CommonJS specs breaks on the shared harness.

### The fixture-page pattern

`helpers.ts` drives the real content script against a toy page: route-intercept
a real production URL and serve fixture HTML there. The content script injects
by URL alone, so the plugin's page module registers its bindings against your
fixture DOM.

```ts
const page = await openFixturePage(context, MY_URL, MY_HTML);
await pressAndExpectToast(page, 'x', 'Done');
expect(await readClipboardText(page)).toBe('...');
```

- `openFixturePage` routes the whole origin, so in-page navigations keep
  resolving to the fixture.
- Page modules register bindings after an async storage read; a keystroke
  sent too early is lost. `pressAndExpectToast` retries the press, so use it
  only with idempotent shortcuts; use `waitForKeybindings` before driving a
  chord.
- Embed `KEYLOGGER_SNIPPET` (from `@exo-e2e/fixture-pages`) in the fixture to
  assert which keys reached the page via `seenKeys` / `resetSeenKeys`.

```bash
exo check --e2e                                         # everything
npx playwright test plugins/github-autoscroll/e2e       # one plugin, after exo build
SLOWMO=400 npx playwright test --headed e2e/help-overlay.spec.ts
```
