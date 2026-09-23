import {ShowToastAction} from '@exo/lib/actions/show-toast.action';
import {Tabs} from '@exo/lib/service-worker/tabs';

/**
 * Reload the extension when a new build lands in its directory.
 *
 * Chrome reads an unpacked extension's files from disk on every request, so
 * the worker can watch the stamp every build writes (build-stamp.json, see
 * vite.config.ts) by fetching its own copy of it. A changed stamp means a
 * new build: the worker leaves a note and calls chrome.runtime.reload(). The
 * fresh worker injects the new content script into the open tabs (each
 * copy retires its predecessor — see lib/lifecycle.ts — so no page reloads)
 * and says so once, in the page the user is looking at. The loop is
 * `exo build`, or a save under `exo dev`, and nothing else; dist/ is always
 * the real build, and nothing here depends on a dev server.
 */

const STAMP_FILE = 'build-stamp.json';
const ALARM_NAME = 'exo-rebuild-poll';
/** Unpacked extensions are exempt from the 30 s alarm floor, so this is 1 s there. */
const POLL_SECONDS = 1;
/** storage.session: the stamp this worker last saw. Cleared with the extension. */
const BASELINE_KEY = 'exoBuildStamp';
/** storage.local: the note a worker leaves for its successor before reloading. */
const REBUILD_KEY = 'exoRebuild';
/** A note older than this belongs to some earlier session; ignore it. */
const REBUILD_TTL_MS = 15_000;
/**
 * Chromium terminates an extension that reloads itself more than 5 times in
 * 10 seconds ("reloaded too frequently"). A watch build can land several
 * times in quick succession, so reloads are spaced: a stamp that changes
 * within this gap of the last reload waits for a later reading.
 */
export const MIN_RELOAD_GAP_MS = 2_500;
/** storage.local: when the last self-reload was requested. */
const LAST_RELOAD_KEY = 'exoLastReloadAt';
/** How long the page under test gets for its fresh copy to come up before another page is tried. */
const ANNOUNCE_ATTEMPTS = 15;
const ANNOUNCE_RETRY_MS = 200;

export interface BuildStamp {
    builtAt: string;
}

export interface RebuildNote {
    at: number;
    builtAt: string;
}

/** The stamp on disk right now, or null while dist/ is being rewritten (or has none). */
export async function readBuildStamp(): Promise<BuildStamp | null> {
    try {
        const response = await fetch(chrome.runtime.getURL(STAMP_FILE), {cache: 'no-store'});
        if (!response.ok) return null;
        const data: unknown = await response.json();
        if (typeof data !== 'object' || data === null) return null;
        const {builtAt} = data as {builtAt?: unknown};
        return typeof builtAt === 'string' ? {builtAt} : null;
    } catch {
        return null;
    }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start watching the stamp. The alarm wakes a sleeping worker (and keeps a
 * live one awake); the interval gives 1 s latency even where alarms are
 * floored at 30 s. Idempotent per worker lifetime.
 */
export function watchForRebuild(): void {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === ALARM_NAME) void pollOnce();
    });
    void chrome.alarms.create(ALARM_NAME, {periodInMinutes: POLL_SECONDS / 60});
    if (pollTimer === null) {
        pollTimer = setInterval(() => void pollOnce(), POLL_SECONDS * 1000);
    }
    void pollOnce();
}

/**
 * One reading. The first reading of a worker is its baseline; a later
 * reading that differs leaves a note and reloads the extension. True when
 * a reload was requested.
 */
export async function pollOnce(): Promise<boolean> {
    const stamp = await readBuildStamp();
    if (!stamp) return false;
    const stored = await chrome.storage.session.get(BASELINE_KEY);
    const baseline: unknown = stored[BASELINE_KEY];
    if (baseline === stamp.builtAt) return false;
    // Record the new stamp before reloading: should session storage outlive
    // the reload, the next worker must not reload for the same build.
    if (baseline === undefined) {
        await chrome.storage.session.set({[BASELINE_KEY]: stamp.builtAt});
        return false;
    }
    const now = Date.now();
    const {[LAST_RELOAD_KEY]: lastReloadAt} = await chrome.storage.local.get(LAST_RELOAD_KEY);
    if (typeof lastReloadAt === 'number' && now - lastReloadAt < MIN_RELOAD_GAP_MS) {
        return false; // too soon after the last one: the next reading picks it up
    }
    await chrome.storage.session.set({[BASELINE_KEY]: stamp.builtAt});
    const note: RebuildNote = {at: now, builtAt: stamp.builtAt};
    await chrome.storage.local.set({[REBUILD_KEY]: note, [LAST_RELOAD_KEY]: now});
    chrome.runtime.reload();
    return true;
}

/** Consume the note the previous worker left, if it is fresh. */
export async function takeRebuildNote(): Promise<RebuildNote | null> {
    const stored = await chrome.storage.local.get(REBUILD_KEY);
    const note = stored[REBUILD_KEY] as Partial<RebuildNote> | undefined;
    if (!note) return null;
    await chrome.storage.local.remove(REBUILD_KEY);
    if (typeof note.at !== 'number' || typeof note.builtAt !== 'string') return null;
    if (Date.now() - note.at > REBUILD_TTL_MS) return null;
    console.log(`chrome exoskeleton reloaded for the build of ${note.builtAt}`);
    return {at: note.at, builtAt: note.builtAt};
}

const clock = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString([], {hour12: false});
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function toastIn(tabId: number, message: string, attempts: number): Promise<boolean> {
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            await ShowToastAction.sendToTab(tabId, {message});
            return true;
        } catch {
            if (attempt + 1 < attempts) await sleep(ANNOUNCE_RETRY_MS);
        }
    }
    return false;
}

/**
 * Say once that the new build is live: one toast, in the first page that
 * takes it — the active tab of the focused window first, with time for its
 * fresh content script to come up, then any other page, one try each.
 * Returns the tab that got it, or null.
 */
export async function announceRebuild(note: RebuildNote): Promise<number | null> {
    const message = `New build loaded (built ${clock(note.builtAt)})`;
    const [active] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
    const all = await chrome.tabs.query({});
    const candidates = [active, ...all.filter((tab) => tab?.id !== active?.id)].filter(
        (tab): tab is chrome.tabs.Tab & {id: number} =>
            tab !== undefined && tab.id !== undefined && Tabs.canInjectContent(tab.url),
    );
    for (const [index, tab] of candidates.entries()) {
        if (await toastIn(tab.id, message, index === 0 ? ANNOUNCE_ATTEMPTS : 1)) return tab.id;
    }
    return null;
}
