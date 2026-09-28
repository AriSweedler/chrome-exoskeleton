import {describe, it, expect, afterEach, vi} from 'vitest';
import chrome from 'sinon-chrome';
import {Notifications} from '@exo/lib/toast-notification';
import {
    TOAST_MUTES_KEY,
    getToastMutes,
    normalizeToastFilter,
    setToastMutes,
    syncToastMutes,
} from '@exo/lib/toast-mutes';

describe('toast mutes', () => {
    afterEach(() => {
        // Every test lets go of what it held; a leak would silence later suites.
        expect(Notifications.mutedFilters()).toEqual([]);
    });

    it('normalizes a filter: trimmed and lowercased; nothing left is null', () => {
        expect(normalizeToastFilter('  Keystroke.Fired ')).toBe('keystroke.fired');
        expect(normalizeToastFilter('   ')).toBeNull();
        expect(normalizeToastFilter('')).toBeNull();
    });

    it('reads the stored list, dropping anything that is not a string', async () => {
        chrome.storage.local.get.yields({[TOAST_MUTES_KEY]: ['keystroke', 3, 'github']});
        expect(await getToastMutes()).toEqual(['keystroke', 'github']);

        chrome.storage.local.get.yields({});
        expect(await getToastMutes()).toEqual([]);
    });

    it('stores the list normalized and de-duplicated, in the order given', async () => {
        chrome.storage.local.set.yields();
        await setToastMutes([' Keystroke ', 'github', 'keystroke', '']);
        expect(
            chrome.storage.local.set.calledWith({[TOAST_MUTES_KEY]: ['keystroke', 'github']}),
        ).toBe(true);
    });

    it('holds the stored filters, follows changes to the stored list, and lets go on stop', async () => {
        chrome.storage.local.get.yields({[TOAST_MUTES_KEY]: ['keystroke']});
        const stop = syncToastMutes();
        await vi.waitFor(() => expect(Notifications.isMuted('keystroke.fired')).toBe(true));

        chrome.storage.onChanged.dispatch(
            {[TOAST_MUTES_KEY]: {oldValue: ['keystroke'], newValue: ['github.sweep']}},
            'local',
        );
        expect(Notifications.isMuted('keystroke.fired')).toBe(false);
        expect(Notifications.isMuted('github.sweep.marked')).toBe(true);

        // Other keys and other storage areas are not this list.
        chrome.storage.onChanged.dispatch({other: {newValue: 1}}, 'local');
        chrome.storage.onChanged.dispatch({[TOAST_MUTES_KEY]: {newValue: []}}, 'sync');
        expect(Notifications.isMuted('github.sweep.marked')).toBe(true);

        // The list emptied (or removed): nothing stays muted.
        chrome.storage.onChanged.dispatch(
            {[TOAST_MUTES_KEY]: {oldValue: ['github.sweep']}},
            'local',
        );
        expect(Notifications.isMuted('github.sweep.marked')).toBe(false);

        chrome.storage.onChanged.dispatch({[TOAST_MUTES_KEY]: {newValue: ['a', 'b']}}, 'local');
        expect(Notifications.mutedFilters()).toEqual(['a', 'b']);
        stop();
        expect(Notifications.mutedFilters()).toEqual([]);
        expect(chrome.storage.onChanged.removeListener.called).toBe(true);
    });

    it('a stored list that arrives after stop is not applied', async () => {
        let deliver: ((items: Record<string, unknown>) => void) | null = null;
        chrome.storage.local.get.callsFake((_key: string, callback: typeof deliver) => {
            deliver = callback;
        });
        const stop = syncToastMutes();
        stop();
        deliver!({[TOAST_MUTES_KEY]: ['keystroke']});
        await Promise.resolve();
        expect(Notifications.isMuted('keystroke.fired')).toBe(false);
    });
});
