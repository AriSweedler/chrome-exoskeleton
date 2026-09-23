/**
 * The DOM model of GitHub's pull request "Files changed" view (the React
 * files view GitHub shipped in 2025). Every file diff is one region:
 *
 *   <div role="region" id="diff-<sha>">                              ← PRFile.region
 *     <div data-diff-header-wrapper style="--header-sticky-offset: 0px">
 *       <div class="DiffFileHeader-module__diff-file-header__…        ← PRFile.header
 *                   [DiffFileHeader-module__collapsed__…]">
 *         <button><svg class="octicon-chevron-down|right"/></button>  ← fold toggle
 *         <h3><a href="#diff-<sha>"><code>‎path‎</code></a></h3>
 *         <button class="MarkAsViewedButton-module__…"
 *                 aria-pressed="true|false">                          ← viewed toggle
 *       </div>
 *     </div>
 *     <div data-diff-anchor="diff-<sha>">…</div>                      ← body; GitHub drops it while collapsed
 *   </div>
 *
 * Marking a file viewed collapses it; the two states are otherwise
 * independent (a viewed file can be re-opened, an unviewed one closed).
 * Every GitHub selector the plugin knows lives in this module.
 */

/** One file diff of the pull request, identified by GitHub's own anchor id. */
export interface PRFile {
    /** The `role="region"` element holding header and body; its id is the anchor. */
    region: HTMLElement;
    header: HTMLElement;
    /** `diff-<sha>`: stable across re-renders, the key for cursor and bookkeeping. */
    anchor: string;
    path: string;
}

const REGION_SELECTOR = '[role="region"][id^="diff-"]';
const HEADER_SELECTOR = '[class*="DiffFileHeader-module__diff-file-header"]';
const HEADER_WRAPPER_SELECTOR = '[data-diff-header-wrapper]';
const COLLAPSED_HEADER_CLASS = /DiffFileHeader-module__collapsed/;
const VIEWED_BUTTON_SELECTOR = 'button[class*="MarkAsViewedButton"]';
const VIEWED_BUTTON_CLASS = /MarkAsViewedButton-module__viewed/;
const FOLD_CHEVRON_SELECTOR = 'svg.octicon-chevron-right, svg.octicon-chevron-down';
const BODY_SELECTOR = '[data-diff-anchor]';
/** GitHub wraps paths in LEFT-TO-RIGHT MARK and friends; they are not part of the path. */
const BIDI_MARKS = /[‎‏⁦-⁩]/g;

function fileFromRegion(region: HTMLElement): PRFile | null {
    const header = region.querySelector<HTMLElement>(HEADER_SELECTOR);
    if (!header) return null;
    const path = filePath(header);
    if (!path) return null;
    return {region, header, anchor: region.id, path};
}

function filePath(header: HTMLElement): string | null {
    const linkText = header.querySelector('h3 a')?.textContent?.replace(BIDI_MARKS, '').trim();
    if (linkText) return linkText;
    // The "Expand all lines" control carries the path as data; a fallback for
    // a header whose heading link is missing or mid-render.
    return header.querySelector('[data-file-path]')?.getAttribute('data-file-path') || null;
}

/** Every file diff in document order. Empty until GitHub has rendered the list. */
export function getFiles(root: Document | Element = document): PRFile[] {
    const files: PRFile[] = [];
    for (const region of root.querySelectorAll<HTMLElement>(REGION_SELECTOR)) {
        const file = fileFromRegion(region);
        if (file) files.push(file);
    }
    return files;
}

/** The file whose region carries `anchor`, or null once it has left the DOM. */
export function fileByAnchor(anchor: string): PRFile | null {
    const region = document.getElementById(anchor);
    if (!region || !region.matches(REGION_SELECTOR)) return null;
    return fileFromRegion(region);
}

/** The file whose region contains `target` (an event target, say), or null. */
export function fileContaining(target: unknown): PRFile | null {
    const element =
        target instanceof Element
            ? target
            : ((target as {parentElement?: Element | null} | null)?.parentElement ?? null);
    const region = element?.closest<HTMLElement>(REGION_SELECTOR) ?? null;
    return region ? fileFromRegion(region) : null;
}

/** Whether `element` sits inside any file diff region. */
export function isInsideFile(element: Element): boolean {
    return element.closest(REGION_SELECTOR) !== null;
}

// --- viewed ---------------------------------------------------------------

export function viewedButton(file: PRFile): HTMLButtonElement | null {
    return file.header.querySelector<HTMLButtonElement>(VIEWED_BUTTON_SELECTOR);
}

export function isViewed(file: PRFile): boolean {
    const button = viewedButton(file);
    if (!button) return false;
    return (
        button.getAttribute('aria-pressed') === 'true' || VIEWED_BUTTON_CLASS.test(button.className)
    );
}

/**
 * Click the Viewed toggle when the file is not already in the wanted state.
 * True when a click was dispatched; GitHub applies the state afterwards, so
 * `isViewed` may lag by a beat.
 */
export function setViewed(file: PRFile, viewed: boolean): boolean {
    if (isViewed(file) === viewed) return false;
    const button = viewedButton(file);
    if (!button) return false;
    button.click();
    return true;
}

// --- folded ---------------------------------------------------------------

export function foldButton(file: PRFile): HTMLButtonElement | null {
    return file.header.querySelector(FOLD_CHEVRON_SELECTOR)?.closest('button') ?? null;
}

export function isCollapsed(file: PRFile): boolean {
    if (COLLAPSED_HEADER_CLASS.test(file.header.className)) return true;
    return file.header.querySelector('svg.octicon-chevron-right') !== null;
}

/** Click the fold chevron when the file is not already in the wanted state. True when clicked. */
export function setCollapsed(file: PRFile, collapsed: boolean): boolean {
    if (isCollapsed(file) === collapsed) return false;
    const button = foldButton(file);
    if (!button) return false;
    button.click();
    return true;
}

// --- body -----------------------------------------------------------------

export function diffBody(file: PRFile): HTMLElement | null {
    return file.region.querySelector<HTMLElement>(BODY_SELECTOR);
}

/**
 * Whether the body is one of GitHub's "Load Diff" placeholders for a file it
 * hid by default and a reviewer can wave through: linguist-generated files
 * ("Some generated files are not rendered by default") and deleted files
 * ("This file was deleted."). Large diffs are also collapsed ("Large diffs
 * are not rendered by default") but deliberately excluded: they still need
 * human review. False once GitHub has dropped the body (collapsed files).
 */
export function isAutoHidden(file: PRFile): boolean {
    const text = diffBody(file)?.textContent ?? '';
    if (text.includes('This file was deleted.')) return true;
    return text.includes('not rendered by default') && !text.includes('Large diffs');
}

// --- geometry -------------------------------------------------------------

/**
 * Where GitHub pins this file's header while scrolling through its diff: the
 * `--header-sticky-offset` custom property on the header wrapper, in pixels.
 * 0 when absent.
 */
export function headerStickyOffset(file: PRFile): number {
    const wrapper = file.region.querySelector<HTMLElement>(HEADER_WRAPPER_SELECTOR);
    const raw = wrapper?.style.getPropertyValue('--header-sticky-offset').trim() ?? '';
    const px = Number.parseFloat(raw);
    return Number.isFinite(px) ? px : 0;
}
