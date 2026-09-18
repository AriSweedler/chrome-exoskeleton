import {test as base, chromium, type BrowserContext} from '@playwright/test';
import path from 'path';

// `exo build --personal` writes dist-personal/; EXO_DIST selects which build to drive.
const pathToExtension = path.resolve(process.env.EXO_DIST ?? 'dist');

export const test = base.extend<{
    context: BrowserContext;
    extensionId: string;
}>({
    // eslint-disable-next-line no-empty-pattern
    context: async ({}, use) => {
        const context = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            // SLOWMO=400 npx playwright test --headed — slows every action
            // when debugging a spec visually (npm run demo is the guided tour).
            slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : 0,
            args: [
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
            ],
        });
        await use(context);
        await context.close();
    },
    extensionId: async ({context}, use) => {
        // The service worker URL has the form: chrome-extension://<id>/...
        let [serviceWorker] = context.serviceWorkers();
        if (!serviceWorker) {
            serviceWorker = await context.waitForEvent('serviceworker');
        }
        const extensionId = serviceWorker.url().split('/')[2];
        await use(extensionId);
    },
});

export const expect = test.expect;
