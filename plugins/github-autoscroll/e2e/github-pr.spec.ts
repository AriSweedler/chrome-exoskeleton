import {test, expect} from '@exo-e2e/fixtures';
import type {BrowserContext, Page} from '@playwright/test';
import {
    openFixturePage,
    seenKeys,
    resetSeenKeys,
    pressAndExpectToast,
    expectToast,
    waitForKeybindings,
    toastContainer,
} from '@exo-e2e/helpers';
import {PR_URL, PR_CHANGES_URL, PR_HTML, TOOLBAR_HEIGHT, PIN_GAP, anchor} from './fixture-pages';

/**
 * These tests exercise the real content script in Chromium to prove what a
 * unit test cannot:
 *   1. An exo keystroke fires end-to-end (toast renders, handler runs), and
 *      the page never receives it — while ordinary keys still reach the page.
 *   2. The review cursor is painted (a real computed overlay) and the pin
 *      lands the header where it should, under a real sticky toolbar, even
 *      though the emulated GitHub collapses the marked file a beat after it
 *      flips the viewed state — the layout shift that used to need three
 *      clicks to get right.
 */

const openToyPr = (context: BrowserContext, url = PR_URL): Promise<Page> =>
    openFixturePage(context, url, PR_HTML);

/** The active file's anchor, from the cursor's CSS rule. */
const activeAnchor = (page: Page) =>
    page.evaluate(
        () =>
            document
                .getElementById('exo-github-active-file')
                ?.textContent?.match(/\[id="([^"]+)"\]/)?.[1] ?? null,
    );

const headerTop = (page: Page, id: string) =>
    page.evaluate((id) => document.getElementById(id)!.getBoundingClientRect().top, id);

const isCollapsed = (page: Page, id: string) =>
    page.evaluate(
        (id) => document.getElementById(id)!.querySelector('svg.octicon-chevron-right') !== null,
        id,
    );

const viewedStates = (page: Page) =>
    page.evaluate(() =>
        Array.from(document.querySelectorAll('button[class*="MarkAsViewedButton"]')).map((btn) =>
            btn.getAttribute('aria-pressed'),
        ),
    );

const PINNED_TOP = TOOLBAR_HEIGHT + PIN_GAP;

