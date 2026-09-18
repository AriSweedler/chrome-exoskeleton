import {test, expect} from './fixtures';

test('popup shows the restriction notice when opened as a tab', async ({context, extensionId}) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);

    // Opened as a tab, the "active tab" is the popup itself — a
    // chrome-extension:// URL the content script can never inject into.
    await expect(page.locator('body')).toContainText('not allowed to run on this page');
});
