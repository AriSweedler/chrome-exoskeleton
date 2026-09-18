# e2e/ — the Playwright harness

`fixtures.ts` launches a persistent Chromium with `dist/` loaded as an unpacked
extension; `helpers.ts` drives the real content script against toy pages served
at real URLs (route interception), waits for toasts, reads the clipboard, and
records which keystrokes reached the page.

Specs here test the framework: the extension loads, the content script runs,
the popup renders, the toast pipeline works, the help overlay and the sequence
engine behave. A plugin's own specs live in `<plugin>/e2e/*.spec.ts` and import
this harness through the `@exo-e2e/*` alias (see `plugins/tsconfig.json`);
`playwright.config.ts` runs one project per plugin root.

Run everything with `exo check --e2e` (builds first) or `npm run test:e2e`.
