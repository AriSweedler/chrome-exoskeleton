import {nextFrame} from '@exo/plugins/github-autoscroll/frame';

/**
 * Page scrolling for GitHub. The page-wide jumps (gg / G) may glide; every
 * scroll aimed at a file is instant. GitHub's files view renders diffs
 * lazily (content-visibility: auto) and collapses a file a beat after it is
 * marked viewed, so a scroll animated toward a position measured once lands
 * wrong — the "click Viewed three times to get it right" symptom. pinToTop
 * jumps instead, then holds the file there, re-pinning after every layout
 * shift until the reader takes the wheel.
 */

/** Bypasses a page's `scroll-behavior: smooth`, which 'auto' would inherit. */
const INSTANT: ScrollBehavior = 'instant';

export function scrollToPageTop(behavior: ScrollBehavior = 'smooth'): void {
    window.scrollTo({top: 0, behavior});
}

export function scrollToPageBottom(behavior: ScrollBehavior = 'smooth'): void {
    window.scrollTo({top: document.documentElement.scrollHeight, behavior});
}

/**
 * Scroll down by most of a viewport (a little overlap for continuity).
 * Instant: under key auto-repeat each press must land before the next fires.
 */
export function scrollPageDown(): void {
    window.scrollBy({top: Math.round(window.innerHeight * 0.9), behavior: INSTANT});
}

/** A fifth of a viewport: the j / k step, small enough to read by, fast enough to hold. */
export const SCROLL_STEP_RATIO = 0.2;

/** Scroll a step down (+1) or up (-1), instantly, for j / k under auto-repeat. */
export function scrollStep(direction: 1 | -1): void {
    window.scrollBy({
        top: direction * Math.round(window.innerHeight * SCROLL_STEP_RATIO),
        behavior: INSTANT,
    });
}

export interface CoverOptions {
    /** A cover height the caller knows of (GitHub's --header-sticky-offset). */
    minCover?: number;
    /** Elements never counted as cover: the target's siblings' sticky headers, toasts. */
    ignoreCover?: (element: Element) => boolean;
}

/** Sticky or fixed elements under the point (x, y) in the viewport that are not `target`'s own. */
function chromeAt(target: HTMLElement, y: number, ignoreCover?: (element: Element) => boolean) {
    if (typeof document.elementsFromPoint !== 'function') return [];
    const rect = target.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
    const found: Array<{top: number; bottom: number; offset: number; stuck: boolean}> = [];
    for (const element of document.elementsFromPoint(x, y)) {
        if (element === target || target.contains(element) || element.contains(target)) continue;
        if (ignoreCover?.(element)) continue;
        const style = window.getComputedStyle(element);
        if (style.position !== 'sticky' && style.position !== 'fixed') continue;
        const box = element.getBoundingClientRect();
        // A sticky element is stuck once it sits at its `top` offset; until
        // then it is ordinary flow, moving with the page.
        const parsed = Number.parseFloat(style.top);
        const offset = Number.isFinite(parsed) ? parsed : 0;
        const stuck = style.position === 'fixed' || box.top <= offset + 0.5;
        found.push({top: box.top, bottom: box.bottom, offset, stuck});
    }
    return found;
}

/**
 * How much of the top of the viewport is covered by sticky or fixed chrome
 * (a stuck toolbar, a fixed header) in `target`'s column right now, in
 * pixels from the top. Measured, not configured: whatever is stuck at the
 * top pixel above the target's horizontal center counts, except the target
 * itself, its ancestors and anything `ignoreCover` rules out.
 */
export function coverHeight(target: HTMLElement, options: CoverOptions = {}): number {
    const {minCover = 0, ignoreCover} = options;
    let cover = minCover;
    for (const {bottom} of chromeAt(target, 1, ignoreCover)) cover = Math.max(cover, bottom);
    return cover;
}

/**
 * Where `target`'s top edge should sit: `gap` below the chrome stuck at the
 * top of the viewport — and no higher than a sticky element sitting right
 * over it in normal flow will allow once it sticks. That second rule is the
 * first file under a sticky toolbar: pinned just below it, the toolbar is
 * not stuck yet, so the top edge alone reports no cover; pulling the header
 * up would push the toolbar into stuck position over it, and the two
 * readings would chase each other every frame. The resting place is the
 * toolbar's stick offset plus its height plus the larger of the layout
 * distance and the gap.
 */
