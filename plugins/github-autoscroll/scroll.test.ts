import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {
    DEFAULT_SETTLE_MS,
    coverHeight,
    pinToTop,
    restingTop,
    scrollPageDown,
    scrollToPageBottom,
    scrollToPageTop,
} from '@exo/plugins/github-autoscroll/scroll';

/** A box whose top edge the test controls; `top` moves it as if the layout shifted. */
type Rect = ReturnType<HTMLElement['getBoundingClientRect']>;
const rect = (partial: Partial<Rect>): Rect => partial as Rect;

function box(top: number): HTMLElement & {top: number} {
    const el = document.createElement('div') as unknown as HTMLElement & {top: number};
    el.top = top;
    el.getBoundingClientRect = () =>
        rect({top: el.top, bottom: el.top + 100, left: 100, right: 500, width: 400, height: 100});
    document.body.appendChild(el);
    return el;
}

describe('page scrolling', () => {
    beforeEach(() => {
        window.scrollTo = vi.fn();
        window.scrollBy = vi.fn();
    });

    it('gg / G glide to the page ends', () => {
        scrollToPageTop();
        expect(window.scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'smooth'});
        scrollToPageBottom();
        expect(window.scrollTo).toHaveBeenCalledWith({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth',
        });
    });

    it('scrollPageDown jumps most of a viewport, instantly', () => {
        Object.defineProperty(window, 'innerHeight', {value: 1000, configurable: true});
        scrollPageDown();
        expect(window.scrollBy).toHaveBeenCalledWith({top: 900, behavior: 'instant'});
    });
});

describe('coverHeight', () => {
    const target = () => box(300);

    afterEach(() => {
        document.body.innerHTML = '';
        // @ts-expect-error jsdom has no elementsFromPoint; tests install and remove one
        delete document.elementsFromPoint;
    });

    it('is the caller-known minimum when the browser cannot report what is under a point', () => {
        expect(coverHeight(target())).toBe(0);
        expect(coverHeight(target(), {minCover: 48})).toBe(48);
    });

    it('measures the bottom edge of sticky and fixed elements at the top pixel, skipping the rest', () => {
        const stuckToolbar = box(0);
        stuckToolbar.style.position = 'sticky';
        stuckToolbar.getBoundingClientRect = () => rect({top: 0, bottom: 56});
        const fixedBanner = box(0);
        fixedBanner.style.position = 'fixed';
        fixedBanner.getBoundingClientRect = () => rect({top: 0, bottom: 24});
        const staticWrapper = box(0);
        staticWrapper.getBoundingClientRect = () => rect({top: 0, bottom: 5000});
        const t = target();
        document.elementsFromPoint = () => [
            fixedBanner,
            stuckToolbar,
            staticWrapper,
            document.body,
        ];

        expect(coverHeight(t)).toBe(56);
        expect(coverHeight(t, {minCover: 80})).toBe(80);
        expect(coverHeight(t, {ignoreCover: (el) => el === stuckToolbar})).toBe(24);
    });

    it('never counts the target, its own children or its ancestors as cover', () => {
        const t = target();
        const ownStickyHeader = document.createElement('div');
        ownStickyHeader.style.position = 'sticky';
        ownStickyHeader.getBoundingClientRect = () => rect({top: 0, bottom: 42});
        t.appendChild(ownStickyHeader);
        document.body.style.position = 'sticky';
        document.elementsFromPoint = () => [ownStickyHeader, t, document.body];

        expect(coverHeight(t)).toBe(0);
        document.body.style.position = '';
    });
});

describe('restingTop', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        // @ts-expect-error jsdom has no elementsFromPoint; tests install and remove one
        delete document.elementsFromPoint;
    });

    /** A sticky toolbar of height 48 whose top edge is at `top` (stuck once at 0). */
    function toolbar(top: number): HTMLElement {
        const bar = box(top);
        bar.style.position = 'sticky';
        bar.style.top = '0px';
        bar.getBoundingClientRect = () => rect({top, bottom: top + 48});
        return bar;
    }

    it('rests a gap below chrome that is stuck at the top', () => {
        const bar = toolbar(0);
        const target = box(6);
        document.elementsFromPoint = () => [bar, document.body];
        expect(restingTop(target, 6)).toBe(54);
    });

    it('rests where a sticky element in flow right above it will sit once stuck — no chase', () => {
        const bar = toolbar(6); // in flow: its top is below its sticky offset
        const target = box(54);
        document.elementsFromPoint = (_x: number, y: number) =>
            y < 6 ? [document.body] : [bar, document.body];
        // The top edge reports no cover (6 would be wanted); the toolbar right
        // above the header rules: offset 0 + height 48 + gap 6 = 54, exactly
        // where it is. Nothing to correct.
        expect(restingTop(target, 6)).toBe(54);
    });

    it('from the top of the page, the same rule still asks for the scroll', () => {
        const bar = toolbar(380); // far down the page, header right under it
        const target = box(428);
        document.elementsFromPoint = (_x: number, y: number) =>
            y < 380 ? [document.body] : [bar, document.body];
        expect(restingTop(target, 6)).toBe(54);
    });

    it('a layout gap below an in-flow sticky element leaves only the top-edge reading', () => {
        const bar = toolbar(6);
        const target = box(70); // 16 px of layout gap below the toolbar
        document.elementsFromPoint = (_x: number, y: number) =>
            y >= 6 && y < 54 ? [bar, document.body] : [document.body];
        expect(restingTop(target, 6)).toBe(6);
    });

    it('ignores a neighbor that is not sticky, and honors minCover', () => {
        const neighbor = box(30);
        const target = box(54);
        document.elementsFromPoint = () => [neighbor, document.body];
        expect(restingTop(target, 6)).toBe(6);
        expect(restingTop(target, 6, {minCover: 40})).toBe(46);
    });
});