test.describe('exo keybindings (content script)', () => {
    test('fires its own shortcut and hides that keystroke from the page', async ({context}) => {
        const page = await openToyPr(context);

        // Control: an ordinary key is NOT intercepted and reaches the page.
        await page.keyboard.press('x');
        await expect.poll(() => seenKeys(page)).toContain('x');

        // Now an exo shortcut. '?' opens the help overlay (no navigation).
        await resetSeenKeys(page);
        await page.keyboard.press('Shift+Slash'); // '?'

        // (1) The toast renders — announce() must not throw before the
        //     handler is scheduled.
        await expect(page.getByText('exo keystroke', {exact: false})).toBeVisible();
        // (1b) The handler actually ran — the help overlay appeared.
        await expect(page.getByText('Keyboard Shortcuts')).toBeVisible();

        // (2) The underlying page must NEVER have seen the '?' keystroke.
        expect(await seenKeys(page)).not.toContain('?');
    });

    test('Ctrl+V passes the next keystroke through to the page', async ({context}) => {
        const page = await openToyPr(context);

        // Without the prefix, an exo shortcut is intercepted — the page never
        // sees it.
        await page.keyboard.press('c');
        expect(await seenKeys(page)).not.toContain('c');

        // With the prefix, a banner appears and the next keystroke is handed
        // straight to the page.
        await resetSeenKeys(page);
        await page.keyboard.press('Control+v');
        await expect(page.getByText('pass-through', {exact: false})).toBeVisible();
        await page.keyboard.press('c');
        await expect.poll(() => seenKeys(page)).toContain('c');

        // A shifted key ('?' = Shift+Slash): the lone Shift must not consume the
        // arm, so the real '?' reaches the page.
        await resetSeenKeys(page);
        await page.keyboard.press('Control+v');
        await page.keyboard.press('?');
        await expect.poll(() => seenKeys(page)).toContain('?');
    });

    test('d marks auto-hidden files as viewed, leaving other files alone, and scrolls down', async ({
        context,
    }) => {
        const page = await openToyPr(context);

        await expect(async () => {
            await page.keyboard.press('d');
            await expect(toastContainer(page)).toContainText(
                'Marked 2 auto-hidden files as viewed',
                {
                    timeout: 500,
                },
            );
        }).toPass({timeout: 5000});

        // config.alpha (generated) and old-worker.yaml (deleted) flipped to
        // viewed; config.staging already was; the rendered src files and the
        // large diff stay untouched.
        await expect
            .poll(() => viewedStates(page))
            .toEqual(['true', 'true', 'false', 'false', 'true', 'false']);

        // Each press also advances a viewport, so holding d sweeps the PR.
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });

    test('D shows the files d marked again, even after GitHub collapsed them', async ({
        context,
    }) => {
        const page = await openToyPr(context);

        await expect(async () => {
            await page.keyboard.press('d');
            await expect(toastContainer(page)).toContainText(
                'Marked 2 auto-hidden files as viewed',
                {
                    timeout: 500,
                },
            );
        }).toPass({timeout: 5000});
        // GitHub collapses a viewed file and drops its body — the placeholder
        // that identified it as auto-hidden is gone.
        await expect
            .poll(() => isCollapsed(page, anchor('infra/deploy/generated/config.alpha.json')))
            .toBe(true);

        await page.keyboard.press('Shift+D');
        await expectToast(page, 'Showed 2 auto-hidden files (unmarked as viewed)');

        // The two d marked are unmarked; config.staging, viewed before the
        // page loaded, is out of D's reach.
        await expect
            .poll(() => viewedStates(page))
            .toEqual(['false', 'true', 'false', 'false', 'false', 'false']);
    });

    test('a toggles PR autoscroll', async ({context}) => {
        const page = await openToyPr(context);

        await pressAndExpectToast(page, 'a', 'GitHub PR Autoscroll enabled');
        await page.keyboard.press('a');
        await expectToast(page, 'GitHub PR Autoscroll disabled');
    });

    test('the f shortcut navigates to the Files changed tab', async ({context}) => {
        // openFixturePage routes the whole origin, so the /changes destination
        // resolves to the same fixture and the navigation commits.
        const page = await openToyPr(context);

        await page.keyboard.press('f');
        await page.waitForURL(PR_CHANGES_URL);
        expect(page.url()).toBe(PR_CHANGES_URL);
    });

    test('GitHub swallows g for its gg scroll chord; Ctrl+V passes a literal g', async ({
        context,
    }) => {
        // GitHub uses 'g' as its own navigation prefix, but the extension
        // deliberately registers a site-wide 'gg' (scroll to top) there —
        // the Ctrl+V pass-through is the escape hatch for GitHub's g-nav.
        const page = await openToyPr(context);
        await waitForKeybindings(page);
        await resetSeenKeys(page);

        // Start away from the top (the fixture is tall enough to scroll).
        await page.evaluate(() => window.scrollTo({top: 3000, behavior: 'instant'}));

        await page.keyboard.press('g');
        await expect(toastContainer(page)).toContainText('pending');
        expect(await seenKeys(page)).not.toContain('g');

        await page.keyboard.press('g');
        await expect(toastContainer(page)).toContainText('Scroll to the top of the page');
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        expect(await seenKeys(page)).not.toContain('g');

        // The escape hatch: Ctrl+V hands the next g straight to the page.
        await page.keyboard.press('Control+v');
        await expect(toastContainer(page)).toContainText('pass-through');
        await page.keyboard.press('g');
        await expect.poll(() => seenKeys(page)).toContain('g');
        await expect(toastContainer(page)).not.toContainText('pending');
    });
});

