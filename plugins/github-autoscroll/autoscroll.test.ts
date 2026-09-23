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

type Rect = ReturnType<HTMLElement['getBoundingClientRect']>;
const rect = (partial: Partial<Rect>): Rect => partial as Rect;

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

    it('follows the reader: on scroll the cursor moves to the file under the reading line', async () => {
        autoscroll.start();
        expect(cursor.getActiveFile()?.path).toBe('a.ts');
        // Scrolled so that a.ts is above the viewport and b.ts spans the top.
        const tops: Record<string, [number, number]> = {
            'a.ts': [-500, -100],
            'b.ts': [-100, 300],
            'c.ts': [300, 700],
            'd.ts': [700, 1100],
        };
        for (const file of getFiles()) {
            const [top, bottom] = tops[file.path]!;
            file.region.getBoundingClientRect = () => rect({top, bottom, left: 0, width: 800});
        }
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('scroll')); // coalesced into one reading
        await vi.advanceTimersByTimeAsync(20);
        expect(cursor.getActiveFile()?.path).toBe('b.ts');

        // Past the last file: the last file stays the cursor.
        for (const file of getFiles()) {
            file.region.getBoundingClientRect = () =>
                rect({top: -900, bottom: -800, left: 0, width: 800});
        }
        expect(autoscroll.followViewport()?.path).toBe('d.ts');
        expect(cursor.getActiveFile()?.path).toBe('d.ts');

        // Stopped: scrolling moves nothing.
        autoscroll.stop();
        window.dispatchEvent(new Event('scroll'));
        await vi.advanceTimersByTimeAsync(20);
        expect(cursor.getActiveFile()).toBeNull();
    });

    it('moveCursor steps to the previous unviewed file, wrapping at the top', () => {
        autoscroll.start();
        const at = (path: string) => fileByAnchor(anchorFor(path))!;
        // From d.ts back: c.ts (b.ts is viewed, skipped).
        expect(autoscroll.moveCursor(at('d.ts'), 'previous')).toMatchObject({
            kind: 'moved',
            wrapped: false,
        });
        expect(cursor.getActiveFile()?.path).toBe('c.ts');
        expect(autoscroll.moveCursor(at('c.ts'), 'previous').kind).toBe('moved');
        expect(cursor.getActiveFile()?.path).toBe('a.ts');
        // Before a.ts there is nothing: wrap to the last unviewed, d.ts.
        expect(autoscroll.moveCursor(at('a.ts'), 'previous')).toMatchObject({
            kind: 'moved',
            wrapped: true,
        });
        expect(cursor.getActiveFile()?.path).toBe('d.ts');
        // Without an active file, previous means the last unviewed file.
        expect(autoscroll.moveCursor(null, 'previous').kind).toBe('moved');
        expect(cursor.getActiveFile()?.path).toBe('d.ts');
        // Forward is advanceFrom.
        expect(autoscroll.moveCursor(at('a.ts'), 'next').kind).toBe('moved');
        expect(cursor.getActiveFile()?.path).toBe('c.ts');
    });

    it('advanceFrom(null) starts from the top', () => {
        autoscroll.start();
        expect(autoscroll.advanceFrom(null)).toMatchObject({kind: 'moved', wrapped: false});
        expect(cursor.getActiveFile()?.path).toBe('a.ts');
        expect(getFiles()).toHaveLength(4);
    });
});
