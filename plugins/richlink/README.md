# richlink

**Cmd+Shift+C copies a rich link to the current page**, everywhere. Press it
again within the cycling window to walk through the other formats; the toast
shows which copier ran and what comes next.

A format comes from a `Handler` (see `@exo/lib/richlink`). This plugin owns
the key, the copy toast and the cycling, and ships the handlers for public
sites:

| handler | pages | format |
|---|---|---|
| `GitHubHandler` | pull requests, issues, repos | title + `#number` |
| `GitHubPrNumberHandler` | pull requests | just `#number` |
| `GoogleDocsHandler` | Docs, Sheets, Slides | document title |
| `PageTitleHandler` | every page (fallback) | `<title>` |
| `RawUrlHandler` | every page (fallback) | the URL itself |

Other plugins add formats for their own sites by registering a handler from
their `page.ts`: `HandlerRegistry.register(new MyHandler())`. They never need
to touch this plugin.

Debug a handler against a saved snapshot: `npm run handler -- GitHubHandler <file.html> <url>`.
