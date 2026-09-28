import {Storage} from '@exo/lib/storage';
import {Notifications} from '@exo/lib/toast-notification';

/**
 * The reader's standing mute filters — toast tags (or tag prefixes) they
 * never want to see, on every page. Edited in the popup, stored once in
 * chrome.storage.local, applied by every content script and followed live
 * as the list changes.
 */
export const TOAST_MUTES_KEY = 'exo-toast-mutes';

/** A filter as stored: trimmed and lowercased. Null when nothing is left. */
export function normalizeToastFilter(raw: string): string | null {
    const filter = raw.trim().toLowerCase();
    return filter.length > 0 ? filter : null;
}

export async function getToastMutes(): Promise<string[]> {
    const stored = await Storage.get<unknown>(TOAST_MUTES_KEY);
    return Array.isArray(stored) ? stored.filter((f): f is string => typeof f === 'string') : [];
}

/** Store the list, normalized and de-duplicated, in the order given. */
export async function setToastMutes(filters: string[]): Promise<void> {
    const normalized: string[] = [];
    for (const raw of filters) {
        const filter = normalizeToastFilter(raw);
        if (filter && !normalized.includes(filter)) normalized.push(filter);
    }
    await Storage.set(TOAST_MUTES_KEY, normalized);
}

/**
 * Content-script side: hold the stored filters as mutes and follow every
 * change to the stored list. Returns a stop function that lets go of the
 * storage listener and releases every mute this sync holds — the successor
 * copy of the content script picks the list up itself.
 */
export function syncToastMutes(): () => void {
    const held = new Map<string, () => void>();
    let stopped = false;

    const apply = (filters: string[]) => {
        if (stopped) return;
        const wanted = new Set(filters);
        for (const [filter, release] of held) {
            if (!wanted.has(filter)) {
                release();
                held.delete(filter);
            }
        }
        for (const filter of wanted) {
            if (!held.has(filter)) held.set(filter, Notifications.mute(filter));
        }
    };

    const onChanged = (
        changes: {[key: string]: chrome.storage.StorageChange},
        area: string,
    ): void => {
        if (area !== 'local' || !(TOAST_MUTES_KEY in changes)) return;
        const next = changes[TOAST_MUTES_KEY]?.newValue;
        apply(Array.isArray(next) ? next.filter((f): f is string => typeof f === 'string') : []);
    };

    chrome.storage.onChanged.addListener(onChanged);
    void getToastMutes().then(apply);

    return () => {
        stopped = true;
        chrome.storage.onChanged.removeListener(onChanged);
        for (const release of held.values()) release();
        held.clear();
    };
}
