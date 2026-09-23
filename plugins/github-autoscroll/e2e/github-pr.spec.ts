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
import {
    PR_URL,
    PR_CHANGES_URL,
    PR_HTML,
    PR_FILES,
    TOOLBAR_HEIGHT,
    PIN_GAP,
    anchor,
} from './fixture-pages';

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

/** The anchor of the file the ring lies over (null without a ring). */
const activeAnchor = (page: Page) =>
    page.evaluate(() => {
        const ring = document.getElementById('exo-github-active-file');
        if (!ring) return null;
        const r = ring.getBoundingClientRect();
        for (const region of document.querySelectorAll<HTMLElement>(
            '[role="region"][id^="diff-"]',
        )) {
            const b = region.getBoundingClientRect();
            if (Math.abs(b.top - r.top) <= 1 && Math.abs(b.height - r.height) <= 1)
                return region.id;
        }
        return null;
    });

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

        // The ring is one overlay on the body laid over the file (GitHub's
        // wrappers clip anything painted outside them); it must sit exactly on
        // the file, glow both ways, and take no clicks. Its color is compared
        // with the browser's own rendering of the intended hsla.
        await expect.poll(() => headerTop(page, FIRST)).toBeCloseTo(PINNED_TOP, 0);
        const ring = await page.evaluate((id) => {
            const probe = document.createElement('span');
            probe.style.color = 'hsla(55, 100%, 65%, 0.9)';
            document.body.appendChild(probe);
            const expected = getComputedStyle(probe).color;
            probe.remove();
            const overlay = document.getElementById('exo-github-active-file')!;
            const style = getComputedStyle(overlay);
            const a = overlay.getBoundingClientRect();
            const b = document.getElementById(id)!.getBoundingClientRect();
            return {
                expected,
                borderColor: style.borderTopColor,
                borderWidth: style.borderTopWidth,
                pointerEvents: style.pointerEvents,
                glow: style.boxShadow,
                offBy: Math.max(
                    Math.abs(a.top - b.top),
                    Math.abs(a.left - b.left),
                    Math.abs(a.width - b.width),
                    Math.abs(a.height - b.height),
                ),
            };
        }, FIRST);
        expect(ring.borderColor).toBe(ring.expected);
        expect(ring.borderWidth).toBe('1px');
        expect(ring.pointerEvents).toBe('none');
        expect(ring.glow).toContain('inset');
        expect(ring.glow.indexOf('inset')).toBeGreaterThan(0); // an outer glow too
        expect(ring.offBy).toBeLessThanOrEqual(1);

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

    test('h closes the active file and l opens it — each time pinning it back', async ({
        context,
    }) => {
        const page = await openChanges(context);
        await waitForKeybindings(page);

        await page.keyboard.press('h');
        await expect.poll(() => isCollapsed(page, FIRST)).toBe(true);
        await expectToast(page, `Closed ${PR_FILES[0]!.path}`);
        await expect.poll(() => headerTop(page, FIRST)).toBeCloseTo(PINNED_TOP, 0);

        await page.keyboard.press('l');
        await expect.poll(() => isCollapsed(page, FIRST)).toBe(false);
        await expectToast(page, `Opened ${PR_FILES[0]!.path}`);
        await expect.poll(() => headerTop(page, FIRST)).toBeCloseTo(PINNED_TOP, 0);

        // Folding never touched the viewed state.
        expect(await viewedStates(page)).toEqual([
            'false',
            'true',
            'false',
            'false',
            'false',
            'false',
        ]);
        // And the keys never reached the page.
        expect(await seenKeys(page)).not.toContain('h');
        expect(await seenKeys(page)).not.toContain('l');
    });

    test('the cursor follows the reader: scrolling moves the ring to the file under the reading line', async ({
        context,
    }) => {
        const page = await openChanges(context);

        // The reader takes the wheel (which also releases the settling pin)
        // and scrolls until src/index.ts (third file) spans the reading line.
        const distance = await page.evaluate(
            ({id, offset}) => document.getElementById(id)!.getBoundingClientRect().top - offset,
            {id: THIRD, offset: TOOLBAR_HEIGHT + 20},
        );
        await page.mouse.move(400, 300);
        await page.mouse.wheel(0, distance);
        await expect.poll(() => activeAnchor(page)).not.toBe(FIRST);
        // Wherever the wheel actually landed, the ring is on the file that
        // spans the reading line (just under the stuck toolbar).
        const underLine = await page.evaluate(
            (line) => {
                const regions = Array.from(
                    document.querySelectorAll<HTMLElement>('[role="region"][id^="diff-"]'),
                );
                return (
                    regions.find((r) => r.getBoundingClientRect().bottom > line)?.id ??
                    regions[regions.length - 1]!.id
                );
            },
            TOOLBAR_HEIGHT + PIN_GAP + 1,
        );
        await expect.poll(() => activeAnchor(page)).toBe(underLine); // the ring glides for 120 ms

        // K steps back to the previous unviewed file and pins it.
        await page.keyboard.press('Shift+K');
        await expect.poll(() => activeAnchor(page)).toBe(FIRST);
        await page.keyboard.press('j');
        await page.keyboard.press('j');
        await page.keyboard.press('j');
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });

    test('J / K step between unviewed files; v toggles Viewed and carries the cursor on', async ({
        context,
    }) => {
        const page = await openChanges(context);
        await waitForKeybindings(page);

        // J: next unviewed after the first (config.staging is viewed) is src/index.ts.
        await page.keyboard.press('Shift+J');
        await expect.poll(() => activeAnchor(page)).toBe(THIRD);
        await expect.poll(() => headerTop(page, THIRD)).toBeCloseTo(PINNED_TOP, 0);
        // K: back to the first.
        await page.keyboard.press('Shift+K');
        await expect.poll(() => activeAnchor(page)).toBe(FIRST);

        // v marks the active file viewed; autoscroll moves on to src/index.ts.
        await page.keyboard.press('v');
        await expect
            .poll(() => viewedStates(page))
            .toEqual(['true', 'true', 'false', 'false', 'false', 'false']);
        await expect.poll(() => activeAnchor(page)).toBe(THIRD);
        // v again on the new active file toggles it viewed too, and the cursor moves on.
        await page.keyboard.press('v');
        await expect
            .poll(() => viewedStates(page))
            .toEqual(['true', 'true', 'true', 'false', 'false', 'false']);
        await expect.poll(() => activeAnchor(page)).toBe(anchor('src/generated/bundle.yaml'));
    });

    test('a stops autoscroll and drops the ring', async ({context}) => {
        const page = await openChanges(context);

        await pressAndExpectToast(page, 'a', 'GitHub PR Autoscroll disabled');
        await expect.poll(() => activeAnchor(page)).toBeNull();
        await expect(page.locator('#exo-github-active-file')).toHaveCount(0);
    });
});
