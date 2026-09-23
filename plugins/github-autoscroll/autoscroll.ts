import {
    type PRFile,
    fileByAnchor,
    fileContaining,
    getFiles,
    isViewed,
} from '@exo/plugins/github-autoscroll/files';
import {nextFrame} from '@exo/plugins/github-autoscroll/frame';
import {clearActiveFile, pinActiveFile, setActiveFile} from '@exo/plugins/github-autoscroll/cursor';

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
    onClick: (event: Event) => void;
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
        onClick: (event) => {
            // A click anywhere in a file makes it the active one.
            const file = fileContaining(event.target);
            if (file) setActiveFile(file);
        },
        onAdvance: options.onAdvance,
    };
    current.observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-pressed', 'class'],
    });
    document.addEventListener('click', current.onClick, true);
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
    document.removeEventListener('click', session.onClick, true);
    session = null;
    clearActiveFile();
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
    if (flipped) current.onAdvance?.(advanceFrom(flipped));
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
    const files = getFiles();
    const start = file ? files.findIndex((candidate) => candidate.anchor === file.anchor) + 1 : 0;
    const below = files.slice(start).find((candidate) => !isViewed(candidate));
    const next = below ?? files.slice(0, start).find((candidate) => !isViewed(candidate));
    if (!next) {
        clearActiveFile();
        return {kind: 'all-viewed'};
    }
    setActiveFile(next);
    pinActiveFile();
    return {kind: 'moved', file: next, wrapped: below === undefined};
}
