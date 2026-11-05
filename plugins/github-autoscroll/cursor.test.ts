import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {
    clearActiveFile,
    foldActiveFile,
    getActiveAnchor,
    getActiveFile,
    pinActiveFile,
    setActiveFile,
} from '@exo/plugins/github-autoscroll/cursor';
import {getFiles, isCollapsed} from '@exo/plugins/github-autoscroll/files';
import * as scroll from '@exo/plugins/github-autoscroll/scroll';
import {
    anchorFor,
    installGitHubBehavior,
    renderFilesList,
} from '@exo/plugins/github-autoscroll/test-dom';

type Rect = ReturnType<HTMLElement['getBoundingClientRect']>;
const rect = (partial: Partial<Rect>): Rect => partial as Rect;

const ring = () => document.getElementById('exo-github-active-file');

describe('the active file', () => {
    let uninstall: () => void;

    beforeEach(() => {
        document.body.innerHTML = renderFilesList([
            {path: 'a.ts'},
            {path: 'b.ts', collapsed: true},
            {path: 'c.ts'},
        ]);
        uninstall = installGitHubBehavior(document);
        vi.spyOn(scroll, 'pinToTop').mockReturnValue(() => {});
    });

    afterEach(() => {
        clearActiveFile();
        uninstall();
        document.body.innerHTML = '';
    });

    it('is painted as one overlay beside the file, laid over it, glowing in and out', () => {
        expect(ring()).toBeNull();
        const [a] = getFiles();
        a.region.getBoundingClientRect = () => rect({top: 100, left: 20, width: 600, height: 300});
        setActiveFile(a);
        expect(getActiveAnchor()).toBe(anchorFor('a.ts'));
        expect(getActiveFile()?.path).toBe('a.ts');
        const el = ring()!;
        expect(el.parentElement).toBe(a.region.parentElement);
        expect(el.style.position).toBe('absolute');
        expect(el.style.pointerEvents).toBe('none');
        expect(el.style.borderWidth).toBe('1px');
        expect(el.style.borderStyle).toBe('solid');
        expect(el.style.borderColor).toBe('rgba(255, 240, 77, 0.9)'); // hsla(55, 100%, 65%, 0.9)
        expect(el.style.boxShadow).toContain('inset');
        expect(el.style.boxShadow.indexOf('inset')).toBeGreaterThan(0); // an outer glow comes first
        expect({
            top: el.style.top,
            left: el.style.left,
            width: el.style.width,
            height: el.style.height,
        }).toEqual({top: '100px', left: '20px', width: '600px', height: '300px'});
    });

    it('sits outside the outermost paint-contained wrapper, inside the page layout, not on the body', () => {
        const [a] = getFiles();
        const lazy = document.createElement('div');
        const outer = document.createElement('div');
        const layout = document.createElement('div');
        a.region.replaceWith(layout);
        layout.appendChild(outer);
        outer.appendChild(lazy);
        lazy.appendChild(a.region);
        const contained = new Map<Element, [string, string]>([
            [lazy, ['content-visibility', 'auto']],
            [outer, ['contain', 'layout paint']],
        ]);
        const computed = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
            const hit = contained.get(element);
            if (!hit) return computed(element, pseudo);
            return {
                getPropertyValue: (name: string) => (name === hit[0] ? hit[1] : ''),
            } as ReturnType<typeof window.getComputedStyle>;
        });
        setActiveFile(getFiles()[0]);
        expect(ring()?.parentElement).toBe(layout);
        expect(ring()?.style.zIndex).toBe('3');
    });

    it('is placed in its offset parent coordinates when one holds it', () => {
        const [a] = getFiles();
        a.region.getBoundingClientRect = () => rect({top: 500, left: 120, width: 600, height: 300});
        setActiveFile(a);
        const host = a.region.parentElement!;
        host.getBoundingClientRect = () => rect({top: 200, left: 100});
        Object.defineProperties(host, {
            clientTop: {value: 1},
            clientLeft: {value: 2},
            scrollTop: {value: 40},
            scrollLeft: {value: 0},
        });
        Object.defineProperty(ring()!, 'offsetParent', {value: host});
        window.dispatchEvent(new Event('resize'));
        expect({top: ring()?.style.top, left: ring()?.style.left}).toEqual({
            top: '339px',
            left: '18px',
        });
    });

    it('moves the one overlay rather than adding another, and removes it when cleared', () => {
        const [a, , c] = getFiles();
        c.region.getBoundingClientRect = () => rect({top: 900, left: 20, width: 600, height: 50});
        setActiveFile(a);
        setActiveFile(c);
        expect(document.querySelectorAll('#exo-github-active-file')).toHaveLength(1);
        expect(ring()?.style.top).toBe('900px');
        clearActiveFile();
        expect(ring()).toBeNull();
        expect(getActiveFile()).toBeNull();
    });

    it('survives the region being re-rendered, and reports null once it is gone', () => {
        const [a] = getFiles();
        setActiveFile(a);
        const clone = a.region.cloneNode(true) as HTMLElement;
        a.region.replaceWith(clone);
        expect(getActiveFile()?.region).toBe(clone);
        clone.remove();
        expect(getActiveFile()).toBeNull();
        expect(getActiveAnchor()).toBe(anchorFor('a.ts')); // remembered, in case it comes back
    });

    it('pinActiveFile pins the region below the sticky offset with a gap, ignoring other files', () => {
        expect(pinActiveFile()).toBe(false);
        const [a, b] = getFiles();
        a.region
            .querySelector<HTMLElement>('[data-diff-header-wrapper]')!
            .style.setProperty('--header-sticky-offset', '40px');
        setActiveFile(a);
        expect(pinActiveFile()).toBe(true);
        expect(scroll.pinToTop).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({minCover: 40, gap: 6}),
        );
        const [resolve, {ignoreCover}] = (scroll.pinToTop as ReturnType<typeof vi.fn>).mock
            .calls[0];
        expect(resolve()).toBe(a.region);
        expect(ignoreCover(b.header)).toBe(true);
        const toast = document.createElement('div');
        toast.id = 'exo-notification-container';
        document.body.appendChild(toast);
        expect(ignoreCover(toast)).toBe(true);
        expect(ignoreCover(document.body)).toBe(false);
    });

    it('the pin follows its file through a re-render of the region, and waits while it is gone', () => {
        const [a, , c] = getFiles();
        setActiveFile(a);
        pinActiveFile();
        const [resolve] = (scroll.pinToTop as ReturnType<typeof vi.fn>).mock.calls[0];
        const clone = a.region.cloneNode(true) as HTMLElement;
        a.region.replaceWith(clone);
        expect(resolve()).toBe(clone);
        // The cursor moving on does not retarget a pin already holding.
        setActiveFile(c);
        expect(resolve()).toBe(clone);
        clone.remove();
        expect(resolve()).toBeNull();
    });

    it('cancels a pin still holding when a new one starts or the cursor clears', () => {
        const cancel = vi.fn();
        (scroll.pinToTop as ReturnType<typeof vi.fn>).mockReturnValue(cancel);
        const [a] = getFiles();
        setActiveFile(a);
        pinActiveFile();
        pinActiveFile();
        expect(cancel).toHaveBeenCalledTimes(1);
        clearActiveFile();
        expect(cancel).toHaveBeenCalledTimes(2);
    });
});

