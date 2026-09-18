import {test, expect} from './fixtures';
import type {BrowserContext, Page} from '@playwright/test';
import {
    openFixturePage,
    waitForKeybindings,
    toastContainer,
    seenKeys,
    resetSeenKeys,
} from './helpers';
import {GDOC_URL, GDOC_HTML} from './fixture-pages';

/**
 * Multi-keystroke sequence integration tests, driven end-to-end through the
 * real content script. The playground tab registers a demo 'gg' chord on
 * Google Docs pages, next to its single 'x' binding — together they exercise
 * every sequence behavior a page can observe: chords firing, prefix keys
 * hidden from the page, abandonment, timeout, and pass-through interplay.
 */

// Must stay above SEQUENCE_TTL_MS in src/lib/keybindings.tsx.
const SEQUENCE_TTL_WAIT_MS = 1_500;

const openToyDoc = async (context: BrowserContext): Promise<Page> => {
    const page = await openFixturePage(context, GDOC_URL, GDOC_HTML);
    await waitForKeybindings(page);
    await resetSeenKeys(page);
    return page;
};

test.describe('multi-keystroke sequences (content script)', () => {
    test('the help overlay lists the sequence as gg', async ({context}) => {
        const page = await openFixturePage(context, GDOC_URL, GDOC_HTML);

        // The overlay can open before the playground has finished its async
        // enablement read and registered the chord, so retry until it lists gg.
        await expect(async () => {
            await page.keyboard.press('Escape');
            await page.keyboard.press('Shift+Slash');
            await expect(page.locator('kbd', {hasText: 'gg'})).toBeVisible({timeout: 500});
        }).toPass({timeout: 5000});
    });

    test('gg fires the sequence and hides both keystrokes from the page', async ({context}) => {
        const page = await openToyDoc(context);

        await page.keyboard.press('g');
        await expect(toastContainer(page)).toContainText('pending');
        expect(await seenKeys(page)).not.toContain('g');

        await page.keyboard.press('g');
        await expect(toastContainer(page)).toContainText('exo keystroke');
        await expect(toastContainer(page)).toContainText('Playground sequence: gg');
        expect(await seenKeys(page)).not.toContain('g');
    });

    test('an abandoned prefix processes the aborting key normally', async ({context}) => {
        const page = await openToyDoc(context);

        await page.keyboard.press('g');
        await page.keyboard.press('x'); // aborts the chord, fires the single binding
        await expect(toastContainer(page)).toContainText('Could not find Google Docs editor');

        expect(await seenKeys(page)).not.toContain('g');
        expect(await seenKeys(page)).not.toContain('x');
        await expect(toastContainer(page)).not.toContainText('Playground sequence: gg');
    });

    test('a pending sequence times out and resets', async ({context}) => {
        const page = await openToyDoc(context);

        await page.keyboard.press('g');
        await expect(toastContainer(page)).toContainText('pending');
        await page.waitForTimeout(SEQUENCE_TTL_WAIT_MS);
        await expect(toastContainer(page)).not.toContainText('pending');

        // The next press starts a fresh chord rather than completing the
        // stale one.
        await page.keyboard.press('g');
        await expect(toastContainer(page)).toContainText('pending');
        await expect(toastContainer(page)).not.toContainText('Playground sequence: gg');
    });

    test('hovering the pending banner holds the chord window open past the TTL', async ({
        context,
    }) => {
        const page = await openToyDoc(context);

        await page.keyboard.press('g');
        await expect(toastContainer(page)).toContainText('pending');

        // The banner IS the TTL: hovering pauses its countdown, which must
        // genuinely hold the sequence window open — no hidden timer.
        await page
            .locator('#exo-notification-container .chrome-ext-notification', {hasText: 'pending'})
            .hover();
        await page.waitForTimeout(SEQUENCE_TTL_WAIT_MS);
        await expect(toastContainer(page)).toContainText('pending');

        await page.keyboard.press('g');
        await expect(toastContainer(page)).toContainText('Playground sequence: gg');
    });

    test('single bindings fire on the first press, with no pending state', async ({context}) => {
        const page = await openToyDoc(context);

        await page.keyboard.press('x');
        await expect(toastContainer(page)).toContainText('Could not find Google Docs editor');
        await expect(toastContainer(page)).not.toContainText('pending');
    });

    test('pass-through hands the prefix key to the page, then the chord still works', async ({
        context,
    }) => {
        const page = await openToyDoc(context);

        await page.keyboard.press('Control+v');
        await expect(toastContainer(page)).toContainText('pass-through');
        await page.keyboard.press('g');
        await expect.poll(() => seenKeys(page)).toContain('g');
        await expect(toastContainer(page)).not.toContainText('pending');

        await resetSeenKeys(page);
        await page.keyboard.press('g');
        await page.keyboard.press('g');
        await expect(toastContainer(page)).toContainText('Playground sequence: gg');
        expect(await seenKeys(page)).not.toContain('g');
    });
});
