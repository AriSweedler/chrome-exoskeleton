import fs from 'node:fs';
import path from 'node:path';
import type {BrowserContext} from '@playwright/test';
import {test, expect} from './fixtures';
import {openFixturePage, seenKeys, toastContainer, waitForKeybindings} from './helpers';
import {GDOC_URL, GDOC_HTML} from './fixture-pages';

/**
 * The edit loop, end to end in a real Chromium: a new build stamp in the
 * extension's directory makes the worker reload the extension; the fresh
 * worker injects the new content script into the open tabs, where it
 * retires the copy already there; and it says so once, in the page being
 * looked at. No page reloads, no dev server — exactly what `exo build` (or a
 * save under `exo dev`) does to a loaded extension.
 *
 * One thing the harness must do that a real profile already has: Developer
 * mode. Load unpacked implies it, but Playwright's fresh profile has it off,
 * and since Chrome 134 an unpacked extension that reloads into a profile
 * without it is left disabled (extension_management.cc,
 * IsAllowedByUnpackedDeveloperModePolicy).
 */

const dist = path.resolve(process.env.EXO_DIST ?? 'dist');
const stampPath = path.join(dist, 'build-stamp.json');

type Worker = {
    evaluate: <T, A>(fn: (arg: A) => Promise<T> | T, arg?: A) => Promise<T>;
    waitForEvent: (event: 'close') => Promise<unknown>;
};

/** The extension's worker, which may still be registering right after the first page. */
async function serviceWorker(context: BrowserContext): Promise<Worker> {
    const [existing] = context.serviceWorkers();
    const worker = existing ?? (await context.waitForEvent('serviceworker'));
    return worker as unknown as Worker;
}

const baselineTaken = (worker: Worker) =>
    worker.evaluate(() =>
        chrome.storage.session
            .get('exoBuildStamp')
            .then((stored) => (stored.exoBuildStamp as string | undefined) ?? null),
    );

/** Flip the profile's Developer mode switch, as Load unpacked would have. */
async function enableDeveloperMode(context: BrowserContext): Promise<void> {
    const page = await context.newPage();
    await page.goto('chrome://extensions');
    await page.evaluate(
        () =>
            new Promise<void>((resolve) => {
                const api = (
                    chrome as unknown as {
                        developerPrivate: {
                            updateProfileConfiguration(
                                update: {inDeveloperMode: boolean},
                                callback: () => void,
                            ): void;
                        };
                    }
                ).developerPrivate;
                api.updateProfileConfiguration({inDeveloperMode: true}, () => resolve());
            }),
    );
    await page.close();
}

test.describe('the edit loop', () => {
    let original: string;

    test.beforeEach(() => {
        original = fs.readFileSync(stampPath, 'utf8');
    });

    test.afterEach(() => {
        fs.writeFileSync(stampPath, original);
    });

    test('a new build goes live: the extension reloads, the pages keep their state, one toast', async ({
        context,
    }) => {
        await enableDeveloperMode(context);

        // Two tabs with the content script; the second is the one being looked at.
        const background = await openFixturePage(context, GDOC_URL, GDOC_HTML);
        const page = await openFixturePage(context, GDOC_URL, GDOC_HTML);
        await page.bringToFront();
        await waitForKeybindings(page); // the first copy is live
        let loads = 0;
        background.on('load', () => loads++);
        page.on('load', () => loads++);

        const worker = await serviceWorker(context);
        await expect.poll(() => baselineTaken(worker)).not.toBeNull();

        const ended = worker.waitForEvent('close');
        const revived = context.waitForEvent('serviceworker');
        const started = Date.now();
        fs.writeFileSync(stampPath, JSON.stringify({builtAt: new Date().toISOString()}));

        // chrome.runtime.reload(): the old worker ends, a new one starts.
        await ended;
        const reloadMs = Date.now() - started;
        await revived;

        // The new build announces itself once, in the active page…
        await expect(toastContainer(page)).toContainText('New build loaded', {timeout: 10_000});
        console.log(
            `[auto-reload] stamp → runtime.reload() ${reloadMs} ms → new build live ${Date.now() - started} ms`,
        );
        // …without reloading any page, and not in the background tab.
        await page.waitForTimeout(300);
        expect(loads).toBe(0);
        expect(
            await background.evaluate(
                () => document.getElementById('exo-notification-container')?.textContent ?? '',
            ),
        ).not.toContain('New build loaded');

        // The old copy of the content script let go: one copy answers the
        // keyboard — one overlay, one toast container — and the page itself
        // still never sees an exo key.
        await page.keyboard.press('Shift+Slash');
        await expect(page.getByText('Keyboard Shortcuts')).toHaveCount(1);
        await expect(toastContainer(page)).toHaveCount(1);
        expect(await seenKeys(page)).not.toContain('?');
    });

    test('the copy of the content script in a page lets go when a newer copy announces itself', async ({
        context,
    }) => {
        const page = await openFixturePage(context, GDOC_URL, GDOC_HTML);
        const worker = await serviceWorker(context);

        // The copy in the page is live: it owns the keyboard and shows toasts.
        await waitForKeybindings(page);
        await expect(toastContainer(page)).toHaveCount(1);

        // What a fresh copy does first (lib/lifecycle.ts): announce itself on
        // the document. Fire that announcement from the extension's world, as
        // the new copy would.
        await worker.evaluate(async () => {
            const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
            if (!tab?.id) throw new Error('no active tab');
            await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                func: () =>
                    document.dispatchEvent(
                        new Event(`${chrome.runtime.id}:content-script-replaced`),
                    ),
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
