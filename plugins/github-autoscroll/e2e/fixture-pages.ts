/**
 * A toy GitHub PR "Files changed" page, served at a real github.com URL via
 * route interception so the content script injects and this plugin's page
 * module registers its bindings. The markup and the click emulation come
 * from the plugin's test-dom module — the same shapes the unit tests use.
 * Pure data.
 */
import {KEYLOGGER_SNIPPET} from '@exo-e2e/fixture-pages';
import {
    GITHUB_BEHAVIOR_SCRIPT,
    anchorFor,
    renderFilesList,
    type FixtureFile,
} from '@exo/plugins/github-autoscroll/test-dom';

export const PR_URL = 'https://github.com/exo-test/repo/pull/1';
export const PR_CHANGES_URL = `${PR_URL}/changes`;

/** A sticky toolbar above the files, like GitHub's; pinned headers must land below it. */
export const TOOLBAR_HEIGHT = 48;
/** The gap the cursor keeps under the toolbar (cursor.ts PIN_GAP). */
export const PIN_GAP = 6;

export const PR_FILES: FixtureFile[] = [
    {path: 'infra/deploy/generated/config.alpha.json', body: 'generated', bodyHeight: 120},
    {path: 'infra/deploy/generated/config.staging.json', body: 'generated', viewed: true},
    {path: 'src/index.ts', body: 'diff', bodyHeight: 900},
    {path: 'src/generated/bundle.yaml', body: 'large', bodyHeight: 120},
    {path: 'services/legacy/old-worker.yaml', body: 'deleted', bodyHeight: 120},
    {path: 'src/util.ts', body: 'diff', bodyHeight: 600},
];

export const anchor = (path: string): string => anchorFor(path);

export const PR_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"><title>toy app</title>
    <style>
      body { margin: 0; }
      .toolbar { position: sticky; top: 0; height: ${TOOLBAR_HEIGHT}px; background: #eee; }
      .spacer { height: 300px; }
      .tail { height: 3000px; }
    </style>
  </head>
  <body>
    <h1 id="app">toy app</h1>
    <div class="spacer"></div>
    <div class="toolbar">Pull request toolbar</div>
    ${renderFilesList(PR_FILES)}
    <div class="tail"></div>
    ${GITHUB_BEHAVIOR_SCRIPT}
    ${KEYLOGGER_SNIPPET}
  </body>
</html>`;
