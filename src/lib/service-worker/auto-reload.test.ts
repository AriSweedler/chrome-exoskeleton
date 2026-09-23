import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {
    MIN_RELOAD_GAP_MS,
    announceRebuild,
    pollOnce,
    readBuildStamp,
    takeRebuildNote,
    watchForRebuild,
} from '@exo/lib/service-worker/auto-reload';

/** A chrome stub with in-memory storage areas and a scriptable tab list. */
function stubChrome() {
    const session: Record<string, unknown> = {};
    const local: Record<string, unknown> = {};
    const area = (store: Record<string, unknown>) => ({
        get: vi.fn(async (key: string) => (key in store ? {[key]: store[key]} : {})),
        set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(store, items)),
        remove: vi.fn(async (key: string) => void delete store[key]),
    });
    const tabs: Array<{id: number; url: string; active?: boolean}> = [
        {id: 1, url: 'https://example.com/other'},
        {id: 7, url: 'https://github.com/o/r/pull/1/changes', active: true},
        {id: 9, url: 'chrome://extensions'},
    ];
    /** Tabs whose content script answers a message. */
    const answering = new Set<number>();
    const chrome = {
        runtime: {
            getURL: (file: string) => `chrome-extension://abc/${file}`,
            reload: vi.fn(),
            lastError: undefined as {message: string} | undefined,
        },
        storage: {session: area(session), local: area(local)},
        alarms: {
            create: vi.fn(async () => {}),
            onAlarm: {addListener: vi.fn()},
        },
        tabs: {
            query: vi.fn(async (query: {active?: boolean}) =>
                query.active ? tabs.filter((tab) => tab.active) : tabs,
            ),
            sendMessage: vi.fn(
                (
                    tabId: number,
                    _message: unknown,
                    callback: (response: {success: boolean; data?: unknown}) => void,
                ) => {
                    if (answering.has(tabId)) {
                        chrome.runtime.lastError = undefined;
                        callback({success: true});
                    } else {
                        chrome.runtime.lastError = {message: 'Receiving end does not exist'};
                        callback(undefined as never);
                    }
                },
            ),
        },
    };
    vi.stubGlobal('chrome', chrome);
    return {chrome, session, local, tabs, answering};
}

function stubStamp(body: unknown, ok = true): void {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ok, json: async () => body})),
    );
}

