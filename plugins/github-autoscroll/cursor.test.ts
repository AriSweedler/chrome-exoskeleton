import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {
    ACTIVE_FILE_BORDER,
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

const activeStyle = () => document.getElementById('exo-github-active-file');

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

    it('is painted through one CSS rule on its anchor id, in light yellow', () => {
        expect(activeStyle()).toBeNull();
        const [a] = getFiles();
        setActiveFile(a);
        expect(getActiveAnchor()).toBe(anchorFor('a.ts'));
        expect(getActiveFile()?.path).toBe('a.ts');
        const css = activeStyle()?.textContent ?? '';
        expect(css).toContain(`[id="${anchorFor('a.ts')}"]`);
        expect(css).toContain(`outline: 3px solid ${ACTIVE_FILE_BORDER}`);
    });

    it('moves the rule rather than stacking rules, and clears it', () => {
        const [a, , c] = getFiles();
        setActiveFile(a);
        setActiveFile(c);
        expect(document.querySelectorAll('#exo-github-active-file')).toHaveLength(1);
        expect(activeStyle()?.textContent).toContain(anchorFor('c.ts'));
        expect(activeStyle()?.textContent).not.toContain(anchorFor('a.ts'));
        clearActiveFile();
        expect(activeStyle()).toBeNull();
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
            a.region,
            expect.objectContaining({minCover: 40, gap: 6}),
        );
        const {ignoreCover} = (scroll.pinToTop as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(ignoreCover(b.header)).toBe(true);
        const toast = document.createElement('div');
        toast.id = 'exo-notification-container';
        document.body.appendChild(toast);
        expect(ignoreCover(toast)).toBe(true);
        expect(ignoreCover(document.body)).toBe(false);
    });

    it('cancels a pin still settling when a new one starts or the cursor clears', () => {
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
