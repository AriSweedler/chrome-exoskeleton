import {test, expect} from './fixtures';

test('NAVIGATE_WITH_TOAST shows toast after navigation completes', async ({context}) => {
    const page = await context.newPage();
    await page.goto('https://example.com');
    await page.waitForTimeout(1500); // wait for content script to load

    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');

    // Get the Chrome tab ID for this page
    const tabId = await sw.evaluate(async () => {
        const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
        return tab?.id;
    });
    expect(tabId).toBeTruthy();

    // Navigate the tab and send toast after load, retrying until content script is ready
    await sw.evaluate(
        ({tabId, url, toast}) => {
            const sendWithRetry = async () => {
                for (let i = 0; i < 10; i++) {
                    try {
                        await chrome.tabs.sendMessage(tabId, {
                            type: 'SHOW_TOAST',
                            payload: toast,
                        });
                        return;
                    } catch {
                        await new Promise((r) => setTimeout(r, 200));
                    }
                }
            };

            const onUpdated = (updatedId: number, info: chrome.tabs.TabChangeInfo) => {
                if (updatedId !== tabId || info.status !== 'complete') return;
                chrome.tabs.onUpdated.removeListener(onUpdated);
                sendWithRetry();
            };
            chrome.tabs.onUpdated.addListener(onUpdated);
            chrome.tabs.update(tabId, {url});
        },
        {
            tabId: tabId!,
            url: 'https://example.org',
            toast: {message: 'E2E toast test', type: 'success'},
        },
    );

    // Wait for navigation to complete
    await page.waitForURL('**/example.org/**', {timeout: 10000});

    // The toast should appear on the new page
    const toast = page.locator('.chrome-ext-notification');
    await expect(toast).toBeVisible({timeout: 10000});
    await expect(toast).toContainText('E2E toast test');
});