describe('auto-reload', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    describe('readBuildStamp', () => {
        it('reads the stamp from the extension directory, uncached', async () => {
            stubChrome();
            stubStamp({builtAt: '2026-09-23T12:00:00.000Z'});
            expect(await readBuildStamp()).toEqual({builtAt: '2026-09-23T12:00:00.000Z'});
            expect(fetch).toHaveBeenCalledWith('chrome-extension://abc/build-stamp.json', {
                cache: 'no-store',
            });
        });

        it('is null for a missing, malformed or unreadable stamp (mid-build)', async () => {
            stubChrome();
            stubStamp({}, true);
            expect(await readBuildStamp()).toBeNull();
            stubStamp(null, false);
            expect(await readBuildStamp()).toBeNull();
            vi.stubGlobal(
                'fetch',
                vi.fn(async () => Promise.reject(new Error('mid-build'))),
            );
            expect(await readBuildStamp()).toBeNull();
        });
    });

    describe('pollOnce', () => {
        it("takes the worker's first reading as the baseline without reloading", async () => {
            const {chrome, session} = stubChrome();
            stubStamp({builtAt: 'v1'});
            expect(await pollOnce()).toBe(false);
            expect(session.exoBuildStamp).toBe('v1');
            expect(chrome.runtime.reload).not.toHaveBeenCalled();
        });

        it('reloads on a changed stamp, leaving a note for the next worker', async () => {
            const {chrome, session, local} = stubChrome();
            session.exoBuildStamp = 'v1';
            stubStamp({builtAt: 'v2'});
            vi.setSystemTime(1_000);
            expect(await pollOnce()).toBe(true);
            expect(chrome.runtime.reload).toHaveBeenCalledTimes(1);
            expect(session.exoBuildStamp).toBe('v2'); // recorded before the reload
            expect(local.exoRebuild).toEqual({at: 1_000, builtAt: 'v2'});
        });

        it('spaces reloads out so Chromium never sees a reload storm', async () => {
            const {chrome, session, local} = stubChrome();
            session.exoBuildStamp = 'v1';
            local.exoLastReloadAt = 1_000;
            stubStamp({builtAt: 'v2'});
            vi.setSystemTime(1_000 + MIN_RELOAD_GAP_MS - 1);
            expect(await pollOnce()).toBe(false);
            expect(chrome.runtime.reload).not.toHaveBeenCalled();
            expect(session.exoBuildStamp).toBe('v1'); // still pending

            vi.setSystemTime(1_000 + MIN_RELOAD_GAP_MS);
            expect(await pollOnce()).toBe(true);
            expect(chrome.runtime.reload).toHaveBeenCalledTimes(1);
            expect(local.exoLastReloadAt).toBe(1_000 + MIN_RELOAD_GAP_MS);
        });

        it('does nothing while the stamp is unchanged or unreadable', async () => {
            const {chrome, session} = stubChrome();
            session.exoBuildStamp = 'v1';
            stubStamp({builtAt: 'v1'});
            expect(await pollOnce()).toBe(false);
            stubStamp(null, false);
            expect(await pollOnce()).toBe(false);
            expect(chrome.runtime.reload).not.toHaveBeenCalled();
        });
    });

    describe('watchForRebuild', () => {
        it('polls at once, on a 1 s interval and on its alarm', async () => {
            const {chrome} = stubChrome();
            stubStamp({builtAt: 'v1'});
            watchForRebuild();
            expect(chrome.alarms.create).toHaveBeenCalledWith('exo-rebuild-poll', {
                periodInMinutes: 1 / 60,
            });
            await vi.advanceTimersByTimeAsync(0);
            expect(fetch).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(2_000);
            expect(fetch).toHaveBeenCalledTimes(3);

            const onAlarm = chrome.alarms.onAlarm.addListener.mock.calls[0][0] as (alarm: {
                name: string;
            }) => void;
            onAlarm({name: 'other'});
            onAlarm({name: 'exo-rebuild-poll'});
            await vi.advanceTimersByTimeAsync(0);
            expect(fetch).toHaveBeenCalledTimes(4);
        });
    });

    describe('takeRebuildNote', () => {
        it('consumes a fresh note', async () => {
            const {local} = stubChrome();
            vi.setSystemTime(10_000);
            local.exoRebuild = {at: 9_000, builtAt: 'v2'};
            expect(await takeRebuildNote()).toEqual({at: 9_000, builtAt: 'v2'});
            expect(local.exoRebuild).toBeUndefined();
        });

        it('drops a stale or malformed note, and is null on an ordinary start', async () => {
            const {local} = stubChrome();
            vi.setSystemTime(100_000);
            local.exoRebuild = {at: 1_000, builtAt: 'v2'};
            expect(await takeRebuildNote()).toBeNull();
            expect(local.exoRebuild).toBeUndefined();
            local.exoRebuild = {builtAt: 'v2'};
            expect(await takeRebuildNote()).toBeNull();
            expect(await takeRebuildNote()).toBeNull();
        });
    });

    describe('announceRebuild', () => {
        const note = {at: 0, builtAt: '2026-09-23T12:00:00.000Z'};

        it('toasts once, in the active tab, once its content script answers', async () => {
            const {chrome, answering} = stubChrome();
            const announced = announceRebuild(note);
            // The fresh copy comes up after a couple of misses.
            await vi.advanceTimersByTimeAsync(450);
            answering.add(7);
            await vi.advanceTimersByTimeAsync(200);
            expect(await announced).toBe(7);

            const toasts = chrome.tabs.sendMessage.mock.calls.filter(([id]) => id === 7);
            expect(toasts.length).toBeGreaterThan(1); // retried until it answered
            expect(toasts[toasts.length - 1]?.[1]).toEqual({
                type: 'SHOW_TOAST',
                payload: {
                    message: expect.stringMatching(/^New build loaded \(built \d\d:\d\d:\d\d\)$/),
                },
            });
            expect(chrome.tabs.sendMessage.mock.calls.some(([id]) => id === 1)).toBe(false);
        });

        it('falls back to the first other page that answers, skipping chrome pages', async () => {
            const {chrome, answering} = stubChrome();
            answering.add(1);
            const announced = announceRebuild(note);
            await vi.advanceTimersByTimeAsync(15 * 200 + 50);
            expect(await announced).toBe(1);
            expect(chrome.tabs.sendMessage.mock.calls.some(([id]) => id === 9)).toBe(false);
        });

        it('is null when no page can show it', async () => {
            stubChrome();
            const announced = announceRebuild(note);
            await vi.advanceTimersByTimeAsync(15 * 200 + 50);
            expect(await announced).toBeNull();
        });
    });
});
