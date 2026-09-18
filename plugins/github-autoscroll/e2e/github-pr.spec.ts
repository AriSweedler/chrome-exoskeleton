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
import {PR_URL, PR_HTML} from './fixture-pages';

/**
 * These tests exercise the real content script in Chromium to prove two things
 * a unit test cannot:
 *   1. An exo keystroke actually fires end-to-end (the toast renders and the
 *      handler runs) — this is exactly what regressed when the toast threw.
 *   2. The underlying page NEVER receives an exo keystroke (capture phase +
 *      stopImmediatePropagation), while ordinary keys still reach the page.
 *
 * We serve a minimal "toy app" at a real GitHub PR URL so the content script
 * injects and registers its PR keybindings (c / f / ?). The toy app records
 * every keydown its own (main-world) window listener sees.
 */

const openToyPr = (context: BrowserContext): Promise<Page> =>
    openFixturePage(context, PR_URL, PR_HTML);

test.describe('exo keybindings (content script)', () => {
    test('fires its own shortcut and hides that keystroke from the page', async ({context}) => {
        const page = await openToyPr(context);

        // Control: an ordinary key is NOT intercepted and reaches the page.
        await page.keyboard.press('z');
        await expect.poll(() => seenKeys(page)).toContain('z');

        // Now an exo shortcut. '?' opens the help overlay (no navigation).
        await resetSeenKeys(page);
        await page.keyboard.press('Shift+Slash'); // '?'

        // (1) The toast renders — this is precisely what regressed: announce()
        //     must not throw before the handler is scheduled.
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
        // Make the fixture scrollable so the advance is observable.
        await page.evaluate(() => {
            document.body.style.minHeight = '5000px';
        });

        await expect(async () => {
            await page.keyboard.press('d');
            await expect(page.locator('#exo-notification-container')).toContainText(
                'Marked 2 auto-hidden files as viewed (1 already viewed)',
                {timeout: 500},
            );
        }).toPass({timeout: 5000});

        const pressed = await page.evaluate(() =>
            Array.from(document.querySelectorAll('button[class*="MarkAsViewedButton"]')).map(
                (btn) => btn.getAttribute('aria-pressed'),
            ),
        );
        // config.alpha (auto-hidden) and the deleted old-worker.yaml flipped
        // to viewed, config.staging already was; the rendered src/index.ts and
        // the large diff stay untouched.
        expect(pressed).toEqual(['true', 'true', 'false', 'false', 'true']);

        // Each press also advances a viewport, so holding d sweeps the PR.
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });

    test('D shows the auto-hidden files again (undoes d)', async ({context}) => {
        const page = await openToyPr(context);

        await expect(async () => {
            await page.keyboard.press('d');
            await expect(page.locator('#exo-notification-container')).toContainText(
                'Marked 2 auto-hidden files as viewed',
                {timeout: 500},
            );
        }).toPass({timeout: 5000});

        await page.keyboard.press('Shift+D');
        await expect(page.locator('#exo-notification-container')).toContainText(
            'Showed 3 auto-hidden files (unmarked as viewed)',
        );

        const pressed = await page.evaluate(() =>
            Array.from(document.querySelectorAll('button[class*="MarkAsViewedButton"]')).map(
                (btn) => btn.getAttribute('aria-pressed'),
            ),
        );
        // All three auto-hidden files are unmarked — including config.staging,
        // which was viewed before d ran. Non-hidden files stay untouched.
        expect(pressed).toEqual(['false', 'false', 'false', 'false', 'false']);
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
        await page.waitForURL(`${PR_URL}/changes`);
        expect(page.url()).toBe(`${PR_URL}/changes`);
    });

    test('GitHub swallows g for its gg scroll chord; Ctrl+V passes a literal g', async ({
        context,
    }) => {
        // GitHub uses 'g' as its own navigation prefix, but the extension
        // deliberately registers a site-wide 'gg' (scroll to top) there —
        // the Ctrl+V pass-through is the escape hatch for GitHub's g-nav.
        const page = await openFixturePage(context, PR_URL, PR_HTML);
        await waitForKeybindings(page);
        await resetSeenKeys(page);

        // Make the page scrollable and start away from the top.
        await page.evaluate(() => {
            document.body.style.height = '5000px';
            window.scrollTo({top: 3000, behavior: 'instant'});
        });

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
