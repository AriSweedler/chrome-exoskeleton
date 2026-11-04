# save-page

**Cmd+Shift+D saves the page and copies a prompt for Claude**, everywhere.

The live DOM (what you see, after every script has run — not the server's
HTML) is downloaded to the browser's download directory as
`<slug>.<epoch>.html`, where the slug is the tab title made filename-safe and
cut to 20 characters, and the epoch is in seconds. The clipboard then holds

```
Find the webpage @~/Downloads/<slug>.<epoch>.html
```

ready to paste into a Claude Code session; the `@` mention attaches the file.
The saved document starts with a comment naming the URL and the moment, and
leaves out the extension's own toasts and overlay.

| key | does |
|---|---|
| `Cmd+Shift+D` | download the page as HTML, copy the Claude prompt |

Toast tags: `save-page.saved`, `save-page.failed`.
