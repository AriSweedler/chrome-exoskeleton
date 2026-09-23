import {describe, it, expect, afterEach} from 'vitest';
import {
    listExamples,
    loadExampleHtml,
    missingExampleHint,
} from '@exo/plugins/github-autoscroll/example-dom';
import {
    diffBody,
    foldButton,
    getFiles,
    headerStickyOffset,
    isAutoHidden,
    isCollapsed,
    isViewed,
    viewedButton,
} from '@exo/plugins/github-autoscroll/files';
import {markAutoHiddenFilesViewed} from '@exo/plugins/github-autoscroll/auto-hidden';
import {diffSettingsButton, toggleDiffLayout} from '@exo/plugins/github-autoscroll/layout';

/**
 * Real-DOM tests: the files model against saved snapshots of actual PR
 * "Files changed" pages (plugins/github-autoscroll/examples/*.html).
 * Data-driven — every count is derived from the snapshot itself, so a new
 * snapshot needs no test changes.
 *
 * Snapshots are gitignored — machine-local. When none are saved, this suite
 * skips with a loud hint instead of failing: committed tests must not depend
 * on uncommitted files.
 */

const EXAMPLES = listExamples();

if (EXAMPLES.length === 0) {
    console.warn(
        `[github-autoscroll real-DOM tests] no snapshots found — suite skipped.\n` +
            missingExampleHint('ghpr-with-viewed-files.html'),
    );
}

describe.skipIf(EXAMPLES.length === 0)('GitHub files model against real DOM snapshots', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe.each(EXAMPLES)('%s', (name) => {
        function installDom(): void {
            const html = loadExampleHtml(name);
            if (!html) throw new Error(missingExampleHint(name));
            document.body.innerHTML = html;
        }

        it('models every file header once, with a full path and a unique anchor', () => {
            installDom();
            const headers = document.querySelectorAll(
                '[class*="DiffFileHeader-module__diff-file-header__"]',
            );
            const files = getFiles();
            expect(files.length).toBe(headers.length);
            expect(files.length).toBeGreaterThan(0);
            expect(new Set(files.map((f) => f.anchor)).size).toBe(files.length);
            for (const file of files) {
                expect(file.anchor).toMatch(/^diff-[0-9a-f]+$/);
                expect(file.path, 'path resolves').toMatch(/[./]/);
                expect(file.path, 'no bidi junk').not.toMatch(/[‎‏]/);
                expect(file.path).not.toContain('Copy file name');
            }
        });

        it('finds a Viewed toggle and a fold chevron on every file', () => {
            installDom();
            for (const file of getFiles()) {
                expect(viewedButton(file), file.path).not.toBeNull();
                expect(foldButton(file), file.path).not.toBeNull();
            }
        });

        it('reads viewed and collapsed state matching the raw markup', () => {
            installDom();
            const files = getFiles();
            const viewedButtons = document.querySelectorAll(
                'button[class*="MarkAsViewedButton"][aria-pressed="true"]',
            ).length;
            const collapsedHeaders = document.querySelectorAll(
                '[class*="DiffFileHeader-module__collapsed"]',
            ).length;
            expect(files.filter(isViewed).length).toBe(viewedButtons);
            expect(files.filter(isCollapsed).length).toBe(collapsedHeaders);
        });

        it('a collapsed file has no body, an open one does (GitHub drops it)', () => {
            installDom();
            for (const file of getFiles()) {
                expect(diffBody(file) === null, file.path).toBe(isCollapsed(file));
            }
        });

        it('every viewed file is collapsed', () => {
            installDom();
            for (const file of getFiles().filter(isViewed)) {
                expect(isCollapsed(file), file.path).toBe(true);
            }
        });

        it('auto-hidden means a generated or deleted placeholder body, never a large diff', () => {
            installDom();
            const bodies = Array.from(document.querySelectorAll('[data-diff-anchor]'));
            const expected = bodies.filter((body) => {
                const text = body.textContent ?? '';
                if (text.includes('This file was deleted.')) return true;
                return text.includes('not rendered by default') && !text.includes('Large diffs');
            }).length;
            const files = getFiles();
            expect(files.filter(isAutoHidden).length).toBe(expected);
            for (const file of files.filter(isAutoHidden)) {
                expect(diffBody(file)?.textContent).not.toContain('Large diffs');
            }
        });

        it('d would mark exactly the unviewed auto-hidden files', () => {
            installDom();
            const hidden = getFiles().filter(isAutoHidden);
            const unviewed = hidden.filter((file) => !isViewed(file)).length;
            expect(markAutoHiddenFilesViewed()).toEqual({
                marked: unviewed,
                alreadyViewed: hidden.length - unviewed,
            });
        });

        it('finds the diff view settings gear', () => {
            installDom();
            const gear = diffSettingsButton();
            expect(gear).not.toBeNull();
            expect(gear?.querySelector('svg.octicon-gear')).not.toBeNull();
            expect(gear?.getAttribute('aria-haspopup')).toBe('true');
        });

        it('with the settings menu open, reads the Layout items and picks the other one', async () => {
            installDom();
            if (!name.includes('diff-settings-menu')) return; // snapshot without the menu open
            const checked = Array.from(
                document.querySelectorAll('[role="menuitemradio"][aria-checked="true"]'),
            ).map((item) => item.textContent?.trim());
            expect(checked).toContain('Unified');
            // The DOM is inert, so the click changes nothing and the menu stays;
            // the outcome still names the layout it went for.
            expect(await toggleDiffLayout()).toEqual({kind: 'switched', to: 'split'});
        });

        it("reads GitHub's sticky offset as a number", () => {
            installDom();
            for (const file of getFiles()) {
                const offset = headerStickyOffset(file);
                expect(Number.isFinite(offset)).toBe(true);
                expect(offset).toBeGreaterThanOrEqual(0);
            }
        });
    });
});
