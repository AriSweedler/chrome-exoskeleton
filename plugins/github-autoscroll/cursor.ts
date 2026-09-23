import {
    type PRFile,
    fileByAnchor,
    headerStickyOffset,
    isCollapsed,
    isInsideFile,
    setCollapsed,
} from '@exo/plugins/github-autoscroll/files';
import {pinToTop} from '@exo/plugins/github-autoscroll/scroll';

/**
 * The review cursor: one file of the pull request is *active* — ringed in
 * light yellow, the target of the fold keys (za / zc / zo), the file
 * autoscroll pins to the top of the viewport. The active file is remembered
 * by GitHub's anchor id, and painted through one CSS rule on that id: a rule
 * survives React re-rendering the region, a class we add to it would not.
 */

const STYLE_ID = 'exo-github-active-file';
/** The cursor color. */
export const ACTIVE_FILE_BORDER = 'hsla(55, 100%, 78%, 1)';
/** Space kept between sticky page chrome and the pinned header, so the ring stays visible. */
const PIN_GAP = 6;
const TOAST_CONTAINER_ID = 'exo-notification-container';

let activeAnchor: string | null = null;
let cancelPin: (() => void) | null = null;

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

function paint(): void {
    let style = document.getElementById(STYLE_ID);
    if (activeAnchor === null) {
        style?.remove();
        return;
    }
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
    }
    style.textContent =
        `[id="${activeAnchor}"] { outline: 3px solid ${ACTIVE_FILE_BORDER}; ` +
        `outline-offset: 2px; }`;
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
        // Other files' stuck headers and our own toasts are not page chrome.
        ignoreCover: (element) =>
            isInsideFile(element) || element.closest(`#${TOAST_CONTAINER_ID}`) !== null,
    });
    return true;
}

export type FoldAction = 'open' | 'close' | 'toggle';
export type FoldOutcome = 'opened' | 'closed' | 'unchanged' | 'no-active-file' | 'no-fold-control';

/**
 * Fold the active file via GitHub's chevron (vim: zo / zc / za), then pin it
 * back to the top so a fold never leaves the viewport somewhere else. An
 * already-open `zo` (or already-closed `zc`) still pins: it is the way to
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
