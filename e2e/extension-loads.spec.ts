import {test, expect} from './fixtures';

test('service worker is registered', async ({context}) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker');
    }
    expect(serviceWorker.url()).toContain('chrome-extension://');
});

test('extension ID is extractable', async ({extensionId}) => {
    expect(extensionId).toBeTruthy();
    expect(extensionId.length).toBeGreaterThan(0);
});

test('extension popup page is accessible', async ({context, extensionId}) => {
    const page = await context.newPage();
    const response = await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    expect(response?.status()).toBe(200);
});