describe('foldActiveFile (za / zc / zo)', () => {
    let uninstall: () => void;

    beforeEach(() => {
        document.body.innerHTML = renderFilesList([
            {path: 'a.ts'},
            {path: 'b.ts', collapsed: true},
        ]);
        uninstall = installGitHubBehavior(document);
        vi.spyOn(scroll, 'pinToTop').mockReturnValue(() => {});
    });

    afterEach(() => {
        clearActiveFile();
        uninstall();
        document.body.innerHTML = '';
    });

    it('needs an active file', () => {
        expect(foldActiveFile('toggle')).toBe('no-active-file');
        expect(scroll.pinToTop).not.toHaveBeenCalled();
    });

    it('closes, opens and toggles through the chevron, pinning the file each time', () => {
        const [a] = getFiles();
        setActiveFile(a);
        expect(foldActiveFile('close')).toBe('closed');
        expect(isCollapsed(a)).toBe(true);
        expect(foldActiveFile('open')).toBe('opened');
        expect(isCollapsed(a)).toBe(false);
        expect(foldActiveFile('toggle')).toBe('closed');
        expect(foldActiveFile('toggle')).toBe('opened');
        expect(scroll.pinToTop).toHaveBeenCalledTimes(4);
    });

    it('a fold that changes nothing still pins the file back into view', () => {
        const [, b] = getFiles();
        setActiveFile(b);
        expect(foldActiveFile('close')).toBe('unchanged');
        expect(isCollapsed(b)).toBe(true);
        expect(scroll.pinToTop).toHaveBeenCalledTimes(1);
    });

    it('reports a header without a chevron', () => {
        const [a] = getFiles();
        setActiveFile(a);
        a.header.querySelector('svg')!.closest('button')!.remove();
        expect(foldActiveFile('close')).toBe('no-fold-control');
        expect(scroll.pinToTop).not.toHaveBeenCalled();
    });
});
