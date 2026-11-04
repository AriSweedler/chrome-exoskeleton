import fs from 'fs';
import {test, expect} from '@exo-e2e/fixtures';
import {
    openFixturePage,
    waitForKeybindings,
    expectToast,
    readClipboardText,
} from '@exo-e2e/helpers';

const PAGE_URL = 'https://example.com/some-page';
const PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>Example Fixture Page</title></head>
<body><h1>Hello</h1></body>
</html>`;

test.describe('Cmd+Shift+D save page for Claude (content-script keybinding)', () => {
    test('downloads the page as slug.epoch.html and copies a prompt naming it', async ({
        context,
    }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
            origin: new URL(PAGE_URL).origin,
        });
        const page = await openFixturePage(context, PAGE_URL, PAGE_HTML);
        await waitForKeybindings(page);

        const before = Math.floor(Date.now() / 1000);
        const downloading = page.waitForEvent('download');
        await page.keyboard.press('Meta+Shift+D');
        const download = await downloading;

        // The title is 20 characters of slug exactly; the stamp is epoch seconds.
        const filename = download.suggestedFilename();
        const match = filename.match(/^example-fixture-page\.(\d+)\.html$/);
        expect(match, filename).not.toBeNull();
        const epoch = Number(match![1]);
        expect(epoch).toBeGreaterThanOrEqual(before);
        expect(epoch).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));

        const saved = fs.readFileSync((await download.path())!, 'utf8');
        expect(saved).toMatch(/^<!DOCTYPE html>\n<!-- saved by chrome-exoskeleton from /);
        expect(saved).toContain(PAGE_URL);
        expect(saved).toContain('<h1>Hello</h1>');
        expect(saved).not.toContain('exo-notification-container');

        await expectToast(page, /prompt copied/);
        expect(await readClipboardText(page)).toBe(`Find the webpage @~/Downloads/${filename}`);
    });
});
