import {type PRFile, fileByAnchor, getFiles, isViewed} from '@exo/plugins/github-autoscroll/files';
import {nextFrame} from '@exo/plugins/github-autoscroll/frame';
import {
    clearActiveFile,
    getActiveAnchor,
    pinActiveFile,
    readingLine,
    setActiveFile,
} from '@exo/plugins/github-autoscroll/cursor';

/**
 * Autoscroll: when a file is marked Viewed, the cursor moves to the next
 * unviewed file and pins it to the top of the viewport.
 *
 * Flips are detected by state, not by click: after any DOM mutation the
 * engine re-reads every file's viewed state and compares it with the last
 * reading. That catches a click, GitHub's keyboard shortcut, an attribute
 * flip and a full re-render alike, and stays quiet for a file GitHub renders
 * late in an already-viewed state (server truth, not a click). Programmatic
 * marks (the `d` sweep) announce themselves through ignoreNextViewedFlip.
 *
 * Between flips the cursor follows the reader: on every scroll it moves to
 * the file under the reading line, so the ring always marks the file being
 * looked at.
 */

export type AdvanceOutcome = {kind: 'moved'; file: PRFile; wrapped: boolean} | {kind: 'all-viewed'};

export interface AutoscrollOptions {
    /** Told each time a viewed flip moved (or failed to move) the cursor. */
    onAdvance?: (outcome: AdvanceOutcome) => void;
}

interface Session {
    observer: MutationObserver;
    /** Viewed state per anchor as of the last tick. */
    known: Map<string, boolean>;
    /** Anchors whose next unviewed→viewed flip is programmatic, with expiry. */
    ignored: Map<string, number>;
    cancelTick: (() => void) | null;
    cancelFollow: (() => void) | null;
    onScroll: () => void;
    onAdvance: ((outcome: AdvanceOutcome) => void) | undefined;
}

let session: Session | null = null;

/** How long a programmatic-flip notice waits for its flip before it lapses. */
const IGNORE_TTL_MS = 10_000;

export function isRunning(): boolean {
    return session !== null;
}

/**
 * Start watching. False when the page has no file diffs yet (nothing to do,
 * nothing left behind). Places the cursor: on the file the URL targets
 * (`#diff-…`, GitHub's own scroll — the viewport is left alone), else on the
 * first unviewed file, pinned to the top.
 */
export function start(options: AutoscrollOptions = {}): boolean {
    if (session) return true;
    const files = getFiles();
    if (files.length === 0) return false;

    const current: Session = {
        observer: new MutationObserver(() => scheduleTick(current)),
        known: new Map(files.map((file) => [file.anchor, isViewed(file)])),
        ignored: new Map(),
        cancelTick: null,
        cancelFollow: null,
        onScroll: () => {
            // One reading per frame, however many scroll events arrive.
            if (current.cancelFollow) return;
            current.cancelFollow = nextFrame(() => {
                current.cancelFollow = null;
                followViewport();
            });
        },
        onAdvance: options.onAdvance,
    };
    current.observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-pressed', 'class'],
    });
    window.addEventListener('scroll', current.onScroll, {passive: true});
    session = current;

    placeInitialCursor(files);
    return true;
}

function placeInitialCursor(files: PRFile[]): void {
    const hash = window.location.hash;
    const targeted =
        typeof hash === 'string' && hash.length > 1 ? fileByAnchor(hash.slice(1)) : null;
    if (targeted) {
        setActiveFile(targeted);
        return;
    }
    const first = files.find((file) => !isViewed(file));
    if (!first) return;
    setActiveFile(first);
    pinActiveFile();
}

/** Stop watching and drop the cursor. Idempotent. */
export function stop(): void {
    if (!session) return;
    session.observer.disconnect();
    session.cancelTick?.();
    session.cancelFollow?.();
    window.removeEventListener('scroll', session.onScroll);
    session = null;
    clearActiveFile();
}

/**
 * Move the cursor to the file under the reading line — the first file whose
 * bottom edge is below it, or the last file when the page is scrolled past
 * them all. Returns that file (null on a page without files).
 */
export function followViewport(): PRFile | null {
    const files = getFiles();
    const first = files[0];
    if (!first) return null;
    const line = readingLine(first.region);
    const target =
        files.find((file) => file.region.getBoundingClientRect().bottom > line) ??
        files[files.length - 1]!;
    if (target.anchor !== getActiveAnchor()) setActiveFile(target);
    return target;
}

/**
 * The next time each of these files flips to viewed, it is not the reviewer
 * doing it: do not move the cursor. For the `d` sweep.
 */
export function ignoreNextViewedFlip(anchors: Iterable<string>): void {
    if (!session) return;
    const expires = Date.now() + IGNORE_TTL_MS;
    for (const anchor of anchors) session.ignored.set(anchor, expires);
}

function scheduleTick(current: Session): void {
    // Mutations arrive in bursts; one reading per frame is plenty.
    if (current.cancelTick) return;
    current.cancelTick = nextFrame(() => {
        current.cancelTick = null;
        tick(current);
    });
}

function tick(current: Session): void {
    let flipped: PRFile | null = null;
    for (const file of getFiles()) {
        const viewed = isViewed(file);
        const before = current.known.get(file.anchor);
        current.known.set(file.anchor, viewed);
        // Only a file we knew as unviewed counts as flipped.
        if (before !== false || !viewed) continue;
        if (consumeIgnore(current, file.anchor)) continue;
        flipped = file; // in a batch, the last flip in document order leads
    }
    if (!flipped) return;
    // Advance first, tell second: the move must not hinge on a listener.
    const outcome = advanceFrom(flipped);
    current.onAdvance?.(outcome);
}

function consumeIgnore(current: Session, anchor: string): boolean {
    const expires = current.ignored.get(anchor);
    if (expires === undefined) return false;
    current.ignored.delete(anchor);
    return expires > Date.now();
}

/**
 * Move the cursor to the first unviewed file after `file` (from the top when
 * null), wrapping around to the files above when none is left below, and pin
 * it. Clears the cursor when every file is viewed.
 */
export function advanceFrom(file: PRFile | null): AdvanceOutcome {
    return moveCursor(file, 'next');
}

/**
 * Step the cursor to the next or previous unviewed file relative to `file`
 * (the active file when null: J / K), wrapping at either end, and pin it.
 * Clears the cursor when every file is viewed.
 */
export function moveCursor(file: PRFile | null, direction: 'next' | 'previous'): AdvanceOutcome {
    const files = getFiles();
    const unviewed = (candidates: PRFile[]) => candidates.filter((c) => !isViewed(c));
    const index = file ? files.findIndex((candidate) => candidate.anchor === file.anchor) : -1;
    let ahead: PRFile[];
    let behind: PRFile[];
    if (direction === 'next') {
        ahead = unviewed(files.slice(index + 1));
        behind = unviewed(files.slice(0, index + 1));
    } else {
        ahead = unviewed(index < 0 ? files : files.slice(0, index)).reverse();
        behind = unviewed(index < 0 ? [] : files.slice(index)).reverse();
    }
    const target = ahead[0] ?? behind[0];
    if (!target) {
        clearActiveFile();
        return {kind: 'all-viewed'};
    }
    setActiveFile(target);
    pinActiveFile();
    return {kind: 'moved', file: target, wrapped: ahead.length === 0};
}
