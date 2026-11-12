import {describe, it, expect, afterEach} from 'vitest';
import {
    listExamples,
    loadExampleHtml,
    missingExampleHint,
} from '@exo/plugins/github-autoscroll/example-dom';
import {
    currentPanelView,
    isPanelOpen,
    panelToggle,
    panelViewButton,
} from '@exo/plugins/github-autoscroll/panel';

/**
 * Real-DOM tests: the panel model against saved snapshots of a PR's Overview
 * page, named `ghpr-overview-panel-<state>.html` where <state> is `closed`
 * or the slug of the view the panel shows (`merge-status`, `activity`).
 * The expectation comes from the name, so a new snapshot needs no test
 * change. Gitignored, machine-local; skips with a hint when none are saved.
 */

const PREFIX = 'ghpr-overview-panel-';
const EXAMPLES = listExamples().filter((name) => name.startsWith(PREFIX));

if (EXAMPLES.length === 0) {
    console.warn(
        `[github-autoscroll panel real-DOM tests] no snapshots found — suite skipped.\n` +
            missingExampleHint(`${PREFIX}closed.html`),
    );
}

const slug = (view: string) => view.toLowerCase().replace(/[^a-z0-9]+/g, '-');

describe.skipIf(EXAMPLES.length === 0)('GitHub side panel against real DOM snapshots', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe.each(EXAMPLES)('%s', (name) => {
        const state = name.slice(PREFIX.length).replace(/\.html$/, '');

        it('finds the mini header toggle', () => {
            const html = loadExampleHtml(name);
            if (!html) throw new Error(missingExampleHint(name));
            document.body.innerHTML = html;
            expect(panelToggle()).not.toBeNull();
        });

        it(`reads the panel as ${state}`, () => {
            document.body.innerHTML = loadExampleHtml(name) ?? '';
            if (state === 'closed') {
                expect(isPanelOpen()).toBe(false);
                expect(panelViewButton()).toBeNull();
                expect(currentPanelView()).toBeNull();
            } else {
                expect(isPanelOpen()).toBe(true);
                expect(panelViewButton()?.getAttribute('aria-haspopup')).toBe('true');
                expect(slug(currentPanelView() ?? '')).toBe(state);
            }
        });
    });
});
