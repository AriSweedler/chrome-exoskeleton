import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {
    goToChangedFiles,
    goToConversation,
    initializeAutoScroll,
    isGitHubPRChangesPage,
    isGitHubPRPage,
    getViewedToggles,
    markAutoHiddenFilesViewed,
    unmarkAutoHiddenFilesViewed,
} from '@exo/plugins/github-autoscroll';

describe('viewed toggles (new GitHub files view)', () => {
    let anchorCounter = 0;

    /** GitHub's "Load Diff" placeholder texts, one per reason it collapses a diff. */
    const PLACEHOLDERS = {
        generated: 'Load Diff Some generated files are not rendered by default.',
        large: 'Load Diff Large diffs are not rendered by default.',
        deleted: 'Load Diff This file was deleted.',
    } as const;

    /**
     * A file diff shaped like GitHub's current files view: header plus diff
     * body, paired by a diff-<n> anchor. `hidden` renders the body as
     * GitHub's collapsed placeholder instead of a diff.
     */
    function addFileHeader(
        path: string,
        viewed: boolean,
        hidden: keyof typeof PLACEHOLDERS | false = false,
    ): void {
        const anchor = `diff-${++anchorCounter}`;
        const file = document.createElement('div');
        file.innerHTML = `
            <div class="DiffFileHeader-module__diff-file-header__UuNN4">
                <div class="DiffFileHeader-module__file-path-section__Z">
                    <h3 class="DiffFileHeader-module__file-name__V">
                        <a class="prc-Link-Link-9ZwDx" href="#${anchor}">${'\u200e'}${path}${'\u200e'}</a>
                        <button>Copy file name to clipboard</button>
                    </h3>
                </div>
                <button class="prc-Button-ButtonBase MarkAsViewedButton-module__x"
                        aria-label="${viewed ? 'Viewed' : 'Not Viewed'}"
                        aria-pressed="${viewed}"><span>Viewed</span></button>
            </div>
            <div data-diff-anchor="${anchor}">${hidden ? PLACEHOLDERS[hidden] : '+diff content'}</div>
        `;
        document.body.appendChild(file);
    }

    beforeEach(() => {
        document.body.innerHTML = '';
        anchorCounter = 0;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('getViewedToggles resolves clean paths, anchors, and viewed state', () => {
        addFileHeader('infra/deploy/generated/config.alpha.json', false);
        addFileHeader('src/index.ts', true);

        const toggles = getViewedToggles();
        expect(toggles.map((t) => t.path)).toEqual([
            'infra/deploy/generated/config.alpha.json',
            'src/index.ts',
        ]);
        expect(toggles.map((t) => t.anchor)).toEqual(['diff-1', 'diff-2']);
        expect(toggles.map((t) => t.viewed)).toEqual([false, true]);
    });

    it('markAutoHiddenFilesViewed clicks only unviewed auto-hidden files', () => {
        addFileHeader('infra/deploy/generated/config.alpha.json', false, 'generated');
        addFileHeader('infra/deploy/generated/config.staging.json', true, 'generated');
        addFileHeader(
            'services/generated_k8s_yaml/production/cip-repository/production-apse2-batch-shard01-001/stable/generated_manifests_sha.yaml',
            false,
            'generated',
        );
        addFileHeader('src/index.ts', false);

        const clicked: string[] = [];
        for (const toggle of getViewedToggles()) {
            toggle.button.addEventListener('click', () => clicked.push(toggle.path));
        }

        const result = markAutoHiddenFilesViewed();

        expect(result).toEqual({marked: 2, alreadyViewed: 1});
        expect(clicked).toEqual([
            'infra/deploy/generated/config.alpha.json',
            'services/generated_k8s_yaml/production/cip-repository/production-apse2-batch-shard01-001/stable/generated_manifests_sha.yaml',
        ]);
    });

    it('markAutoHiddenFilesViewed treats deleted files as auto-hidden', () => {
        addFileHeader(
            'services/generated_k8s_yaml/production/taskworker-service-ai-field/production-use1-asyncServing-shard01-002/stable/generated_manifests_sha.yaml',
            false,
            'deleted',
        );
        addFileHeader('src/legacy/old-worker.ts', true, 'deleted');
        addFileHeader('src/index.ts', false);

        const clicked: string[] = [];
        for (const toggle of getViewedToggles()) {
            toggle.button.addEventListener('click', () => clicked.push(toggle.path));
        }

        const result = markAutoHiddenFilesViewed();

        expect(result).toEqual({marked: 1, alreadyViewed: 1});
        expect(clicked).toEqual([
            'services/generated_k8s_yaml/production/taskworker-service-ai-field/production-use1-asyncServing-shard01-002/stable/generated_manifests_sha.yaml',
        ]);
    });

    it('markAutoHiddenFilesViewed leaves large diffs alone', () => {
        addFileHeader('package-lock.json', false, 'generated');
        addFileHeader('src/huge-refactor.ts', false, 'large');

        const clicked: string[] = [];
        for (const toggle of getViewedToggles()) {
            toggle.button.addEventListener('click', () => clicked.push(toggle.path));
        }

        const result = markAutoHiddenFilesViewed();

        expect(result).toEqual({marked: 1, alreadyViewed: 0});
        expect(clicked).toEqual(['package-lock.json']);
    });

    it('markAutoHiddenFilesViewed reports zeros on a page without auto-hidden files', () => {
        addFileHeader('src/index.ts', false);
        expect(markAutoHiddenFilesViewed()).toEqual({marked: 0, alreadyViewed: 0});
    });

    it('unmarkAutoHiddenFilesViewed clicks only viewed auto-hidden files', () => {
        addFileHeader('config.alpha.json', true, 'generated');
        addFileHeader('config.staging.json', false, 'generated');
        addFileHeader('src/legacy/old-worker.ts', true, 'deleted');
        addFileHeader('src/huge-refactor.ts', true, 'large');
        addFileHeader('src/index.ts', true);

        const clicked: string[] = [];
        for (const toggle of getViewedToggles()) {
            toggle.button.addEventListener('click', () => clicked.push(toggle.path));
        }

        const result = unmarkAutoHiddenFilesViewed();

        // Only the viewed generated and deleted files: not the unviewed one,
        // not the large diff, not the hand-viewed regular file.
        expect(result).toEqual({unmarked: 2});
        expect(clicked).toEqual(['config.alpha.json', 'src/legacy/old-worker.ts']);
    });

    it('unmarkAutoHiddenFilesViewed reports zero when nothing is marked', () => {
        addFileHeader('config.alpha.json', false, 'generated');
        addFileHeader('src/index.ts', true);
        expect(unmarkAutoHiddenFilesViewed()).toEqual({unmarked: 0});
    });
});

describe('isGitHubPRChangesPage', () => {
    it('returns true for valid GitHub PR changes URL', () => {
        const url = 'https://github.com/owner/repo/pull/123/changes';
        expect(isGitHubPRChangesPage(url)).toBe(true);
    });

    it('returns false for GitHub PR files URL', () => {
        const url = 'https://github.com/owner/repo/pull/123/files';
        expect(isGitHubPRChangesPage(url)).toBe(false);
    });

    it('returns false for non-PR GitHub URL', () => {
        const url = 'https://github.com/owner/repo';
        expect(isGitHubPRChangesPage(url)).toBe(false);
    });

    it('returns false for non-GitHub URL', () => {
        const url = 'https://gitlab.com/owner/repo/merge_requests/123';
        expect(isGitHubPRChangesPage(url)).toBe(false);
    });

    it('returns true for URL with query parameters', () => {
        const url = 'https://github.com/owner/repo/pull/123/changes?w=1';
        expect(isGitHubPRChangesPage(url)).toBe(true);
    });

    it('returns true for URL with hash fragment', () => {
        const url = 'https://github.com/owner/repo/pull/123/changes#diff-abc123';
        expect(isGitHubPRChangesPage(url)).toBe(true);
    });

    it('returns false for URL with invalid PR number (non-numeric)', () => {
        const url = 'https://github.com/owner/repo/pull/abc/changes';
        expect(isGitHubPRChangesPage(url)).toBe(false);
    });

    it('returns true for URL with www subdomain', () => {
        const url = 'https://www.github.com/owner/repo/pull/123/changes';
        expect(isGitHubPRChangesPage(url)).toBe(true);
    });
});

describe('isGitHubPRPage', () => {
    it('returns true for the PR root (no tab)', () => {
        expect(isGitHubPRPage('https://github.com/owner/repo/pull/123')).toBe(true);
    });

    it('returns true for any PR sub-tab', () => {
        expect(isGitHubPRPage('https://github.com/owner/repo/pull/123/files')).toBe(true);
        expect(isGitHubPRPage('https://github.com/owner/repo/pull/123/commits')).toBe(true);
        expect(isGitHubPRPage('https://github.com/owner/repo/pull/123/changes')).toBe(true);
    });

    it('returns true with query params, hash, and www subdomain', () => {
        expect(isGitHubPRPage('https://www.github.com/owner/repo/pull/123?foo=bar#x')).toBe(true);
    });

    it('returns false for non-PR GitHub URLs', () => {
        expect(isGitHubPRPage('https://github.com/owner/repo')).toBe(false);
        expect(isGitHubPRPage('https://github.com/owner/repo/issues/123')).toBe(false);
    });

    it('returns false for invalid PR number', () => {
        expect(isGitHubPRPage('https://github.com/owner/repo/pull/abc')).toBe(false);
    });

    it('returns false for non-GitHub URLs', () => {
        expect(isGitHubPRPage('https://gitlab.com/owner/repo/merge_requests/123')).toBe(false);
    });
});

describe('goToChangedFiles', () => {
    const originalLocation = window.location;

    function setLocation(href: string): {href: string} {
        const location = {href};
        Object.defineProperty(window, 'location', {writable: true, value: location});
        return location;
    }

    afterEach(() => {
        Object.defineProperty(window, 'location', {writable: true, value: originalLocation});
    });

    it('navigates to the changes tab from the PR conversation page', () => {
        const location = setLocation('https://github.com/owner/repo/pull/123');
        goToChangedFiles();
        expect(location.href).toBe('/owner/repo/pull/123/changes');
    });

    it('navigates to the changes tab from another sub-tab', () => {
        const location = setLocation('https://github.com/owner/repo/pull/123/commits');
        goToChangedFiles();
        expect(location.href).toBe('/owner/repo/pull/123/changes');
    });

    it('does nothing when already on the changes tab', () => {
        const location = setLocation('https://github.com/owner/repo/pull/123/changes');
        goToChangedFiles();
        expect(location.href).toBe('https://github.com/owner/repo/pull/123/changes');
    });

    it('does nothing when not on a PR page', () => {
        const location = setLocation('https://github.com/owner/repo');
        goToChangedFiles();
        expect(location.href).toBe('https://github.com/owner/repo');
    });
});

describe('goToConversation', () => {
    const originalLocation = window.location;

    function setLocation(href: string): {href: string} {
        const location = {href};
        Object.defineProperty(window, 'location', {writable: true, value: location});
        return location;
    }

    afterEach(() => {
        Object.defineProperty(window, 'location', {writable: true, value: originalLocation});
    });

    it('navigates to the PR root from the changes tab', () => {
        const location = setLocation('https://github.com/owner/repo/pull/123/changes');
        goToConversation();
        expect(location.href).toBe('/owner/repo/pull/123');
    });

    it('navigates to the PR root from the commits tab', () => {
        const location = setLocation('https://github.com/owner/repo/pull/123/commits');
        goToConversation();
        expect(location.href).toBe('/owner/repo/pull/123');
    });

    it('does nothing when already on the conversation (root) tab', () => {
        const location = setLocation('https://github.com/owner/repo/pull/123');
        goToConversation();
        expect(location.href).toBe('https://github.com/owner/repo/pull/123');
    });

    it('does nothing when not on a PR page', () => {
        const location = setLocation('https://github.com/owner/repo');
        goToConversation();
        expect(location.href).toBe('https://github.com/owner/repo');
    });
});

describe('initializeAutoScroll', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div data-hpc="true">
                <div class="d-flex flex-column gap-3">
                    <div class="Diff-module__diffHeaderWrapper--abc123">
                        <button aria-pressed="false">Viewed</button>
                    </div>
                    <div class="Diff-module__diffHeaderWrapper--abc123">
                        <button aria-pressed="true">Viewed</button>
                    </div>
                </div>
            </div>
        `;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__ghAutoScrollStop;
        // Clean up any leftover style elements
        const style = document.getElementById('gh-autoscroll-styles');
        if (style) {
            style.remove();
        }
    });

    it('returns a stop function', () => {
        const stopFn = initializeAutoScroll();
        expect(typeof stopFn).toBe('function');
        stopFn!();
    });

    it('injects CSS styles', () => {
        initializeAutoScroll();
        const style = document.getElementById('gh-autoscroll-styles');
        expect(style).not.toBeNull();
        expect(style?.textContent).toContain('gh-autoscroll-flash');
    });

    it('stores stop function in window', () => {
        const stopFn = initializeAutoScroll();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((window as any).__ghAutoScrollStop).toBe(stopFn);
        stopFn!();
    });

    it('removes CSS when stopped', () => {
        const stopFn = initializeAutoScroll();
        stopFn!();
        const style = document.getElementById('gh-autoscroll-styles');
        expect(style).toBeNull();
    });

    it('sees no files when diff wrappers exist but are still childless (mid-render)', () => {
        document.body.innerHTML = `
            <div class="Diff-module__diffHeaderWrapper--abc123"></div>
            <div class="file">not a diff header</div>
        `;

        expect(initializeAutoScroll()).toBeNull();
    });

    it('leaves no listener, styles, or stop function behind when no files are found', () => {
        document.body.innerHTML = '';
        const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

        const result = initializeAutoScroll();

        expect(result).toBeNull();
        expect(document.getElementById('gh-autoscroll-styles')).toBeNull();
        const clickListeners = addEventListenerSpy.mock.calls.filter(([type]) => type === 'click');
        expect(clickListeners).toHaveLength(0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((window as any).__ghAutoScrollStop).toBeUndefined();

        addEventListenerSpy.mockRestore();
    });

    describe('core autoscroll behavior', () => {
        beforeEach(() => {
            // Setup DOM with multiple files
            document.body.innerHTML = `
                <div data-hpc="true">
                    <div class="d-flex flex-column gap-3">
                        <div class="Diff-module__diffHeaderWrapper--abc123">
                            <div id="file1" class="Diff-module__fileName--xyz">
                                <div class="Diff-module__fileName--xyz">file1.ts</div>
                                <button aria-pressed="false">Viewed</button>
                            </div>
                        </div>
                        <div class="Diff-module__diffHeaderWrapper--abc123">
                            <div id="file2" class="Diff-module__fileName--xyz">
                                <div class="Diff-module__fileName--xyz">file2.ts</div>
                                <button aria-pressed="false">Viewed</button>
                            </div>
                        </div>
                        <div class="Diff-module__diffHeaderWrapper--abc123">
                            <div id="file3" class="Diff-module__fileName--xyz">
                                <div class="Diff-module__fileName--xyz">file3.ts</div>
                                <button aria-pressed="false">Viewed</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        it('scrolls to next unviewed file when clicking Viewed button', async () => {
            const stopFn = initializeAutoScroll();
            expect(stopFn).not.toBeNull();

            // Spy on window.scrollBy after initialization to track only the button click scroll
            const scrollSpy = vi.spyOn(window, 'scrollBy');

            // Get first file's button
            const file1 = document.getElementById('file1') as HTMLElement;
            const button1 = file1.querySelector('button') as HTMLButtonElement;

            // Click the button, then update aria-pressed (simulating GitHub's async update)
            button1.click();
            await new Promise((resolve) => setTimeout(resolve, 50)); // Small delay before setting
            button1.setAttribute('aria-pressed', 'true');

            // Wait for the setTimeout in onButtonClick to execute (100ms total + buffer)
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Verify window.scrollBy was called (scrolling happened)
            expect(scrollSpy).toHaveBeenCalled();

            scrollSpy.mockRestore();
            stopFn!();
        });

        it('applies flash animation to next file', async () => {
            const stopFn = initializeAutoScroll();

            const file2 = document.getElementById('file2') as HTMLElement;
            const file1 = document.getElementById('file1') as HTMLElement;
            const button1 = file1.querySelector('button') as HTMLButtonElement;

            // Click, then GitHub's async aria-pressed flip — which the
            // MutationObserver reacts to.
            button1.click();
            button1.setAttribute('aria-pressed', 'true');
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Check that flash class was added to file2
            expect(file2.classList.contains('gh-autoscroll-flash')).toBe(true);

            // The flash's own animation end removes the class (jsdom never
            // fires animation events, so dispatch it).
            file2.dispatchEvent(
                Object.assign(new Event('animationend'), {animationName: 'flashBorder'}),
            );
            expect(file2.classList.contains('gh-autoscroll-flash')).toBe(false);

            stopFn!();
        });

        it('does nothing when all files are viewed', async () => {
            const stopFn = initializeAutoScroll();

            // Mark all files as viewed
            const buttons = document.querySelectorAll('button[aria-pressed]');
            buttons.forEach((btn) => btn.setAttribute('aria-pressed', 'true'));

            const file3 = document.getElementById('file3') as HTMLElement;
            const scrollSpy = vi.fn();
            file3.scrollIntoView = scrollSpy;

            const button3 = file3.querySelector('button') as HTMLButtonElement;
            button3.click();

            await new Promise((resolve) => setTimeout(resolve, 150));

            // Should not scroll when no unviewed files remain
            expect(scrollSpy).not.toHaveBeenCalled();

            stopFn!();
        });

        it('skips viewed files and scrolls to next unviewed', async () => {
            const stopFn = initializeAutoScroll();

            // Mark file2 as viewed
            const file2 = document.getElementById('file2') as HTMLElement;
            const button2 = file2.querySelector('button') as HTMLButtonElement;
            button2.setAttribute('aria-pressed', 'true');

            // Spy on window.scrollBy
            const scrollSpy = vi.spyOn(window, 'scrollBy');

            // Click file1's button
            const file1 = document.getElementById('file1') as HTMLElement;
            const button1 = file1.querySelector('button') as HTMLButtonElement;
            button1.setAttribute('aria-pressed', 'true');
            button1.click();

            await new Promise((resolve) => setTimeout(resolve, 150));

            // Should scroll to file3, skipping already-viewed file2
            expect(scrollSpy).toHaveBeenCalled();

            scrollSpy.mockRestore();
            stopFn!();
        });
    });
});
