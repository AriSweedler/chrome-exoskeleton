# Rich Link Handlers

Rich link handlers power the **Cmd+Shift+C** copy feature (the `richlink` plugin). Each handler knows how to produce a meaningful copy-paste link for a class of URLs (GitHub PRs, Google Docs, an internal tool's records).

## How it works

When the user copies a rich link, the system:

1. Finds all handlers whose `canHandle(url)` returns `true`
2. Collects their `getFormats()` results
3. Sorts by `priority` (lower = first)
4. Copies the top format and shows a toast; pressing Cmd+Shift+C again within the cycling window walks through the remaining formats

Specialized handlers are tried first, then fallback handlers (Page Title, Raw URL) are always appended.

## Architecture

The system has three layers:

1. **`Handler`** (abstract base class, `@exo/lib/richlink`) — defines `canHandle(url)` and `getFormats(ctx)`
2. **`HandlerRegistry`** (`@exo/lib/richlink`) — collects handlers into specialized vs. fallback lists, sorts and merges formats at query time
3. **Auto-discovery** (`plugins/richlink/handlers/index.ts`) — `import.meta.glob('./*.handler.ts')` finds the richlink plugin's own handler files, instantiates any exported class that extends `Handler`, and registers it

Inside the richlink plugin you never call `HandlerRegistry.register()`: export a class extending `Handler` from a `*.handler.ts` file and it's live. Other plugins call it once from their page module (below).

## Adding a handler for a public site

Create a `*.handler.ts` file in `plugins/richlink/handlers/`. The class must extend `Handler` — that's how auto-discovery identifies it.

```ts
import {Handler, type FormatContext, type LinkFormat} from '@exo/lib/richlink';

export class MyHandler extends Handler {
    canHandle(url: URL): boolean {
        return url.hostname === 'example.com';
    }

    getFormats({url}: FormatContext): LinkFormat[] {
        const title = document.querySelector('h1')?.textContent?.trim() ?? 'Example';
        return [{
            label: 'Example Page',
            priority: 30,
            html: `<a href="${url}">${title}</a>`,
            text: `${title} (${url})`,
        }];
    }
}
```

Add a colocated `*.handler.test.ts` with tests.

### Key conventions

- **Priority:** Lower numbers appear first. Use 10-40 for specialized handlers, 100+ for fallbacks.
- **DOM access:** Handlers run in the content script context and have direct `document` access.
- **URL context:** Always use `ctx.url`, never `window.location` (the URL is provided by the caller; tests and format cycling pass explicit URLs).
- **Fallback handlers:** Set `readonly isFallback = true` to mark a handler as a fallback (shown at reduced toast opacity).

## Handlers in other plugins

A plugin for a site of its own does not add a file to the richlink plugin. It
registers its handler from its own `page.ts`:

```ts
import {HandlerRegistry} from '@exo/lib/richlink';
import {MySiteHandler} from '@exo/plugins/my-site/richlink.handler';

HandlerRegistry.register(new MySiteHandler());
```

The registry is shared, so the format shows up in Cmd+Shift+C's cycle on
that site exactly as a built-in one would. A handler may itself delegate to
sub-handlers (one per record type, say); that structure is the plugin's own
business.

## Testing handlers

Colocate a `*.handler.test.ts` (jsdom; set `document.body.innerHTML` to the
slice of DOM the handler reads). Against a real page, save its DOM under the
plugin's `examples/` and run

```bash
npm run handler -- MySiteHandler <snapshot.html> <url>
```

which prints every format the handler would offer. See [testing.md](testing.md).
