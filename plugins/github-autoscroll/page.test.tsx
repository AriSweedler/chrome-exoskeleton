import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

type ChromeMessageListener = (
    message: {type: string},
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
) => boolean | void;

declare global {
    interface Window {
        __ghAutoScrollStop?: (() => void) | undefined;
    }
}

/** Find the listener that handles GitHub autoscroll messages */
function findGitHubListener(listeners: ChromeMessageListener[]): ChromeMessageListener {
    for (const listener of listeners) {
        const probe = vi.fn();
        const handled = listener(
            {type: 'GITHUB_AUTOSCROLL_GET_STATUS'},
            {} as chrome.runtime.MessageSender,
            probe,
        );
        if (handled === true) {
            return listener;
        }
    }
    throw new Error('No GitHub autoscroll listener found');
}

describe('GitHub Autoscroll Content Script Integration', () => {
    let messageListeners: ChromeMessageListener[] = [];

    beforeEach(async () => {
        messageListeners = [];
        vi.stubGlobal('chrome', {
            runtime: {
                onMessage: {
                    addListener: vi.fn((listener) => {
                        messageListeners.push(listener);
                    }),
                },
                sendMessage: vi.fn(),
            },
            storage: {
                local: {
                    get: vi.fn((_key, callback) => {
                        callback({});
                    }),
                },
            },
            tabs: {
                query: vi.fn(),
                sendMessage: vi.fn(),
            },
        });
        window.__ghAutoScrollStop = undefined;

        // Mock DOM elements needed for initialization
        document.body.innerHTML = '';

        // Reset module registry to ensure fresh imports
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('registers message listener on load', async () => {
        await import('@exo/plugins/github-autoscroll/page');
        expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('responds to GITHUB_AUTOSCROLL_GET_STATUS when inactive', async () => {
        await import('@exo/plugins/github-autoscroll/page');

        const githubListener = findGitHubListener(messageListeners);

        const sendResponse = vi.fn();
        githubListener({type: 'GITHUB_AUTOSCROLL_GET_STATUS'}, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({active: false});
    });

    it('responds to GITHUB_AUTOSCROLL_GET_STATUS when active', async () => {
        await import('@exo/plugins/github-autoscroll/page');

        const githubListener = findGitHubListener(messageListeners);

        // Simulate autoscroll being active
        window.__ghAutoScrollStop = vi.fn();

        const sendResponse = vi.fn();
        githubListener({type: 'GITHUB_AUTOSCROLL_GET_STATUS'}, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({active: true});
    });

    describe("'a' toggles autoscroll on PR pages", () => {
        const pressA = () => {
            const event = new KeyboardEvent('keydown', {key: 'a', cancelable: true, bubbles: true});
            document.body.dispatchEvent(event);
            return event;
        };

        // A PR page with files, but not the changes tab — so the 500ms
        // auto-run never fires and only the keystroke drives state.
        const PR_URL = 'https://github.com/owner/repo/pull/123';

        it('starts autoscroll when inactive, then stops it', async () => {
            vi.stubGlobal('location', {href: PR_URL});
            document.body.innerHTML = `
                <div data-hpc="true">
                    <div class="d-flex flex-column gap-3">
                        <div class="Diff-module__diffHeaderWrapper--abc123">
                            <button aria-pressed="false">Viewed</button>
                        </div>
                    </div>
                </div>
            `;

            await import('@exo/plugins/github-autoscroll/page');

            expect(pressA().defaultPrevented).toBe(true);
            await vi.waitFor(() => expect(window.__ghAutoScrollStop).toBeTypeOf('function'));

            const stopFn = vi.fn();
            window.__ghAutoScrollStop = stopFn;
            pressA();
            await vi.waitFor(() => expect(stopFn).toHaveBeenCalled());

            const {keybindings} = await import('@exo/lib/keybindings');
            keybindings.unlisten();
        });

        it('toasts instead of starting when the page has no files', async () => {
            vi.stubGlobal('location', {href: PR_URL});

            await import('@exo/plugins/github-autoscroll/page');

            pressA();
            await vi.waitFor(() => expect(document.body.textContent).toContain('No files found'));
            expect(window.__ghAutoScrollStop).toBeUndefined();

            const {keybindings} = await import('@exo/lib/keybindings');
            keybindings.unlisten();
        });

        it('leaves a alone on non-PR GitHub pages', async () => {
            vi.stubGlobal('location', {href: 'https://github.com/owner/repo'});

            await import('@exo/plugins/github-autoscroll/page');

            expect(pressA().defaultPrevented).toBe(false);

            const {keybindings} = await import('@exo/lib/keybindings');
            keybindings.unlisten();
        });
    });

    it('returns false for unknown message types', async () => {
        await import('@exo/plugins/github-autoscroll/page');

        const githubListener = findGitHubListener(messageListeners);

        const sendResponse = vi.fn();
        const result = githubListener({type: 'UNKNOWN_MESSAGE'}, {}, sendResponse);

        expect(result).toBe(false);
        expect(sendResponse).not.toHaveBeenCalled();
    });

    describe('Auto-run on load', () => {
        it('auto-runs on GitHub PR changes page with default setting', async () => {
            // Mock GitHub PR page URL
            vi.stubGlobal('location', {
                href: 'https://github.com/owner/repo/pull/123/changes',
            });

            // Mock GitHub PR page structure with files
            document.body.innerHTML = `
                <div data-hpc="true">
                    <div class="d-flex flex-column gap-3">
                        <div class="Diff-module__diffHeaderWrapper--abc123">
                            <button aria-pressed="false">Viewed</button>
                        </div>
                    </div>
                </div>
            `;

            // Mock storage to return undefined (default behavior)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chrome.storage.local.get = vi.fn((_key: any, callback: any) => {
                callback({});
            }) as unknown as typeof chrome.storage.local.get;

            await import('@exo/plugins/github-autoscroll/page');

            // Wait for auto-run (500ms delay + buffer)
            await new Promise((resolve) => setTimeout(resolve, 600));

            expect(window.__ghAutoScrollStop).toBeTypeOf('function');
        });

        it('respects exorun-github-autoscroll storage setting (false)', async () => {
            // Mock GitHub PR page URL
            vi.stubGlobal('location', {
                href: 'https://github.com/owner/repo/pull/123/changes',
            });

            // Mock GitHub PR page structure with files
            document.body.innerHTML = `
                <div data-hpc="true">
                    <div class="d-flex flex-column gap-3">
                        <div class="Diff-module__diffHeaderWrapper--abc123">
                            <button aria-pressed="false">Viewed</button>
                        </div>
                    </div>
                </div>
            `;

            // Mock storage to return false
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chrome.storage.local.get = vi.fn((_key: any, callback: any) => {
                callback({'exorun-github-autoscroll': false});
            }) as unknown as typeof chrome.storage.local.get;

            await import('@exo/plugins/github-autoscroll/page');

            // Trigger the load event
            const loadEvent = new Event('load');
            window.dispatchEvent(loadEvent);

            // Wait for async operations
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(window.__ghAutoScrollStop).toBeUndefined();
        });

        it('does not auto-run on non-GitHub pages', async () => {
            // Mock non-GitHub URL
            vi.stubGlobal('location', {
                href: 'https://example.com',
            });

            // Mock storage to return true (auto-run enabled)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chrome.storage.local.get = vi.fn((_key: any, callback: any) => {
                callback({'exorun-github-autoscroll': true});
            }) as unknown as typeof chrome.storage.local.get;

            await import('@exo/plugins/github-autoscroll/page');

            // Trigger the load event
            const loadEvent = new Event('load');
            window.dispatchEvent(loadEvent);

            // Wait for async operations
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(window.__ghAutoScrollStop).toBeUndefined();
        });

        it('does not auto-run if autoscroll is already active (race condition)', async () => {
            // Mock GitHub PR page URL
            vi.stubGlobal('location', {
                href: 'https://github.com/owner/repo/pull/123/changes',
            });

            // Mock GitHub PR page structure with files
            document.body.innerHTML = `
                <div data-hpc="true">
                    <div class="d-flex flex-column gap-3">
                        <div class="Diff-module__diffHeaderWrapper--abc123">
                            <button aria-pressed="false">Viewed</button>
                        </div>
                    </div>
                </div>
            `;

            // Simulate autoscroll already being active
            const existingStopFn = vi.fn();
            window.__ghAutoScrollStop = existingStopFn;

            // Mock storage to return undefined (default behavior)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            chrome.storage.local.get = vi.fn((_key: any, callback: any) => {
                callback({});
            }) as unknown as typeof chrome.storage.local.get;

            await import('@exo/plugins/github-autoscroll/page');

            // Trigger the load event
            const loadEvent = new Event('load');
            window.dispatchEvent(loadEvent);

            // Wait for async operations
            await new Promise((resolve) => setTimeout(resolve, 0));

            // Should still be the original function, not replaced
            expect(window.__ghAutoScrollStop).toBe(existingStopFn);
        });
    });

    describe('Shared keybinding registry safety', () => {
        it("does not tear down other modules' keybindings on SPA navigation on non-GitHub sites", async () => {
            const location = {href: 'https://example.com/app'};
            vi.stubGlobal('location', location);

            await import('@exo/plugins/github-autoscroll/page');
            const {keybindings} = await import('@exo/lib/keybindings');

            // Another page module registers a binding and starts listening
            keybindings.register({key: 'c', description: 'test binding', handler: vi.fn()});
            keybindings.listen();

            // Simulate an in-page (SPA) navigation: URL change + DOM mutation
            location.href = 'https://example.com/app/other';
            document.body.appendChild(document.createElement('div'));
            await new Promise((resolve) => setTimeout(resolve, 0));

            const event = new KeyboardEvent('keydown', {
                key: 'c',
                cancelable: true,
                bubbles: true,
            });
            document.body.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);

            keybindings.unregister('c');
            keybindings.unlisten();
        });

        it("scrolls to the bottom on 'G' on any GitHub page", async () => {
            vi.stubGlobal('location', {href: 'https://github.com/owner/repo'});
            const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

            await import('@exo/plugins/github-autoscroll/page');

            const event = new KeyboardEvent('keydown', {
                key: 'G',
                shiftKey: true,
                cancelable: true,
                bubbles: true,
            });
            document.body.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);

            await vi.waitFor(() => {
                expect(scrollToSpy).toHaveBeenCalledWith(
                    expect.objectContaining({top: document.documentElement.scrollHeight}),
                );
            });

            const {keybindings} = await import('@exo/lib/keybindings');
            keybindings.unlisten();
        });

        it("scrolls to the top on 'gg' on any GitHub page", async () => {
            vi.stubGlobal('location', {href: 'https://github.com/owner/repo/issues'});
            const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

            await import('@exo/plugins/github-autoscroll/page');

            for (let i = 0; i < 2; i++) {
                const event = new KeyboardEvent('keydown', {
                    key: 'g',
                    cancelable: true,
                    bubbles: true,
                });
                document.body.dispatchEvent(event);
                expect(event.defaultPrevented).toBe(true);
            }

            await vi.waitFor(() => {
                expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({top: 0}));
            });

            const {keybindings} = await import('@exo/lib/keybindings');
            keybindings.unlisten();
        });

        it('registers the PR tab shortcuts when loaded on a GitHub PR page', async () => {
            vi.stubGlobal('location', {href: 'https://github.com/owner/repo/pull/123'});

            await import('@exo/plugins/github-autoscroll/page');

            const event = new KeyboardEvent('keydown', {
                key: 'c',
                cancelable: true,
                bubbles: true,
            });
            document.body.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);

            const {keybindings} = await import('@exo/lib/keybindings');
            keybindings.unlisten();
        });
    });
});
