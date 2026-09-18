import {describe, it, expect, afterEach} from 'vitest';
import {
    listExamples,
    loadExampleHtml,
    missingExampleHint,
} from '@exo/plugins/github-autoscroll/example-dom';
import {
    getViewedToggles,
    markAutoHiddenFilesViewed,
    getAutoHiddenDiffAnchors,
} from '@exo/plugins/github-autoscroll';

/**
 * Real-DOM tests: run the GitHub PR DOM helpers against saved snapshots of
 * actual PR pages (plugins/github-autoscroll/examples/*.html).
 *
 * Snapshots are gitignored — machine-local. When none are saved, this suite
 * skips with a loud hint instead of failing: committed tests must not depend
 * on uncommitted files.
 */

const EXAMPLES = listExamples();

/**
 * Snapshot-name fragments whose PRs are known to contain auto-hidden files
 * (generated files; deleted files). Other snapshots skip the
 * auto-hidden assertions rather than failing on a PR that has none.
 */
const HAS_AUTO_HIDDEN = ['autohidden', 'deleted'];

if (EXAMPLES.length === 0) {
    console.warn(
        `[github-autoscroll real-DOM tests] no snapshots found — suite skipped.\n` +
            missingExampleHint('ghpr-with-autohidden-files.html'),
    );
}

describe.skipIf(EXAMPLES.length === 0)('GitHub PR helpers against real DOM snapshots', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe.each(EXAMPLES)('%s', (name) => {
        function installDom(): void {
            const html = loadExampleHtml(name);
            if (!html) throw new Error(missingExampleHint(name));
            document.body.innerHTML = html;
        }

        it('finds a Viewed toggle with a full path for every rendered diff', () => {
            installDom();
            const toggles = getViewedToggles();
            expect(toggles.length).toBeGreaterThan(0);
            for (const toggle of toggles) {
                expect(toggle.path, 'path resolves').toContain('/');
                expect(toggle.path, 'no LRM junk').not.toContain('\u200e');
                expect(toggle.path).not.toContain('Copy file name');
            }
        });

        it('marks every unviewed auto-hidden file as viewed', () => {
            installDom();
            if (!HAS_AUTO_HIDDEN.some((fragment) => name.includes(fragment))) return;

            const anchors = getAutoHiddenDiffAnchors();
            const hidden = getViewedToggles().filter(
                (t) => t.anchor !== undefined && anchors.has(t.anchor),
            );
            expect(hidden.length).toBeGreaterThan(0);
            const unviewedBefore = hidden.filter((t) => !t.viewed).length;

            const result = markAutoHiddenFilesViewed();

            expect(result.marked).toBe(unviewedBefore);
            expect(result.alreadyViewed).toBe(hidden.length - unviewedBefore);
        });

        it('treats every "This file was deleted." placeholder as auto-hidden', () => {
            installDom();
            if (!name.includes('deleted')) return; // snapshot without deleted files

            const deletedBodies = Array.from(
                document.querySelectorAll('[data-diff-anchor]'),
            ).filter((body) => body.textContent?.includes('This file was deleted.'));
            expect(deletedBodies.length).toBeGreaterThan(0);

            const anchors = getAutoHiddenDiffAnchors();
            for (const body of deletedBodies) {
                expect(anchors.has(body.getAttribute('data-diff-anchor') ?? '')).toBe(true);
            }
            // ...and each one pairs with a Viewed toggle, so `d` can mark it.
            const hidden = getViewedToggles().filter(
                (t) => t.anchor !== undefined && anchors.has(t.anchor),
            );
            expect(hidden.length).toBe(anchors.size);
        });
    });
});
