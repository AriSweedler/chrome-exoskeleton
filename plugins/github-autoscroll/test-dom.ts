/**
 * A GitHub-shaped pull request "Files changed" DOM for tests: the markup the
 * files.ts model documents, plus an emulation of what GitHub does when the
 * Viewed toggle or the fold chevron is clicked. Unit tests install the
 * emulation as TypeScript (`installGitHubBehavior`); the e2e fixture embeds
 * the same emulation as a script (`GITHUB_BEHAVIOR_SCRIPT`) — keep the two
 * in step. Test tooling only — never bundled.
 */

export interface FixtureFile {
    path: string;
    viewed?: boolean;
    collapsed?: boolean;
    /** Which body GitHub rendered: a diff, or one of its "Load Diff" placeholders. */
    body?: 'diff' | 'generated' | 'deleted' | 'large';
    /** Height of the rendered body, so scroll tests have real geometry. */
    bodyHeight?: number;
}

const BODIES = {
    diff: '<div class="diff-content">+ actual diff lines</div>',
    generated: '<button>Load Diff</button> Some generated files are not rendered by default.',
    deleted: '<button>Load Diff</button> This file was deleted.',
    large: '<button>Load Diff</button> Large diffs are not rendered by default.',
} as const;

/** The anchor GitHub would give a path: deterministic, so tests can name files. */
export const anchorFor = (path: string): string => `diff-${path.replace(/[^a-z0-9]/gi, '')}`;

const LRM = '‎';

/** One file region, as GitHub renders it. */
export function renderFile(file: FixtureFile, index: number): string {
    const {path, viewed = false, collapsed = viewed, body = 'diff', bodyHeight = 300} = file;
    const anchor = anchorFor(path);
    const chevron = collapsed ? 'octicon-chevron-right' : 'octicon-chevron-down';
    const bodyHtml = collapsed
        ? ''
        : `<div data-diff-anchor="${anchor}" style="min-height: ${bodyHeight}px">${BODIES[body]}</div>`;
    return `
    <div class="PullRequestDiffsList-module__diffEntry__djnVa" data-sticky-enabled="">
      <div role="region" aria-labelledby="heading-${index}" id="${anchor}"
           class="Diff-module__diffTargetable__pirZi Diff-module__diff__rx9XH" data-targeted="false">
        <div class="Diff-module__diffHeaderWrapper__UgUyv" data-diff-header-wrapper="true"
             style="--header-sticky-offset: 0px;">
          <div class="DiffFileHeader-module__diff-file-header__UuNN4${collapsed ? ' DiffFileHeader-module__collapsed__ZY5uc' : ''}"
               style="height: 42px">
            <div class="d-flex flex-shrink-0">
              <button data-component="IconButton" type="button" class="prc-Button-ButtonBase-9n-Xk prc-Button-IconButton-fyge7"
                      aria-labelledby="fold-tip-${index}">
                <svg data-component="Octicon" aria-hidden="true" class="octicon ${chevron}" viewBox="0 0 16 16" width="16" height="16"></svg>
              </button>
              <span class="prc-TooltipV2-Tooltip-tLeuB" id="fold-tip-${index}" data-fold-tip="" popover="auto">${collapsed ? 'Expand file' : 'Collapse file'}</span>
            </div>
            <div class="d-flex px-1 flex-items-center overflow-hidden DiffFileHeader-module__file-path-section__ZcmB1">
              <h3 id="heading-${index}" class="DiffFileHeader-module__file-name__VVXpg">
                <a class="Link--primary prc-Link-Link-9ZwDx" href="#${anchor}"><code>${LRM}${path}${LRM}</code></a>
              </h3>
              <button type="button" aria-label="Copy file name to clipboard">Copy file name to clipboard</button>
              <button type="button" aria-label="Expand all lines: ${path}" data-file-path="${path}"
                      class="js-expand-all-difflines-button"></button>
            </div>
            <button data-component="Button" type="button" aria-pressed="${viewed}" aria-label="${viewed ? 'Viewed' : 'Not Viewed'}"
                    class="prc-Button-ButtonBase-9n-Xk${viewed ? ' MarkAsViewedButton-module__viewed__k8dzo' : ''} MarkAsViewedButton-module__iconOnly__kEP4e">
              <span>Viewed</span>
            </button>
          </div>
        </div>
        ${bodyHtml}
      </div>
    </div>`;
}

/** The whole files list (GitHub's `progressive-diffs-list`). */
export function renderFilesList(files: FixtureFile[]): string {
    return `<div data-hpc="true" data-testid="progressive-diffs-list" class="d-flex flex-column gap-3">${files
        .map(renderFile)
        .join('')}</div>`;
}

