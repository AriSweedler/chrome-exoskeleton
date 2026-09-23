import {describe, it, expect, beforeEach, afterEach, vi, type Mock} from 'vitest';
import * as autoscroll from '@exo/plugins/github-autoscroll/autoscroll';
import * as cursor from '@exo/plugins/github-autoscroll/cursor';
import {fileByAnchor, getFiles, isViewed, viewedButton} from '@exo/plugins/github-autoscroll/files';
import * as scroll from '@exo/plugins/github-autoscroll/scroll';
import {
    anchorFor,
    installGitHubBehavior,
    renderFile,
    renderFilesList,
    type FixtureFile,
} from '@exo/plugins/github-autoscroll/test-dom';

const FILES: FixtureFile[] = [
    {path: 'a.ts'},
    {path: 'b.ts', viewed: true},
    {path: 'c.ts'},
    {path: 'd.ts'},
];

/** Let the emulated GitHub commit clicks and the engine take its next reading. */
const settle = () => vi.advanceTimersByTimeAsync(250);

const clickViewed = (path: string) => viewedButton(fileByAnchor(anchorFor(path))!)!.click();

describe('autoscroll', () => {
    let uninstall: () => void;
    let onAdvance: Mock<(outcome: autoscroll.AdvanceOutcome) => void>;

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
        vi.stubGlobal('location', {href: 'https://github.com/o/r/pull/1/changes', hash: ''});
        document.body.innerHTML = renderFilesList(FILES);
        uninstall = installGitHubBehavior(document);
        vi.spyOn(scroll, 'pinToTop').mockReturnValue(() => {});
        onAdvance = vi.fn<(outcome: autoscroll.AdvanceOutcome) => void>();
    });

    afterEach(() => {
        autoscroll.stop();
        uninstall();
        vi.unstubAllGlobals();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('does not start on a page without files, and leaves nothing behind', () => {
        document.body.innerHTML = '<main>loading…</main>';
        expect(autoscroll.start()).toBe(false);
        expect(autoscroll.isRunning()).toBe(false);
        expect(document.getElementById('exo-github-active-file')).toBeNull();
    });

    it('starts on the first unviewed file, pinned to the top', () => {
        expect(autoscroll.start()).toBe(true);
        expect(autoscroll.isRunning()).toBe(true);
        expect(cursor.getActiveFile()?.path).toBe('a.ts');
        expect(scroll.pinToTop).toHaveBeenCalledTimes(1);
        expect(autoscroll.start()).toBe(true); // idempotent
        expect(scroll.pinToTop).toHaveBeenCalledTimes(1);
    });

    it('starts on the file the URL targets without touching the viewport', () => {
        vi.stubGlobal('location', {
            href: `https://github.com/o/r/pull/1/changes#${anchorFor('c.ts')}`,
            hash: `#${anchorFor('c.ts')}`,
        });
        autoscroll.start();
        expect(cursor.getActiveFile()?.path).toBe('c.ts');
        expect(scroll.pinToTop).not.toHaveBeenCalled();
    });

    it('moves to the next unviewed file when one is marked viewed, once GitHub commits the flip', async () => {
        autoscroll.start({onAdvance});
        clickViewed('a.ts');
        expect(cursor.getActiveFile()?.path).toBe('a.ts'); // nothing yet: GitHub has not flipped
        await settle();
        expect(cursor.getActiveFile()?.path).toBe('c.ts'); // b.ts was already viewed
        expect(scroll.pinToTop).toHaveBeenCalledTimes(2);
        expect(onAdvance).toHaveBeenCalledWith({
            kind: 'moved',
            file: expect.objectContaining({path: 'c.ts'}),
            wrapped: false,
        });
    });

    it('advances from the file that flipped, not from the cursor', async () => {
        autoscroll.start({onAdvance});
        clickViewed('c.ts');
        await settle();
        expect(cursor.getActiveFile()?.path).toBe('d.ts');
    });

    it('wraps around to the files above when none is left below', async () => {
        autoscroll.start({onAdvance});
        clickViewed('d.ts');
        await settle();
        expect(cursor.getActiveFile()?.path).toBe('a.ts');
        expect(onAdvance).toHaveBeenLastCalledWith(
            expect.objectContaining({kind: 'moved', wrapped: true}),
        );
    });

    it('clears the cursor when every file is viewed', async () => {
        autoscroll.start({onAdvance});
        clickViewed('a.ts');
        clickViewed('c.ts');
        clickViewed('d.ts');
        await settle();
        expect(cursor.getActiveFile()).toBeNull();
        expect(document.getElementById('exo-github-active-file')).toBeNull();
        expect(onAdvance).toHaveBeenLastCalledWith({kind: 'all-viewed'});
    });

    it('in a batch of flips, the last in document order leads', async () => {
        autoscroll.start({onAdvance});
        clickViewed('c.ts');
        clickViewed('a.ts');
        await settle();
        expect(onAdvance).toHaveBeenCalledTimes(1);
        expect(cursor.getActiveFile()?.path).toBe('d.ts');
    });

    it('ignores a file GitHub renders late in an already-viewed state', async () => {
        autoscroll.start({onAdvance});
        const list = document.querySelector('[data-testid="progressive-diffs-list"]')!;
        list.insertAdjacentHTML('beforeend', renderFile({path: 'late.ts', viewed: true}, 9));
        await settle();
        expect(onAdvance).not.toHaveBeenCalled();
        expect(cursor.getActiveFile()?.path).toBe('a.ts');
    });

    it('ignores unmarking', async () => {
        autoscroll.start({onAdvance});
        clickViewed('b.ts');
        await settle();
        expect(isViewed(fileByAnchor(anchorFor('b.ts'))!)).toBe(false);
        expect(onAdvance).not.toHaveBeenCalled();
    });

    it('ignores a flip it was told about (the d sweep), once', async () => {
        autoscroll.start({onAdvance});
        autoscroll.ignoreNextViewedFlip([anchorFor('a.ts')]);
        clickViewed('a.ts');
        await settle();
        expect(onAdvance).not.toHaveBeenCalled();
        expect(cursor.getActiveFile()?.path).toBe('a.ts');

        clickViewed('a.ts'); // unmark
        await settle();
        clickViewed('a.ts'); // the reviewer marks it again: this one counts
        await settle();
        expect(onAdvance).toHaveBeenCalledTimes(1);
    });

    it('a click anywhere in a file makes it the active one', () => {
        autoscroll.start();
        const d = fileByAnchor(anchorFor('d.ts'))!;
        d.region
            .querySelector('.diff-content')!
            .dispatchEvent(new MouseEvent('click', {bubbles: true}));
        expect(cursor.getActiveFile()?.path).toBe('d.ts');
        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        expect(cursor.getActiveFile()?.path).toBe('d.ts');
    });

    it('stop drops the cursor and stops watching', async () => {
        autoscroll.start({onAdvance});
        autoscroll.stop();
        expect(autoscroll.isRunning()).toBe(false);
        expect(cursor.getActiveFile()).toBeNull();
        expect(document.getElementById('exo-github-active-file')).toBeNull();
        clickViewed('a.ts');
        await settle();
        expect(onAdvance).not.toHaveBeenCalled();
        autoscroll.stop(); // idempotent
    });

    it('advanceFrom(null) starts from the top', () => {
        autoscroll.start();
        expect(autoscroll.advanceFrom(null)).toMatchObject({kind: 'moved', wrapped: false});
        expect(cursor.getActiveFile()?.path).toBe('a.ts');
        expect(getFiles()).toHaveLength(4);
    });
});
