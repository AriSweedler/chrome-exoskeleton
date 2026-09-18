import {scrollElementTop} from '@exo/plugins/github-autoscroll/scroll';
import {safeUrl} from '@exo/lib/url';
import {queryFirstText} from '@exo/lib/dom';

/** Border color of the flash that marks the next unviewed file. */
const FLASH_BORDER = 'hsla(0, 0%, 100%, 1)';

interface GitHubPR {
    owner: string;
    repo: string;
    prNumber: string;
    tab: string | undefined; // sub-tab after the PR number, e.g. 'changes', 'commits'
}

/**
 * Check if URL is on the GitHub host (support both github.com and www.github.com)
 */
export function isGitHubHost(url: string): boolean {
    const hostname = safeUrl(url)?.hostname.toLowerCase();
    return hostname === 'github.com' || hostname === 'www.github.com';
}

/**
 * Parse a GitHub pull request URL into its owner/repo/number/tab parts.
 * Returns null if the URL is not a GitHub pull request page.
 */
function parseGitHubPRUrl(url: string): GitHubPR | null {
    const urlObj = safeUrl(url);
    if (!urlObj || !isGitHubHost(url)) {
        return null;
    }

    // Parse pathname (ignoring query params and fragments)
    // Expected format: owner/repo/pull/{number}[/tab]
    const pathParts = urlObj.pathname.split('/').filter((part) => part !== '');
    if (pathParts.length < 4 || pathParts[2] !== 'pull' || !/^\d+$/.test(pathParts[3])) {
        return null;
    }

    return {owner: pathParts[0], repo: pathParts[1], prNumber: pathParts[3], tab: pathParts[4]};
}

/**
 * Check if URL is any GitHub pull request page (any tab, including the PR root)
 */
export function isGitHubPRPage(url: string): boolean {
    return parseGitHubPRUrl(url) !== null;
}

/**
 * Check if URL is a GitHub PR changes page
 */
export function isGitHubPRChangesPage(url: string): boolean {
    return parseGitHubPRUrl(url)?.tab === 'changes';
}

/**
 * Navigate to a tab of the current GitHub PR. The Conversation tab is the PR
 * root, so pass '' for it; other tabs ('changes', 'commits', 'checks') are the
 * path suffix. No-op when not on a PR page or already on the target tab.
 */
function navigateToPRTab(targetTab: '' | 'changes'): void {
    const pr = parseGitHubPRUrl(window.location.href);
    if (!pr || (pr.tab ?? '') === targetTab) {
        return;
    }
    const base = `/${pr.owner}/${pr.repo}/pull/${pr.prNumber}`;
    window.location.href = targetTab ? `${base}/${targetTab}` : base;
}

/**
 * Navigate to the "Conversation" tab (PR root) of the current GitHub PR.
 */
export function goToConversation(): void {
    navigateToPRTab('');
}

/**
 * Navigate to the "Files changed" (changes) tab of the current GitHub PR.
 */
export function goToChangedFiles(): void {
    navigateToPRTab('changes');
}

/**
 * Whether a diff body's text is one of GitHub's "Load Diff" placeholders for
 * a file it collapsed by default that the `d` sweep may mark viewed: files
 * marked linguist-generated in .gitattributes ("Some generated files are not
 * rendered by default") and deleted files ("This file was deleted."). Large
 * diffs are also collapsed ("Large diffs are not rendered by default") but
 * deliberately excluded: those still need human review.
 */
function isAutoHiddenPlaceholder(text: string): boolean {
    if (text.includes('This file was deleted.')) return true;
    return text.includes('not rendered by default') && !text.includes('Large diffs');
}

/**
 * Anchors (diff-<sha>) of file diffs GitHub itself auto-collapsed into a
 * placeholder instead of a diff — see isAutoHiddenPlaceholder for which.
 */
export function getAutoHiddenDiffAnchors(): Set<string> {
    const anchors = new Set<string>();
    for (const body of Array.from(document.querySelectorAll('[data-diff-anchor]'))) {
        if (!isAutoHiddenPlaceholder(body.textContent ?? '')) continue;
        const anchor = body.getAttribute('data-diff-anchor');
        if (anchor) anchors.add(anchor);
    }
    return anchors;
}

interface ViewedToggle {
    path: string;
    anchor: string | undefined;
    button: HTMLButtonElement;
    viewed: boolean;
}

/**
 * Every rendered file diff's "Viewed" toggle with its path. In the current
 * GitHub files view each diff header carries a MarkAsViewedButton whose
 * aria-pressed reflects the viewed state; the path is the header's h3 link
 * (wrapped in LEFT-TO-RIGHT MARK characters).
 */