/** The class the emulation toggles for a collapsed header (GitHub's, suffix and all). */
const COLLAPSED_CLASS = 'DiffFileHeader-module__collapsed__ZY5uc';
const VIEWED_CLASS = 'MarkAsViewedButton-module__viewed__k8dzo';

/**
 * How long the emulated GitHub takes to apply a Viewed click: its aria-pressed
 * flips after this, and the collapse (body removed) follows a beat later —
 * the two-step commit that makes a scroll measured too early land wrong.
 */
export const VIEWED_FLIP_DELAY_MS = 30;
export const COLLAPSE_AFTER_FLIP_MS = 120;

/**
 * Emulate GitHub on a fixture rendered by this module: the fold chevron
 * collapses/expands at once (dropping/restoring the body, like GitHub);
 * the Viewed toggle flips its state after VIEWED_FLIP_DELAY_MS and then
 * collapses (or re-expands) the file COLLAPSE_AFTER_FLIP_MS later.
 * Returns an uninstaller.
 */
export function installGitHubBehavior(root: Document): () => void {
    const detachedBodies = new Map<string, Element>();

    const setCollapsed = (region: HTMLElement, collapsed: boolean): void => {
        const header = region.querySelector('[class*="DiffFileHeader-module__diff-file-header"]');
        const chevron = region.querySelector('svg.octicon-chevron-right, svg.octicon-chevron-down');
        const tip = region.querySelector('[data-fold-tip]');
        header?.classList.toggle(COLLAPSED_CLASS, collapsed);
        chevron?.classList.toggle('octicon-chevron-right', collapsed);
        chevron?.classList.toggle('octicon-chevron-down', !collapsed);
        if (tip) tip.textContent = collapsed ? 'Expand file' : 'Collapse file';
        const body = region.querySelector('[data-diff-anchor]');
        if (collapsed && body) {
            detachedBodies.set(region.id, body);
            body.remove();
        } else if (!collapsed && !body) {
            const detached = detachedBodies.get(region.id);
            if (detached) region.appendChild(detached);
        }
    };

    const onClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest('button');
        const region = button?.closest<HTMLElement>('[role="region"][id^="diff-"]');
        if (!button || !region) return;
        if (button.className.includes('MarkAsViewedButton')) {
            const viewed = button.getAttribute('aria-pressed') !== 'true';
            setTimeout(() => {
                button.setAttribute('aria-pressed', String(viewed));
                button.setAttribute('aria-label', viewed ? 'Viewed' : 'Not Viewed');
                button.classList.toggle(VIEWED_CLASS, viewed);
                setTimeout(() => setCollapsed(region, viewed), COLLAPSE_AFTER_FLIP_MS);
            }, VIEWED_FLIP_DELAY_MS);
        } else if (button.querySelector('svg.octicon-chevron-right, svg.octicon-chevron-down')) {
            setCollapsed(region, region.querySelector('svg.octicon-chevron-right') === null);
        }
    };

    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
}

/** `installGitHubBehavior` as a page script, for the e2e fixture. Same behavior, same timings. */
export const GITHUB_BEHAVIOR_SCRIPT = `<script>
(() => {
  const detachedBodies = new Map();
  const setCollapsed = (region, collapsed) => {
    const header = region.querySelector('[class*="DiffFileHeader-module__diff-file-header"]');
    const chevron = region.querySelector('svg.octicon-chevron-right, svg.octicon-chevron-down');
    const tip = region.querySelector('[data-fold-tip]');
    header && header.classList.toggle('${COLLAPSED_CLASS}', collapsed);
    chevron && chevron.classList.toggle('octicon-chevron-right', collapsed);
    chevron && chevron.classList.toggle('octicon-chevron-down', !collapsed);
    if (tip) tip.textContent = collapsed ? 'Expand file' : 'Collapse file';
    const body = region.querySelector('[data-diff-anchor]');
    if (collapsed && body) { detachedBodies.set(region.id, body); body.remove(); }
    else if (!collapsed && !body && detachedBodies.has(region.id)) region.appendChild(detachedBodies.get(region.id));
  };
  document.addEventListener('click', (event) => {
    const button = event.target && event.target.closest('button');
    const region = button && button.closest('[role="region"][id^="diff-"]');
    if (!button || !region) return;
    if (button.className.includes('MarkAsViewedButton')) {
      const viewed = button.getAttribute('aria-pressed') !== 'true';
      setTimeout(() => {
        button.setAttribute('aria-pressed', String(viewed));
        button.setAttribute('aria-label', viewed ? 'Viewed' : 'Not Viewed');
        button.classList.toggle('${VIEWED_CLASS}', viewed);
        setTimeout(() => setCollapsed(region, viewed), ${COLLAPSE_AFTER_FLIP_MS});
      }, ${VIEWED_FLIP_DELAY_MS});
    } else if (button.querySelector('svg.octicon-chevron-right, svg.octicon-chevron-down')) {
      setCollapsed(region, region.querySelector('svg.octicon-chevron-right') === null);
    }
  });
})();
</script>`;

