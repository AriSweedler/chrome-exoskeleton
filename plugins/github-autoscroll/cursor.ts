import {
    type PRFile,
    fileByAnchor,
    headerStickyOffset,
    isCollapsed,
    isInsideFile,
    setCollapsed,
} from '@exo/plugins/github-autoscroll/files';
import {coverHeight, pinToTop} from '@exo/plugins/github-autoscroll/scroll';

/**
 * The review cursor: one file of the pull request is *active* — ringed in
 * light yellow, the target of the fold keys (h / l), the file
 * autoscroll pins to the top of the viewport. The active file is remembered
 * by GitHub's anchor id and re-resolved from the DOM on every use, so React
 * re-rendering the region cannot lose it.
 *
 * The ring is one overlay element on the page body, laid over the active
 * file's box. It lives outside GitHub's file wrappers on purpose: they use
 * content-visibility: auto, whose paint containment clips anything drawn
 * outside them, so a ring inside them could never glow outward.
 */

const OVERLAY_ID = 'exo-github-active-file';
/** The cursor color: a thin light-yellow line, glowing softly in and out. */
export const ACTIVE_FILE_BORDER = 'hsla(55, 100%, 65%, 0.9)';
export const ACTIVE_FILE_GLOW = 'hsla(55, 100%, 70%, 0.45)';
/** Space kept between sticky page chrome and the pinned header, so the ring stays visible. */
const PIN_GAP = 6;
const TOAST_CONTAINER_ID = 'exo-notification-container';

let activeAnchor: string | null = null;
let cancelPin: (() => void) | null = null;
let overlay: HTMLElement | null = null;
let resizeObserver: InstanceType<typeof window.ResizeObserver> | null = null;

export function getActiveAnchor(): string | null {
    return activeAnchor;
}

/** The active file, re-resolved from the DOM; null when none is set or it has left the page. */
export function getActiveFile(): PRFile | null {
    return activeAnchor === null ? null : fileByAnchor(activeAnchor);
}

export function setActiveFile(file: PRFile | null): void {
    activeAnchor = file?.anchor ?? null;
    paint();
}

/** Drop the cursor and any pin still settling on it. */
export function clearActiveFile(): void {
    cancelPin?.();
    cancelPin = null;
    setActiveFile(null);
}

/** Elements that are page chrome to no one: other files' stuck headers, our own toasts and ring. */
function isNotCover(element: Element): boolean {
    return (
        isInsideFile(element) ||
        element.id === OVERLAY_ID ||
        element.closest(`#${TOAST_CONTAINER_ID}`) !== null
    );
}

function paint(): void {
    const file = getActiveFile();
    if (!file) {
        overlay?.remove();
        overlay = null;
        resizeObserver?.disconnect();
        resizeObserver = null;
        window.removeEventListener('resize', place);
        return;
    }
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.style.cssText =
            'position: absolute; box-sizing: border-box; pointer-events: none; z-index: 3; ' +
            `border-radius: 6px; border: 1px solid ${ACTIVE_FILE_BORDER}; ` +
            `box-shadow: 0 0 14px 3px ${ACTIVE_FILE_GLOW}, inset 0 0 10px ${ACTIVE_FILE_GLOW}; ` +
            'transition: top 120ms ease-out, height 120ms ease-out;';
        document.body.appendChild(overlay);
        window.addEventListener('resize', place);
    }
    // Whatever moves the file moves the ring: its own height (a diff rendering
    // lazily, a fold) and the document's (a neighbor collapsing, a panel).
    resizeObserver?.disconnect();
    if (typeof window.ResizeObserver === 'function') {
        resizeObserver = new window.ResizeObserver(() => place());
        resizeObserver.observe(document.body);
        resizeObserver.observe(file.region);
    }
    place();
}

/** Lay the ring over the active file's box, in document coordinates (it scrolls with the page). */
function place(): void {
    const file = getActiveFile();
    if (!file || !overlay) return;
    const rect = file.region.getBoundingClientRect();
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
}

/**
 * The viewport line a file must reach to count as the one being looked at:
 * just below the sticky chrome, where a pinned header sits. `reference`
 * fixes the column the chrome is measured in.
 */
export function readingLine(reference: HTMLElement): number {
    return coverHeight(reference, {ignoreCover: isNotCover}) + PIN_GAP + 1;
}

/**
 * Scroll the active file's header to the top of the viewport, below any
 * sticky chrome, and hold it there while the layout settles. False when
 * there is no active file.
 */
export function pinActiveFile(): boolean {
    const file = getActiveFile();
    if (!file) return false;
    cancelPin?.();
    cancelPin = pinToTop(file.region, {
        gap: PIN_GAP,
        minCover: headerStickyOffset(file),
        ignoreCover: isNotCover,
    });
    return true;
}

export type FoldAction = 'open' | 'close' | 'toggle';
export type FoldOutcome = 'opened' | 'closed' | 'unchanged' | 'no-active-file' | 'no-fold-control';

/**
 * Fold the active file via GitHub's chevron (h closes, l opens), then pin it
 * back to the top so a fold never leaves the viewport somewhere else. An
 * already-open `l` (or already-closed `h`) still pins: it is the way to
 * bring the cursor back into view.
 */
export function foldActiveFile(action: FoldAction): FoldOutcome {
    const file = getActiveFile();
    if (!file) return 'no-active-file';
    const collapse = action === 'toggle' ? !isCollapsed(file) : action === 'close';
    if (isCollapsed(file) === collapse) {
        pinActiveFile();
        return 'unchanged';
    }
    if (!setCollapsed(file, collapse)) return 'no-fold-control';
    pinActiveFile();
    return collapse ? 'closed' : 'opened';
}
