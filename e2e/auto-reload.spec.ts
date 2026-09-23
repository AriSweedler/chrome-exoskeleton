import fs from 'node:fs';
import path from 'node:path';
import {test, expect} from './fixtures';
import {openFixturePage, seenKeys, toastContainer} from './helpers';
import {GDOC_URL, GDOC_HTML} from './fixture-pages';

/**
 * The edit loop's two halves, each proven in a real Chromium:
 *
 *   1. A new build stamp in the extension's directory makes the worker
 *      reload the extension (`exo build`, or a save under `exo dev`).
 *   2. A fresh copy of the content script arriving in a page retires the
 *      copy already there, so the page never has to reload and one copy
 *      answers the keyboard.
 *
 * They are proven separately because Playwright loads the extension with
 * --load-extension, and Chromium does not bring a command-line extension
 * back after chrome.runtime.reload() (its URLs answer ERR_BLOCKED_BY_CLIENT
 * afterwards). A Load-unpacked extension — how dist/ is loaded for real —
 * comes back the way the card's Reload button brings it back; that half is
 * Chrome's, not ours.
 */

const dist = path.resolve(process.env.EXO_DIST ?? 'dist');
const stampPath = path.join(dist, 'build-stamp.json');

type Worker = {
    evaluate: <T, A>(fn: (arg: A) => Promise<T> | T, arg?: A) => Promise<T>;
    waitForEvent: (event: 'close') => Promise<unknown>;
};

const baselineTaken = (worker: Worker) =>
    worker.evaluate(() =>
        chrome.storage.session
            .get('exoBuildStamp')
            .then((stored) => (stored.exoBuildStamp as string | undefined) ?? null),
    );

test.describe('the edit loop', () => {
    test('a new build stamp makes the worker reload the extension within a second or two', async ({
        context,
    }) => {
        const original = fs.readFileSync(stampPath, 'utf8');
        try {
            await openFixturePage(context, GDOC_URL, GDOC_HTML);
            const [worker] = context.serviceWorkers() as unknown as Worker[];
            await expect.poll(() => baselineTaken(worker)).not.toBeNull();

            // chrome.runtime.reload() ends this worker: that is the observable.
            const ended = worker.waitForEvent('close');
            const started = Date.now();
            fs.writeFileSync(stampPath, JSON.stringify({builtAt: new Date().toISOString()}));
            await ended;
            const latency = Date.now() - started;
            console.log(`[auto-reload] stamp → runtime.reload() in ${latency} ms`);
            expect(latency).toBeLessThan(3_000);
        } finally {
            fs.writeFileSync(stampPath, original);
        }
    });

    test('the copy of the content script in a page lets go when a newer copy announces itself', async ({
        context,
    }) => {
        const page = await openFixturePage(context, GDOC_URL, GDOC_HTML);
        const [worker] = context.serviceWorkers() as unknown as Worker[];

        // The copy in the page is live: it owns the keyboard and shows toasts.
        await page.keyboard.press('Shift+Slash');
        await expect(page.getByText('Keyboard Shortcuts')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(toastContainer(page)).toHaveCount(1);

        // What a fresh copy does first (lib/lifecycle.ts): announce itself on
        // the document. Re-injecting the same file here would be a no-op —
        // the isolated world's module map already holds it; a real reload
        // gives the new copy a new world — so fire the announcement itself,
        // from the extension's world, as the new copy would.
        await worker.evaluate(async () => {
            const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
            if (!tab?.id) throw new Error('no active tab');
            await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                func: () => document.dispatchEvent(new Event('exo:content-script-replaced')),
            });
        });

        // The old copy let go: its toast container is gone, it no longer
        // answers the keyboard, and the key now reaches the page.
        await expect(toastContainer(page)).toHaveCount(0);
        await page.keyboard.press('Shift+Slash');
        await expect.poll(() => seenKeys(page)).toContain('?');
        await expect(page.getByText('Keyboard Shortcuts')).toHaveCount(0);
        await expect(toastContainer(page)).toHaveCount(0);
    });
});
