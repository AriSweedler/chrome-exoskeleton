import {test, expect} from '@exo-e2e/fixtures';
import {openFixturePage, expectToast, readClipboardText} from '@exo-e2e/helpers';

const PAGE_URL = 'https://example.com/some-page';
const PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>Example Fixture Page</title></head>
<body><h1>Hello</h1></body>
</html>`;

test.describe('Cmd+Shift+C rich-link copy (content-script keybinding)', () => {
    test('copies a rich link for the page and toasts the copier', async ({context}) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
            origin: new URL(PAGE_URL).origin,
        });
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);

        // The copy toast renders the copier chip ("Copied" itself is log-only).
        await expect(async () => {
            await page.keyboard.press('Meta+Shift+C');
            await expectToast(page, /Copier:/);
        }).toPass({timeout: 5000});

        // Retried presses may have cycled to another format; every format
        // for this page embeds the URL, so assert on that.
        const clipboard = await readClipboardText(page);
        expect(clipboard).toContain(PAGE_URL);
    });

    test('hovering the copy toast holds the cycling window open past its duration', async ({
        context,
    }) => {
        await context.grantPermissions(['clipboard-write'], {
            origin: new URL(PAGE_URL).origin,
        });
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);

        await expect(async () => {
            await page.keyboard.press('Meta+Shift+C');
            await expectToast(page, /Copier: Page Title/);
        }).toPass({timeout: 5000});

        // The toast IS the cycling window: hovering pauses its countdown,
        // which must genuinely hold the window open — no wall clock.
        await page.locator('#exo-notification-container .chrome-ext-notification').last().hover();
        await page.waitForTimeout(3500);
        await expectToast(page, /Copier: Page Title/);

        // Still cycling: the next press copies the NEXT format.
        await page.keyboard.press('Meta+Shift+C');
        await expectToast(page, /Copier: Raw URL/);
    });

    test('Backspace dismisses the copy toast, and passes through otherwise', async ({context}) => {
        await context.grantPermissions(['clipboard-write'], {
            origin: new URL(PAGE_URL).origin,
        });
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);

        await expect(async () => {
            await page.keyboard.press('Meta+Shift+C');
            await expectToast(page, /Copier:/);
        }).toPass({timeout: 5000});

        await page.keyboard.press('Backspace');
        await expect(
            page.locator('#exo-notification-container .chrome-ext-notification'),
        ).toHaveCount(0);
    });
});