test.describe('the review cursor (Files changed)', () => {
    const FIRST = anchor('infra/deploy/generated/config.alpha.json');
    const THIRD = anchor('src/index.ts');
    const LAST = anchor('src/util.ts');

    /** Open the changes tab and wait for the auto-run to place the cursor. */
    async function openChanges(context: BrowserContext): Promise<Page> {
        const page = await openToyPr(context, PR_CHANGES_URL);
        await expectToast(page, 'GitHub PR Autoscroll enabled');
        await expect.poll(() => activeAnchor(page)).toBe(FIRST);
        return page;
    }

    test('auto-runs, rings the first unviewed file in light yellow and pins it under the toolbar', async ({
        context,
    }) => {
        const page = await openChanges(context);

        // The ring is an overlay inside the file's box (GitHub's wrappers clip
        // anything painted outside them); compare its color with the browser's
        // own rendering of the intended hsla.
        const ring = await page.evaluate((id) => {
            const probe = document.createElement('span');
            probe.style.color = 'hsla(55, 100%, 72%, 1)';
            document.body.appendChild(probe);
            const expected = getComputedStyle(probe).color;
            probe.remove();
            const overlay = getComputedStyle(document.getElementById(id)!, '::after');
            return {
                expected,
                borderColor: overlay.borderTopColor,
                borderWidth: overlay.borderTopWidth,
                borderStyle: overlay.borderTopStyle,
                position: overlay.position,
                pointerEvents: overlay.pointerEvents,
                glow: overlay.boxShadow,
            };
        }, FIRST);
        expect(ring.borderColor).toBe(ring.expected);
        expect(ring.borderWidth).toBe('2px');
        expect(ring.borderStyle).toBe('solid');
        expect(ring.position).toBe('absolute');
        expect(ring.pointerEvents).toBe('none');
        expect(ring.glow).toContain('inset');

        await expect.poll(() => headerTop(page, FIRST)).toBeCloseTo(PINNED_TOP, 0);
        // The toolbar is really stuck above it.
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });

    test('marking the active file Viewed moves the cursor to the next unviewed file and pins it, despite the late collapse', async ({
        context,
    }) => {
        const page = await openChanges(context);

        await page.locator(`#${FIRST} button[class*="MarkAsViewedButton"]`).click();

        // config.staging is viewed already, so the cursor lands on src/index.ts.
        await expect.poll(() => activeAnchor(page)).toBe(THIRD);
        // The emulated GitHub flips the state, then collapses the marked file
        // 120 ms later, shifting everything below it up. The pin corrects.
        await expect
            .poll(() => headerTop(page, THIRD), {timeout: 3000, intervals: [50]})
            .toBeCloseTo(PINNED_TOP, 0);
        await page.waitForTimeout(400);
        expect(await headerTop(page, THIRD)).toBeCloseTo(PINNED_TOP, 0);
    });

    test('zc closes the active file, zo opens it, za toggles it — each time pinning it back', async ({
        context,
    }) => {
        const page = await openChanges(context);
        await waitForKeybindings(page);

        await page.keyboard.press('z');
        await page.keyboard.press('c');
        await expect.poll(() => isCollapsed(page, FIRST)).toBe(true);
        await expect.poll(() => headerTop(page, FIRST)).toBeCloseTo(PINNED_TOP, 0);

        await page.keyboard.press('z');
        await page.keyboard.press('o');
        await expect.poll(() => isCollapsed(page, FIRST)).toBe(false);
        await expect.poll(() => headerTop(page, FIRST)).toBeCloseTo(PINNED_TOP, 0);

        await page.keyboard.press('z');
        await page.keyboard.press('a');
        await expect.poll(() => isCollapsed(page, FIRST)).toBe(true);

        // Folding never touched the viewed state.
        expect(await viewedStates(page)).toEqual([
            'false',
            'true',
            'false',
            'false',
            'false',
            'false',
        ]);
        // And z itself never reached the page.
        expect(await seenKeys(page)).not.toContain('z');
    });

    test('clicking inside a file makes it the active one', async ({context}) => {
        const page = await openChanges(context);

        await page.locator(`#${LAST} .diff-content`).click();
        await expect.poll(() => activeAnchor(page)).toBe(LAST);
    });

    test('a stops autoscroll and drops the ring', async ({context}) => {
        const page = await openChanges(context);

        await pressAndExpectToast(page, 'a', 'GitHub PR Autoscroll disabled');
        await expect.poll(() => activeAnchor(page)).toBeNull();
        expect(
            await page.evaluate(
                (id) => getComputedStyle(document.getElementById(id)!, '::after').content,
                FIRST,
            ),
        ).toBe('none');
    });
});