/** A stand-in ResizeObserver: tests fire it to say "the layout changed". */
class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observed = new Set<Element>();
    disconnected = false;
    constructor(private readonly callback: () => void) {
        FakeResizeObserver.instances.push(this);
    }
    observe(element: Element): void {
        this.observed.add(element);
    }
    unobserve(element: Element): void {
        this.observed.delete(element);
    }
    disconnect(): void {
        this.disconnected = true;
        this.observed.clear();
    }
    fire(): void {
        if (!this.disconnected) this.callback();
    }
}
const layoutChanged = () => FakeResizeObserver.instances.forEach((observer) => observer.fire());

describe('pinToTop', () => {
    const scrollByCalls = () => (window.scrollBy as ReturnType<typeof vi.fn>).mock.calls.length;

    beforeEach(() => {
        vi.useFakeTimers({
            toFake: [
                'setTimeout',
                'clearTimeout',
                'Date',
                'requestAnimationFrame',
                'cancelAnimationFrame',
            ],
        });
        FakeResizeObserver.instances = [];
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
        window.scrollBy = vi.fn((options?: {top?: number} | number) => {
            // Emulate the scroll: every box moves up by the delta.
            const delta = typeof options === 'number' ? options : (options?.top ?? 0);
            for (const el of document.querySelectorAll<HTMLElement & {top: number}>('div')) {
                if ('top' in el) el.top -= delta;
            }
        }) as unknown as typeof window.scrollBy;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
        Object.defineProperty(window, 'scrollY', {value: 0, configurable: true, writable: true});
        document.body.innerHTML = '';
    });

    it('jumps the element to the top at once, instantly', () => {
        const el = box(700);
        const cancel = pinToTop(el);
        expect(window.scrollBy).toHaveBeenCalledWith({top: 700, behavior: 'instant'});
        expect(el.top).toBe(0);
        cancel();
    });

    it('leaves a gap under the cover it is given', () => {
        const el = box(700);
        const cancel = pinToTop(el, {gap: 6, minCover: 48});
        expect(el.top).toBe(54);
        cancel();
    });

    it('corrects drift every frame while settling', () => {
        const el = box(700);
        pinToTop(el);
        expect(el.top).toBe(0);
        el.top = 240; // something above it collapsed a beat later
        vi.advanceTimersByTime(20);
        expect(el.top).toBe(0);
    });

    it('after the settle window, holds on: a layout change re-pins, a bare shift waits for one', () => {
        const el = box(700);
        pinToTop(el);
        vi.advanceTimersByTime(DEFAULT_SETTLE_MS + 50);
        const calls = scrollByCalls();
        el.top = 240;
        vi.advanceTimersByTime(200);
        expect(scrollByCalls()).toBe(calls); // the frame loop is over
        expect(el.top).toBe(240);
        layoutChanged(); // ...but a resize anywhere above still re-pins
        expect(el.top).toBe(0);
    });

    it('watches the element and each of its ancestors, so a shift above it is seen', () => {
        const wrapper = document.createElement('section');
        document.body.appendChild(wrapper);
        const el = box(700);
        wrapper.appendChild(el);
        pinToTop(el);
        const [observer] = FakeResizeObserver.instances;
        expect(observer!.observed).toEqual(
            new Set([el, wrapper, document.body, document.documentElement]),
        );
    });

    it('follows a resolver through a re-render, waiting while its target is gone', () => {
        const first = box(700);
        let current: HTMLElement | null = first;
        pinToTop(() => current);
        expect(first.top).toBe(0);

        current = null; // mid re-render
        layoutChanged();
        vi.advanceTimersByTime(50);
        const second = box(300);
        current = second; // the re-rendered region
        layoutChanged();
        expect(second.top).toBe(0);
        const latest = FakeResizeObserver.instances[FakeResizeObserver.instances.length - 1]!;
        expect(latest.observed.has(second)).toBe(true);
    });

    it('ends when a plain element leaves the DOM', () => {
        const gone = box(700);
        pinToTop(gone);
        gone.remove();
        gone.top = 300;
        vi.advanceTimersByTime(100);
        layoutChanged();
        expect(gone.top).toBe(300);
        expect(FakeResizeObserver.instances[0]!.disconnected).toBe(true);
    });

    it('ignores sub-pixel differences', () => {
        const el = box(0.5);
        pinToTop(el);
        expect(window.scrollBy).not.toHaveBeenCalled();
    });

    it('lets go for good when the user scrolls, clicks or types', () => {
        const el = box(700);
        pinToTop(el);
        window.dispatchEvent(new Event('wheel'));
        el.top = 300;
        vi.advanceTimersByTime(100);
        layoutChanged();
        expect(el.top).toBe(300);
        expect(FakeResizeObserver.instances[0]!.disconnected).toBe(true);
    });

    it('lets go on a scroll it did not make; its own scrolls do not count', () => {
        const el = box(700);
        pinToTop(el);
        // The page reports the position the pin left it at: still holding.
        window.dispatchEvent(new Event('scroll'));
        el.top = 240;
        vi.advanceTimersByTime(20);
        expect(el.top).toBe(0);
        // Someone else moved the page.
        Object.defineProperty(window, 'scrollY', {value: 500, configurable: true});
        window.dispatchEvent(new Event('scroll'));
        el.top = 240;
        vi.advanceTimersByTime(100);
        layoutChanged();
        expect(el.top).toBe(240);
    });

    it('lets go when cancelled', () => {
        const el = box(700);
        const cancel = pinToTop(el);
        cancel();
        el.top = 300;
        vi.advanceTimersByTime(100);
        layoutChanged();
        expect(el.top).toBe(300);
    });
});
