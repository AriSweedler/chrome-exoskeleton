import type {BrowserContext, Page} from '@playwright/test';
import {expect} from './fixtures';

/**
 * Reusable helpers for driving the real content script against a toy page.
 *
 * The core trick: route-intercept a real production URL and serve fixture
 * HTML there. The extension's content script injects (host matching is by
 * URL, not by server), page modules register their keybindings, and the
 * test drives the page exactly like a user would.
 */

declare global {
    interface Window {
        __seenKeys?: string[];
        __clicks?: string[];
    }
}

/**
 * Instrumentation to embed in fixture HTML (before </body>): records every
 * keydown the main-world page sees, so tests can assert exo keystrokes are
 * hidden from the page while ordinary keys pass through.
 */
export {KEYLOGGER_SNIPPET} from './fixture-pages';

/** Keys the main-world page has seen since load (or the last reset). */
export const seenKeys = (page: Page) => page.evaluate(() => window.__seenKeys ?? []);

/** Clear the main-world keylogger. */
export const resetSeenKeys = (page: Page) => page.evaluate(() => void (window.__seenKeys = []));

/**
 * Open fixture HTML at a real URL and wait for the content script.
 *
 * Routes the whole origin, so in-page navigations (e.g. the 'f' shortcut
 * navigating to /changes) keep resolving to the same fixture.
 *
 * Note: readiness means the content-script entry finished its synchronous
 * module loads. Page modules that await storage (isTabEnabled) register
 * their bindings a beat later — use pressAndExpectToast, which retries.
 */
export async function openFixturePage(
    context: BrowserContext,
    url: string,
    html: string,
): Promise<Page> {
    const page = await context.newPage();
    const {origin} = new URL(url);
    await page.route(`${origin}/**`, (route) =>
        route.fulfill({contentType: 'text/html', body: html}),
    );

    const ready = page.waitForEvent('console', (msg) =>
        msg.text().includes('chrome exoskeleton loaded'),
    );
    await page.goto(url);
    await ready;
    return page;
}

/** The toast container rendered by the content script's Notifications lib. */
export const toastContainer = (page: Page) => page.locator('#exo-notification-container');

/** Assert a toast containing `text` is (or becomes) visible. */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
    await expect(toastContainer(page)).toContainText(text);
}

/**
 * Press a key until its toast appears.
 *
 * Retries the press because page modules register keybindings after an
 * async storage read — a keystroke sent in that window is silently lost.
 * Only use with idempotent shortcuts (all toast-announcing ones are).
 */
export async function pressAndExpectToast(
    page: Page,
    key: string,
    text: string | RegExp,
): Promise<void> {
    await expect(async () => {
        await page.keyboard.press(key);
        await expect(toastContainer(page)).toContainText(text, {timeout: 500});
    }).toPass({timeout: 5000});
}

/**
 * Wait until the page modules have registered their keybindings: retry '?'
 * until the help overlay renders, then close it with Escape.
 *
 * Use this instead of pressAndExpectToast before driving a SEQUENCE — its
 * retry presses would complete the chord instead of being idempotent.
 */
export async function waitForKeybindings(page: Page): Promise<void> {
    await expect(async () => {
        await page.keyboard.press('Shift+Slash');
        await expect(page.getByText('Keyboard Shortcuts')).toBeVisible({timeout: 500});
    }).toPass({timeout: 5000});
    await page.keyboard.press('Escape');
    await expect(page.getByText('Keyboard Shortcuts')).not.toBeVisible();
}

/** Read the clipboard as text from the page's origin. */
export async function readClipboardText(page: Page): Promise<string> {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: new URL(page.url()).origin,
    });
    return page.evaluate(() => navigator.clipboard.readText());
}
