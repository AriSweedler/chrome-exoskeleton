import type {Page} from '@playwright/test';
import {test, expect} from './fixtures';
import {openFixturePage, expectToast, readClipboardText} from './helpers';

const PAGE_URL = 'https://example.com/help-overlay-page';
const PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>Help Overlay Fixture</title></head>
<body><h1>Hello</h1></body>
</html>`;

const overlay = (page: Page) => page.locator('#exo-help-overlay');
const panel = (page: Page) => page.locator('#exo-help-panel');
const groups = (page: Page) => page.locator('#exo-help-groups');

/** Open the help overlay, retrying '?' until the content script has registered. */
async function openHelp(page: Page): Promise<void> {
    await expect(async () => {
        await page.keyboard.press('Shift+Slash');
        await expect(overlay(page)).toBeVisible({timeout: 500});
    }).toPass({timeout: 5000});
}

test.describe('help overlay (real browser)', () => {
    test('clicking a row description runs that binding', async ({context}) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
            origin: new URL(PAGE_URL).origin,
        });
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await openHelp(page);

        // Click the row's TEXT (a child span) — real hit-testing, real bubbling.
        await page.getByText('Copy rich link').click();

        await expect(overlay(page)).toHaveCount(0);
        await expectToast(page, /Copier:/);
        expect(await readClipboardText(page)).toContain(PAGE_URL);
    });

    test('clicking a row’s kbd chip runs that binding too', async ({context}) => {
        await context.grantPermissions(['clipboard-write'], {
            origin: new URL(PAGE_URL).origin,
        });
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await openHelp(page);

        await page.locator('kbd', {hasText: '⌘ + ⇧ + C'}).click();

        await expect(overlay(page)).toHaveCount(0);
        await expectToast(page, /Copier:/);
    });

    test('clicking inside the panel but not on a row keeps the overlay open', async ({context}) => {
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await openHelp(page);

        await page.getByText('Keyboard Shortcuts').click();

        await expect(overlay(page)).toBeVisible();
    });

    test('clicking the backdrop closes the overlay', async ({context}) => {
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await openHelp(page);

        await page.mouse.click(5, 5);

        await expect(overlay(page)).toHaveCount(0);
    });

    test('follows the system dark theme', async ({context}) => {
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await page.emulateMedia({colorScheme: 'dark'});
        await openHelp(page);

        const bg = await panel(page).evaluate((el) => getComputedStyle(el).backgroundColor);
        // hsla(0, 0%, 13%, 1)
        expect(bg).toBe('rgb(33, 33, 33)');
    });

    test('renders light when the system theme is light', async ({context}) => {
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await page.emulateMedia({colorScheme: 'light'});
        await openHelp(page);

        const bg = await panel(page).evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(bg).toBe('rgb(255, 255, 255)');
    });

    test('widens into two columns instead of scrolling on a short, wide screen', async ({
        context,
    }) => {
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await page.setViewportSize({width: 1400, height: 300});
        await openHelp(page);

        const columnCount = await groups(page).evaluate((el) => getComputedStyle(el).columnCount);
        expect(Number(columnCount)).toBeGreaterThanOrEqual(2);

        // The whole point: nothing to scroll.
        const scrolls = await panel(page).evaluate((el) => el.scrollHeight > el.clientHeight);
        expect(scrolls).toBe(false);
    });

    test('stays single-column (and may scroll) on a thin screen', async ({context}) => {
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await page.setViewportSize({width: 360, height: 300});
        await openHelp(page);

        const columnCount = await groups(page).evaluate((el) => getComputedStyle(el).columnCount);
        expect(columnCount).toBe('1');
    });

    test('an inactive guarded row shows no affordance and its click is inert', async ({
        context,
    }) => {
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await openHelp(page);

        // Clear the '?' announce toast so the Backspace row's guard
        // (Notifications.hasVisible) is false.
        await page.keyboard.press('Backspace');
        await expect(
            page.locator('#exo-notification-container .chrome-ext-notification'),
        ).toHaveCount(0);

        const row = page.locator('.exo-help-row', {hasText: 'Dismiss notifications'});
        await row.hover();
        await expect(row).toHaveCSS('cursor', 'default');
        await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

        // Clicking the dead row does nothing — the overlay stays open.
        await row.click();
        await expect(overlay(page)).toBeVisible();
    });

    test('an active row paints the pointer cursor and highlight on hover', async ({context}) => {
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await openHelp(page);

        const row = page.locator('.exo-help-row', {hasText: 'Copy rich link'});
        await row.hover();
        await expect(row).toHaveCSS('cursor', 'pointer');
        await expect(row).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    });

    test('refits the columns when the window resizes while open', async ({context}) => {
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await page.setViewportSize({width: 1400, height: 300});
        await openHelp(page);

        const columnCount = () => groups(page).evaluate((el) => getComputedStyle(el).columnCount);
        expect(Number(await columnCount())).toBeGreaterThanOrEqual(2);

        await page.setViewportSize({width: 360, height: 700});
        await expect(async () => {
            expect(await columnCount()).toBe('1');
        }).toPass({timeout: 2000});
    });

    test('q closes the overlay from the keyboard', async ({context}) => {
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await openHelp(page);

        await page.keyboard.press('q');

        await expect(overlay(page)).toHaveCount(0);
    });
});