// --- the diff view settings menu ------------------------------------------

/**
 * GitHub's files toolbar, reduced to the gear that opens the diff view
 * settings — preceded, as on GitHub, by an empty sticky-header sentinel that
 * carries a PullRequestFilesToolbar class of its own.
 */
export function renderToolbar(layout: 'unified' | 'split'): string {
    return `<div class="PullRequestFilesToolbar-module__stickyHeaderActivationThreshold__nWqbQ"></div>
    <section class="use-sticky-header-module__stickyHeader__sf0hv PullRequestFilesToolbar-module__toolbar__ztHN6" data-layout="${layout}">
      <h2 class="sr-only">Pull request toolbar</h2>
      <button data-component="IconButton" type="button" aria-haspopup="true" aria-expanded="false" aria-labelledby="diff-settings-tip"
              class="prc-Button-ButtonBase-9n-Xk prc-Button-IconButton-fyge7">
        <svg data-component="Octicon" aria-hidden="true" class="octicon octicon-gear" viewBox="0 0 16 16" width="16" height="16"></svg>
      </button>
      <span class="prc-TooltipV2-Tooltip-tLeuB" id="diff-settings-tip" popover="auto">Open diff view settings</span>
    </section>`;
}

const LAYOUT_MENU_HTML = (layout: string) => `<div role="menu" id="exo-test-layout-menu">
  <div role="group" aria-label="Layout">
    <div role="menuitemradio" aria-checked="${layout === 'unified'}"><span>Unified</span></div>
    <div role="menuitemradio" aria-checked="${layout === 'split'}"><span>Split</span></div>
  </div>
  <div role="menuitemcheckbox" aria-checked="false">Hide whitespace</div>
</div>`;

/**
 * Emulate the diff view settings menu: the gear toggles a menu with the two
 * Layout radio items (unless `items: false`); picking one records the layout
 * on the body and closes the menu; Escape closes it. Returns an uninstaller.
 */
export function installLayoutMenu(root: Document, {items = true} = {}): () => void {
    const layoutOf = () =>
        root.body.dataset.layout ??
        root.querySelector<HTMLElement>('[data-layout]')?.dataset.layout ??
        'unified';
    const close = () => root.getElementById('exo-test-layout-menu')?.remove();
    const onClick = (event: Event): void => {
        const target = event.target as Element | null;
        const gear = target?.closest('button[aria-haspopup]');
        if (gear) {
            if (root.getElementById('exo-test-layout-menu')) close();
            else {
                root.body.insertAdjacentHTML(
                    'beforeend',
                    items
                        ? LAYOUT_MENU_HTML(layoutOf())
                        : '<div role="menu" id="exo-test-layout-menu"><div role="menuitemcheckbox">Hide whitespace</div></div>',
                );
            }
            return;
        }
        const radio = target?.closest('[role="menuitemradio"]');
        if (radio) {
            root.body.dataset.layout = radio.textContent?.trim() === 'Split' ? 'split' : 'unified';
            close();
        }
    };
    const onKey = (event: Event): void => {
        if ((event as KeyboardEvent).key === 'Escape') close();
    };
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    return () => {
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', onKey);
        close();
    };
}

/** `installLayoutMenu` as a page script, for the e2e fixture. Same behavior. */
export const GITHUB_LAYOUT_MENU_SCRIPT_BEHAVIOR = `<script>
(() => {
  const close = () => { const m = document.getElementById('exo-test-layout-menu'); if (m) m.remove(); };
  const menu = (layout) => '<div role="menu" id="exo-test-layout-menu"><div role="group" aria-label="Layout">'
    + '<div role="menuitemradio" aria-checked="' + (layout === 'unified') + '"><span>Unified</span></div>'
    + '<div role="menuitemradio" aria-checked="' + (layout === 'split') + '"><span>Split</span></div>'
    + '</div><div role="menuitemcheckbox" aria-checked="false">Hide whitespace</div></div>';
  document.addEventListener('click', (event) => {
    const gear = event.target && event.target.closest('button[aria-haspopup]');
    if (gear) {
      if (document.getElementById('exo-test-layout-menu')) close();
      else document.body.insertAdjacentHTML('beforeend', menu(document.body.dataset.layout || 'unified'));
      return;
    }
    const radio = event.target && event.target.closest('[role="menuitemradio"]');
    if (radio) { document.body.dataset.layout = radio.textContent.trim() === 'Split' ? 'split' : 'unified'; close(); }
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
})();
</script>`;
