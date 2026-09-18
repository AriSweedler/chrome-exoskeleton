# Writing a plugin

A plugin is a directory. Its existence is its registration: `bin/exo link`
mounts it at `src/plugins/<name>`, and the framework's two `import.meta.glob`
calls (content script: `page.{ts,tsx}`; popup: `tab.tsx`) pick it up from there.
No manifest, no package.json, no central list to edit.

## Where it lives

| you want | put it in | tracked by |
|---|---|---|
| a plugin for a public site, shipped with the framework | `plugins/<name>/` in this repo | this repo |
| a private, per-machine plugin (a work tool) | `~/.local/share/chrome-exoskeleton/plugins/<name>/` | your local dotfiles tier |
| something else | any directory listed in `EXO_PLUGIN_DIRS` (colon-separated) | you |

Both are built, tested and linted identically: every tool only ever sees
`src/plugins/<name>`. A plugin name must be unique across roots. A root
outside this repo gets a `node_modules` symlink and an ESM `package.json`
marker from `exo link` (editors and Playwright need them; they are not
plugins).

Scaffold one:

```bash
exo new --name my-site --tier df --kind page       # this repo
exo new --name my-tool --tier ldf --kind handler   # local tier
```

Kinds: `page` (keybindings), `tab` (a popup tab), `handler` (a rich-link
format). Mix freely afterwards; the kind only picks the template.

## The contract

`src/plugins/contract.test.ts` checks every mounted plugin:

1. The directory name is a slug: `^[a-z][a-z0-9-]*$`.
2. It has `page.ts` (or `page.tsx`) and/or `tab.tsx`.
3. It has at least one `*.test.ts(x)` file.
4. If it has `tab.tsx`, that file calls `TabRegistry.register({id: '<dirname>', ...})`.

And eslint fences its imports: `@exo/lib/*`, `@exo/theme/*` and the plugin
itself (`@exo/plugins/<name>/*`), nothing else. Relative imports are banned
repo-wide; always use the `@exo/` alias. Two plugins never import each other:
share code by lifting it into `src/lib`.

## page.ts: keybindings and page behavior

The content script runs on every URL, so a page module gates everything on
its site before touching the shared registry:

```ts
import {keybindings} from '@exo/lib/keybindings';
import {Notifications} from '@exo/lib/toast-notification';
import {safeUrl} from '@exo/lib/url';

export function isMySite(url: string): boolean {
    return safeUrl(url)?.hostname === 'my-site.example';
}

function initialize(): void {
    if (!isMySite(window.location.href)) return;

    keybindings.registerAll([
        {
            key: 'x',
            description: 'Do the thing',
            context: 'My Site', // grouping in the ? help overlay
            handler: () => Notifications.show({message: 'Done'}),
        },
        {
            sequence: ['g', 'g'],
            description: 'Scroll to the top',
            context: 'My Site',
            handler: () => window.scrollTo({top: 0}),
        },
    ]);
    keybindings.listen();
}

initialize();
```

Useful knobs (see [keybindings.md](keybindings.md)): `modifiers`, a `when`
guard for bindings that only sometimes apply (an SPA whose URL changes without
a reload), `silent` for bindings that should not announce themselves, and
`makeEnvCycleBinding` from `@exo/lib/environments` for the shared Shift+E
"next environment" switch on sites with alpha/staging/production hosts.

Registry semantics worth knowing: `TabRegistry.register` throws on a duplicate
id; a keybinding registered twice with the same key and modifiers on the same
page silently replaces the first. Two plugins that both run on one host must
not claim the same key.

Keep `page.ts` thin; domain logic goes in sibling modules with their own tests.

## tab.tsx: a popup tab

```tsx
import {TabRegistry, matchPriority} from '@exo/lib/popup-tabs/tab-registry';
import {MyComponent} from '@exo/plugins/my-site/MyComponent';
import {isMySite} from '@exo/plugins/my-site/page';

TabRegistry.register({
    id: 'my-site',
    label: 'My Site',
    component: MyComponent,
    getPriority: matchPriority(isMySite), // 0 on a match, hidden otherwise
    enablementToggle: true, // optional on/off switch, stored as exorun-my-site
});
```

A tab that needs to run something on the page defines a typed action
(`Action` from `@exo/lib/actions/base-action`), handles it in `page.ts` with
`MyAction.handle(...)`, and sends it from the component with
`MyAction.sendToTab(...)`. Use `@exo/theme/default` for shared colors; a color
only your plugin uses is a local constant.

## A rich-link format

Rich links are owned by the `richlink` plugin (Cmd+Shift+C). Your plugin adds
a format for its site by registering a handler from `page.ts`:

```ts
import {HandlerRegistry, Handler, type FormatContext} from '@exo/lib/richlink';

class MySiteHandler extends Handler {
    readonly label = 'My Site';
    readonly priority = 20; // lower sorts first; fallbacks are 100+
    canHandle(url: URL): boolean {
        return url.hostname === 'my-site.example';
    }
    extractLinkText(_ctx: FormatContext): string {
        return document.querySelector('h1')?.textContent?.trim() ?? document.title;
    }
}

HandlerRegistry.register(new MySiteHandler());
```

Always read the URL from `ctx.url`, never `window.location`: handlers also run
in the popup, and tests pass explicit URLs. See
[richlink-handlers.md](richlink-handlers.md).

## Tests

- **Unit**: colocated `*.test.ts(x)`; jsdom, `chrome.*` mocked by sinon-chrome.
  `exo check` runs the framework's and every mounted plugin's in one pass.
- **Real DOM**: save a page's DOM to `examples/<name>.html` (gitignored,
  machine-local) and iterate with `createExampleDomLoader` from
  `@exo/lib/example-dom`; the suite skips loudly when no snapshot is saved.
  Debug a handler against one with `npm run handler -- MyHandler <file.html> <url>`.
- **End to end**: `e2e/*.spec.ts` inside the plugin, importing the harness as
  `@exo-e2e/fixtures` and `@exo-e2e/helpers`. Serve toy HTML at your site's
  real URL with `openFixturePage` and drive the real content script. See
  [testing.md](testing.md).

## Checklist

```bash
exo check          # contract, fence, lint, format, types, unit tests
exo check --e2e    # + build + Playwright
exo build          # then reload the extension at chrome://extensions
```