export function getViewedToggles(): ViewedToggle[] {
    const buttons = Array.from(
        document.querySelectorAll('button[class*="MarkAsViewedButton"]'),
    ) as HTMLButtonElement[];

    const toggles: ViewedToggle[] = [];
    for (const button of buttons) {
        const header = button.closest('[class*="diff-file-header"]');
        const link = header?.querySelector('h3 a');
        const path = link?.textContent?.replace(/\u200e/g, '').trim();
        if (!path) continue;
        // The header link's #diff-<sha> anchor pairs it with its diff body
        const anchor = link?.getAttribute('href')?.replace(/^#/, '');
        toggles.push({
            path,
            anchor,
            button,
            viewed: button.getAttribute('aria-pressed') === 'true',
        });
    }
    return toggles;
}

/**
 * Mark every file GitHub auto-collapsed (except large diffs) as viewed by
 * clicking its "Viewed" toggle. Returns counts for the caller's toast.
 */
export function markAutoHiddenFilesViewed(): {marked: number; alreadyViewed: number} {
    const hiddenAnchors = getAutoHiddenDiffAnchors();
    const hidden = getViewedToggles().filter(
        (toggle) => toggle.anchor !== undefined && hiddenAnchors.has(toggle.anchor),
    );
    const toMark = hidden.filter((toggle) => !toggle.viewed);
    for (const toggle of toMark) {
        toggle.button.click();
    }
    return {marked: toMark.length, alreadyViewed: hidden.length - toMark.length};
}

/**
 * The inverse of markAutoHiddenFilesViewed: unmark every auto-collapsed file
 * currently marked as viewed, so they show in the list again.
 */
export function unmarkAutoHiddenFilesViewed(): {unmarked: number} {
    const hiddenAnchors = getAutoHiddenDiffAnchors();
    const toUnmark = getViewedToggles().filter(
        (toggle) =>
            toggle.anchor !== undefined && hiddenAnchors.has(toggle.anchor) && toggle.viewed,
    );
    for (const toggle of toUnmark) {
        toggle.button.click();
    }
    return {unmarked: toUnmark.length};
}

/**
 * GitHub's CSS-module diff header wrappers ('Diff-module__diffHeaderWrapper--'
 * with a dynamic suffix) under `root`, unwrapped to the actual file header
 * (each wrapper's first child). Null when `root` has no wrappers at all —
 * distinct from [] (wrappers present but childless, e.g. mid-render), which
 * callers must not paper over with looser selectors.
 */
function headersFromWrappers(root: Document | Element): HTMLElement[] | null {
    const wrappers = Array.from(
        root.querySelectorAll('[class*="Diff-module__diffHeaderWrapper--"]'),
    );
    if (wrappers.length === 0) return null;
    return wrappers
        .map((wrapper) => wrapper.firstElementChild as HTMLElement)
        .filter((el) => el !== null);
}

/**
 * Get all file elements in the PR changes view
 */
function getFiles(): HTMLElement[] {
    // New GitHub UI: Look for DiffFileHeader-module__diff-file-header class (current 2025+ design)
    const diffFileHeaders = Array.from(
        document.querySelectorAll('[class*="DiffFileHeader-module__diff-file-header__"]'),
    );
    if (diffFileHeaders.length > 0) {
        return diffFileHeaders as HTMLElement[];
    }

    // Older CSS-module UI: prefer wrappers scoped to the files container,
    // falling back to a global search
    const container = document.querySelector('[data-hpc="true"] .d-flex.flex-column.gap-3');
    const scoped = container ? headersFromWrappers(container) : null;
    if (scoped) {
        return scoped;
    }

    const global = headersFromWrappers(document);
    if (global) {
        return global;
    }

    // Final fallback selectors
    const fallbackSelectors = [
        '[data-tagsearch-path]',
        '[data-path]',
        '.file-header',
        '.file',
        '.js-file',
    ];

    for (const selector of fallbackSelectors) {
        const files = Array.from(document.querySelectorAll(selector));
        if (files.length > 0) {
            // Filter out UI control elements that aren't actual files
            const filtered = files.filter((el) => {
                const testId = el.getAttribute('data-testid');
                // Exclude file tree buttons and controls
                if (
                    testId &&
                    (testId.includes('expand-file-tree') ||
                        testId.includes('collapse-file-tree') ||
                        testId.includes('file-controls-divider'))
                ) {
                    return false;
                }
                return true;
            });
            if (filtered.length > 0) {
                return filtered as HTMLElement[];
            }
        }
    }

    return [];
}

/**
 * GitHub renders the viewed control near the file header: inside it, inside
 * its closest div, or inside its parent.
 */
function queryNearby(el: HTMLElement, selector: string): Element | null {
    return (
        el.querySelector(selector) ??
        el.closest('div')?.querySelector(selector) ??
        el.parentElement?.querySelector(selector) ??
        null
    );
}

/**
 * Check if a file is marked as viewed
 */
function isViewed(fileElement: HTMLElement): boolean {
    // Look for GitHub's new button-based "viewed" system
    const viewedButton = queryNearby(fileElement, 'button[aria-pressed="true"]');
    if (viewedButton?.textContent?.includes('Viewed')) {
        return true;
    }

    // Check for the CSS class pattern that indicates viewed state
    if (queryNearby(fileElement, '[class*="MarkAsViewedButton-module__viewed--"]')) {
        return true;
    }

    // Fallback to old checkbox system (if still exists)
    const checkboxSelectors = [
        'input[type="checkbox"][name="viewed"]',
        'input.js-reviewed-checkbox',
        'input[type="checkbox"]',
    ];
    return checkboxSelectors.some(
        (selector) => (queryNearby(fileElement, selector) as HTMLInputElement | null)?.checked,
    );
}

/**
 * Find the next unviewed file after the given element
 */
function findNextUnviewedAfter(currentFile: HTMLElement | null): HTMLElement | null {
    const files = getFiles();
    // A missing or unknown current file searches from the start: indexOf's
    // -1 plus 1 is 0
    const start = currentFile ? files.indexOf(currentFile) + 1 : 0;
    return files.slice(start).find((file) => !isViewed(file)) ?? null;
}

/**
 * Add flash animation to file element. The animation's own end (or its
 * cancellation, e.g. teardown removing the injected styles) removes the
 * class — the flash's clock is the only clock.
 */
function flashFile(fileElement: HTMLElement): void {
    const cl = fileElement.classList;
    cl.add('gh-autoscroll-flash');
    const onEnd = (event: AnimationEvent) => {
        if (event.animationName !== 'flashBorder') return;
        cl.remove('gh-autoscroll-flash');
        fileElement.removeEventListener('animationend', onEnd);
        fileElement.removeEventListener('animationcancel', onEnd);
    };
    fileElement.addEventListener('animationend', onEnd);
    fileElement.addEventListener('animationcancel', onEnd);
}

/**
 * Extract filename from file element
 */
function getFileName(fileElement: HTMLElement): string {
    // Method 1: data attributes
    const dataPath =
        fileElement.getAttribute('data-path') || fileElement.getAttribute('data-tagsearch-path');
    if (dataPath) return dataPath;

    // Method 2: Look for file path in links or spans with title attributes
    const titleEl = fileElement.querySelector('[title]');
    if (titleEl && titleEl.getAttribute('title')) {
        const title = titleEl.getAttribute('title')!;
        // Skip generic titles like "Viewed" or "Toggle diff"
        if (!title.includes('Viewed') && !title.includes('Toggle') && !title.includes('diff')) {
            return title;
        }
    }

    // Method 3: Look for filename in text content of specific selectors
    const filenameText = queryFirstText(
        [
            'a[href*="/blob/"]',
            '.file-info a',
            '[data-testid="file-header"] a',
            '.js-file-line-container a',
        ],
        fileElement,
    );
    if (filenameText) return filenameText;

    // Method 4: Look for any link that looks like a file path
    const links = fileElement.querySelectorAll('a');
    for (const link of links) {
        const text = link.textContent?.trim();
        if (text && (text.includes('/') || text.includes('.'))) {
            return text;
        }
    }

    return 'unknown file';
}

/**
 * Handle "Viewed" button click
 */
function onButtonClick(
    event: Event,
    timers: number[],
    observers: Set<MutationObserver>,
    debug: boolean,
): void {
    const button = (event.target as Element).closest('button');
    if (!button || !button.textContent?.includes('Viewed')) {
        return;
    }

    // Find the file element - try new GitHub UI first, then fall back to old structure
    let fileElement: HTMLElement | null = null;

    // Try new GitHub UI (2025+): DiffFileHeader-module__diff-file-header
    fileElement = button.closest(
        '[class*="DiffFileHeader-module__diff-file-header__"]',
    ) as HTMLElement;

    // Try old GitHub UI: Diff-module__diffHeaderWrapper
    if (!fileElement) {
        const wrapper = button.closest('[class*="Diff-module__diffHeaderWrapper--"]');
        fileElement = wrapper
            ? (wrapper.firstElementChild as HTMLElement)
            : (button.closest(
                  '[data-tagsearch-path], [data-path], .file-header, .Box-row, .file, .js-file',
              ) as HTMLElement);
    }

    if (!fileElement) {
        if (debug) {
            console.log('[GitHub AutoScroll] Could not find file element for button');
        }
        return;
    }

    // Our capture-phase handler fires before GitHub's, so this snapshot is
    // the pre-flip state. The decision below fires when GitHub's own visual
    // state (aria-pressed / viewed class) actually flips — observed, not
    // sampled after a guessed delay.
    const wasViewed = isViewed(fileElement);

    const settle = (flipped: boolean) => {
        observer.disconnect();
        observers.delete(observer);
        window.clearTimeout(giveUpTimer);

        if (!flipped) {
            if (debug) {
                console.log('[GitHub AutoScroll] Viewed state never changed');
            }
            return;
        }
        if (!isViewed(fileElement)) {
            // File was unmarked as viewed
            if (debug) {
                console.log(
                    '[GitHub AutoScroll] File unmarked as viewed:',
                    getFileName(fileElement),
                );
            }
            return;
        }

        if (debug) {
            console.log('[GitHub AutoScroll] File marked as viewed:', getFileName(fileElement));
        }

        // Find and scroll to next unviewed file
        const nextFile = findNextUnviewedAfter(fileElement);
        if (nextFile) {
            scrollElementTop(nextFile, {offsetTop: 0});
            flashFile(nextFile);
            if (debug) {
                console.log('[GitHub AutoScroll] Scrolled to:', getFileName(nextFile));
            }
        } else {
            if (debug) {
                console.log('[GitHub AutoScroll] No more unviewed files');
            }
        }
    };

    const observer = new MutationObserver(() => {
        if (isViewed(fileElement) !== wasViewed) settle(true);
    });
    observers.add(observer);
    observer.observe(fileElement.parentElement ?? fileElement, {
        attributes: true,
        subtree: true,
        attributeFilter: ['aria-pressed', 'class'],
    });
    // Give-up fallback for UIs where no observed attribute mutates (the
    // legacy checkbox flips a property, not an attribute).
    const giveUpTimer = window.setTimeout(() => settle(isViewed(fileElement) !== wasViewed), 2000);
    timers.push(giveUpTimer);
}

/**
 * Initialize autoscroll functionality
 * Returns a function to stop/cleanup, or null if no files found
 * @param debug - Enable debug console logging (default: false)
 */
export function initializeAutoScroll(debug = false): (() => void) | null {
    if (debug) {
        console.log('[GitHub AutoScroll] Initializing...');
    }

    // Check for files before attaching any listeners or styles, so a failed
    // init leaves no behavior behind
    const files = getFiles();
    if (files.length === 0) {
        if (debug) {
            console.log('[GitHub AutoScroll] No files found');
        }
        return null;
    }

    // Track pending timers and observers for cleanup
    const timers: number[] = [];
    const observers = new Set<MutationObserver>();

    // Inject CSS for flash animation (check for existing style first)
    let style = document.getElementById('gh-autoscroll-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'gh-autoscroll-styles';
        style.textContent = `
            .gh-autoscroll-flash {
                position: relative;
            }
            .gh-autoscroll-flash::after {
                content: "";
                position: absolute;
                z-index: 10;
                inset: 0;
                border: 8px solid ${FLASH_BORDER};
                pointer-events: none;
                animation: flashBorder 0.75s ease alternate 2 both;
            }
            @keyframes flashBorder {
                0% { opacity: 0; }
                100% { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    // Add click listener at document level with capture phase
    const clickHandler = (e: Event) => onButtonClick(e, timers, observers, debug);
    document.addEventListener('click', clickHandler, true);

    if (debug) {
        console.log(`[GitHub AutoScroll] Monitoring ${files.length} files`);
    }

    // Scroll to first unviewed file
    const firstUnviewed = files.find((file) => !isViewed(file));
    if (firstUnviewed) {
        const fileName = getFileName(firstUnviewed);
        if (debug) {
            console.log('[GitHub AutoScroll] Scrolling to first unviewed file:', fileName);
        }
        scrollElementTop(firstUnviewed, {offsetTop: 0});
        flashFile(firstUnviewed);
    }

    // Return cleanup function
    const stop = () => {
        if (debug) {
            console.log('[GitHub AutoScroll] Stopping...');
        }

        // Clear all pending timers and observers
        timers.forEach((timerId) => {
            clearTimeout(timerId);
        });
        timers.length = 0;
        observers.forEach((observer) => observer.disconnect());
        observers.clear();

        // Remove document-level listeners
        document.removeEventListener('click', clickHandler, true);

        // Remove CSS - use direct reference to the style element we created
        if (style && style.parentNode) {
            style.parentNode.removeChild(style);
        }

        // Remove from window
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__ghAutoScrollStop;
    };

    // Store stop function in window for manual access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__ghAutoScrollStop = stop;

    return stop;
}
