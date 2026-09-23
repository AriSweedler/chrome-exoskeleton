import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {
    forgetSweep,
    markAutoHiddenFilesViewed,
    unmarkAutoHiddenFilesViewed,
} from '@exo/plugins/github-autoscroll/auto-hidden';
import * as autoscroll from '@exo/plugins/github-autoscroll/autoscroll';
import {getFiles, isViewed} from '@exo/plugins/github-autoscroll/files';
import {
    anchorFor,
    installGitHubBehavior,
    renderFilesList,
} from '@exo/plugins/github-autoscroll/test-dom';

/** Let the emulated GitHub commit a click (flip + collapse). */
const settle = () => vi.advanceTimersByTimeAsync(200);

describe('the d / D sweep', () => {
    let uninstall: () => void;

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = renderFilesList([
            {path: 'src/index.ts', body: 'diff'},
            {path: 'gen/alpha.json', body: 'generated'},
            {path: 'gen/staging.json', body: 'generated', viewed: true, collapsed: false},
            {path: 'big/bundle.yaml', body: 'large'},
            {path: 'old/worker.yaml', body: 'deleted'},
        ]);
        uninstall = installGitHubBehavior(document);
        forgetSweep();
    });

    afterEach(() => {
        uninstall();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('d marks the unviewed generated and deleted files, leaving diffs and large diffs alone', async () => {
        expect(markAutoHiddenFilesViewed()).toEqual({marked: 2, alreadyViewed: 1});
        await settle();
        expect(getFiles().map(isViewed)).toEqual([false, true, true, false, true]);
    });

    it('d tells autoscroll those flips are not the reviewer', () => {
        const ignore = vi.spyOn(autoscroll, 'ignoreNextViewedFlip');
        markAutoHiddenFilesViewed();
        expect(ignore).toHaveBeenCalledWith([
            anchorFor('gen/alpha.json'),
            anchorFor('old/worker.yaml'),
        ]);
    });

    it('d reports zeros on a page without auto-hidden files', () => {
        document.body.innerHTML = renderFilesList([{path: 'a.ts'}]);
        expect(markAutoHiddenFilesViewed()).toEqual({marked: 0, alreadyViewed: 0});
    });

    it('D unmarks what d marked even after GitHub dropped their bodies, plus any still-visible ones', async () => {
        markAutoHiddenFilesViewed();
        await settle();
        // GitHub collapsed the two d marked: their placeholder bodies are gone.
        expect(document.querySelectorAll('[data-diff-anchor]')).toHaveLength(3);

        expect(unmarkAutoHiddenFilesViewed()).toEqual({unmarked: 3});
        await settle();
        expect(getFiles().map(isViewed)).toEqual([false, false, false, false, false]);
    });

    it('D is a one-shot undo: a second D finds nothing', async () => {
        markAutoHiddenFilesViewed();
        await settle();
        unmarkAutoHiddenFilesViewed();
        await settle();
        expect(unmarkAutoHiddenFilesViewed()).toEqual({unmarked: 0});
    });

    it('D cannot reach a collapsed viewed file it never marked', () => {
        document.body.innerHTML = renderFilesList([
            {path: 'gen/old.json', body: 'generated', viewed: true},
        ]);
        expect(unmarkAutoHiddenFilesViewed()).toEqual({unmarked: 0});
    });
});
