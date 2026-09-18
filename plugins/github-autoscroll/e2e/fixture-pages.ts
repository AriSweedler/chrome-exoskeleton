/**
 * A toy GitHub PR "Files changed" page, served at a real github.com URL via
 * route interception so the content script injects and this plugin's page
 * module registers its bindings. Pure data.
 */
import {KEYLOGGER_SNIPPET} from '@exo-e2e/fixture-pages';

// --- GitHub PR ---------------------------------------------------------

export const PR_URL = 'https://github.com/exo-test/repo/pull/1';

// Each diff body carries GitHub's data-diff-anchor, paired to its header via
// the h3 link's #<anchor> href. Auto-hidden files render the "not rendered by
// default" placeholder and deleted files "This file was deleted."; large
// diffs say "Large diffs are not rendered by default" and must be left alone.
const PR_DIFF_BODIES = {
    rendered: '<div class="diff-content">+ actual diff lines</div>',
    autoHidden:
        '<div class="hidden-diff-reason">Some generated files are not rendered by default.</div>',
    deleted: '<div class="hidden-diff-reason">This file was deleted.</div>',
    largeDiff: '<div class="hidden-diff-reason">Large diffs are not rendered by default.</div>',
} as const;

const prFile = (path: string, viewed: boolean, body: keyof typeof PR_DIFF_BODIES) => {
    const anchor = `diff-${path.replace(/[^a-z]/gi, '')}`;
    return `
    <div class="DiffFileHeader-module__diff-file-header__UuNN4">
      <h3 class="DiffFileHeader-module__file-name__V">
        <a class="prc-Link-Link-9ZwDx" href="#${anchor}">${'\u200e'}${path}${'\u200e'}</a>
      </h3>
      <button class="prc-Button-ButtonBase MarkAsViewedButton-module__x"
              aria-label="${viewed ? 'Viewed' : 'Not Viewed'}" aria-pressed="${viewed}">
        <span>Viewed</span>
      </button>
    </div>
    <div data-diff-anchor="${anchor}">${PR_DIFF_BODIES[body]}</div>`;
};

export const PR_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>toy app</title></head>
  <body>
    <h1 id="app">toy app</h1>
    ${prFile('infra/deploy/generated/config.alpha.json', false, 'autoHidden')}
    ${prFile('infra/deploy/generated/config.staging.json', true, 'autoHidden')}
    ${prFile('src/index.ts', false, 'rendered')}
    ${prFile('src/generated/bundle.yaml', false, 'largeDiff')}
    ${prFile('services/legacy/old-worker.yaml', false, 'deleted')}
    <script>
      // Like real GitHub: the Viewed toggle flips its aria-pressed on click.
      for (const btn of document.querySelectorAll('button[class*="MarkAsViewedButton"]')) {
        btn.addEventListener('click', () => {
          btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
        });
      }
    </script>
    ${KEYLOGGER_SNIPPET}
  </body>
</html>`;
