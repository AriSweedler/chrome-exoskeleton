/**
 * Shared fixture pages for the e2e harness: toy HTML served at a real URL via
 * route interception (see helpers.ts openFixturePage), so the content script
 * injects and the page modules register their keybindings.
 *
 * Site-specific fixtures live with their plugin, in <plugin>/e2e/. This file
 * holds only what the framework's own specs and more than one plugin need.
 *
 * Pure data.
 */

export const KEYLOGGER_SNIPPET = `<script>
  window.__seenKeys = [];
  window.addEventListener('keydown', (e) => { window.__seenKeys.push(e.key); });
</script>`;

// --- A Google Doc: the page the playground plugin's bindings live on --------

export const GDOC_URL = 'https://docs.google.com/document/d/exo-test/edit';

export const GDOC_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>toy doc</title></head>
  <body>
    <h1 id="doc">toy doc</h1>
    <input id="doc-input" placeholder="type here" />
    ${KEYLOGGER_SNIPPET}
  </body>
</html>`;