export function restingTop(target: HTMLElement, gap: number, options: CoverOptions = {}): number {
    let wanted = coverHeight(target, options) + gap;
    const top = target.getBoundingClientRect().top;
    for (const chrome of chromeAt(target, top - 1, options.ignoreCover)) {
        if (chrome.stuck) {
            wanted = Math.max(wanted, chrome.bottom + gap);
            continue;
        }
        const height = chrome.bottom - chrome.top;
        const distance = Math.max(0, top - chrome.bottom);
        wanted = Math.max(wanted, chrome.offset + height + Math.max(distance, gap));
    }
    return wanted;
}

export interface PinOptions extends CoverOptions {
    /** Pixels left between the cover and the element's top edge. */
    gap?: number;
    /**
     * How long after the jump to re-measure every frame, for shifts that
     * resize nothing (chrome becoming stuck). Layout shifts are corrected for
     * as long as the pin holds, not only within this window.
     */
    settleMs?: number;
}

export const DEFAULT_SETTLE_MS = 1000;

/** Input that means the user took the wheel: a pin in progress must let go. */
const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'mousedown', 'keydown'] as const;

/**
 * What to pin: an element, or a resolver that finds it afresh on every
 * reading, for a target the page re-renders (GitHub replaces a file's region
 * when its diff arrives). A resolver returning null means "not on the page
 * right now": the pin waits for it to come back. A plain element that leaves
 * the DOM ends the pin.
 */
export type PinTarget = HTMLElement | (() => HTMLElement | null);

/**
 * Put the target's top edge just below whatever covers the top of the
 * viewport, instantly, and hold it there until the reader takes the wheel.
 *
 * The layout keeps shifting under a pinned file long after the jump: diffs
 * above it render lazily, a neighbor collapses a beat after it is marked
 * viewed, a file scrolled far away swaps its rendered height for a
 * placeholder. Every shift above the target drags it up or down the
 * viewport, and a pin that held for a fixed second left the later shifts
 * uncorrected — the file's first lines ended up hidden under the sticky
 * chrome. So the hold has no clock: a ResizeObserver on the target and each
 * of its ancestors (a shift above changes some ancestor's height) re-pins
 * after every layout change, and a frame loop covers the first `settleMs`
 * for the shifts that resize nothing, like chrome becoming stuck.
 *
 * The pin lets go the moment the user scrolls, clicks or types, on a scroll
 * it did not make itself (the page scrolling to a hash target, a scrollbar
 * drag, the browser's own anchoring), and when a plain element target leaves
 * the DOM. Returns a canceller.
 */
export function pinToTop(target: PinTarget, options: PinOptions = {}): () => void {
    const {gap = 0, settleMs = DEFAULT_SETTLE_MS} = options;
    const resolve = typeof target === 'function' ? target : () => target;
    const started = Date.now();
    let done = false;
    let cancelFrame: (() => void) | null = null;
    let observer: InstanceType<typeof window.ResizeObserver> | null = null;
    let observed: HTMLElement | null = null;
    /** Where the pin last left the page; a different reading is someone else's scroll. */
    let expectedY = window.scrollY;

    const stop = (): void => {
        if (done) return;
        done = true;
        cancelFrame?.();
        observer?.disconnect();
        for (const type of USER_INPUT_EVENTS) window.removeEventListener(type, stop, true);
        window.removeEventListener('scroll', onScroll);
    };

    const onScroll = (): void => {
        if (Math.abs(window.scrollY - expectedY) > 1) stop();
    };

    /** Watch the target and every ancestor: a shift above it changes some ancestor's height. */
    const watch = (element: HTMLElement): void => {
        if (element === observed || typeof window.ResizeObserver !== 'function') return;
        observed = element;
        observer?.disconnect();
        observer = new window.ResizeObserver(() => correct());
        for (let node: HTMLElement | null = element; node; node = node.parentElement) {
            observer.observe(node);
        }
    };

    const correct = (): void => {
        if (done) return;
        const element = resolve();
        if (!element || !element.isConnected) {
            // A plain element that left the DOM is gone for good; a resolver's
            // target is mid re-render and will be back.
            if (typeof target !== 'function') stop();
            return;
        }
        watch(element);
        const wanted = restingTop(element, gap, options);
        const delta = element.getBoundingClientRect().top - wanted;
        if (Math.abs(delta) > 1) {
            window.scrollBy({top: delta, behavior: INSTANT});
            expectedY = window.scrollY;
        }
    };

    const settle = (): void => {
        cancelFrame = null;
        if (done) return;
        correct();
        if (done || Date.now() - started >= settleMs) return;
        cancelFrame = nextFrame(settle);
    };

    for (const type of USER_INPUT_EVENTS) {
        window.addEventListener(type, stop, {capture: true, passive: true});
    }
    window.addEventListener('scroll', onScroll, {passive: true});
    settle();
    return stop;
}
