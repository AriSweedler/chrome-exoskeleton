import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';

/**
 * Two copies of the content script are two module instances; vi.resetModules
 * between imports gives the test exactly that.
 */
const load = () => import('@exo/lib/lifecycle');

describe('content-script lifecycle', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('a fresh copy retires the previous one on import, newest disposer first', async () => {
        const first = await load();
        const order: string[] = [];
        first.onDispose(() => order.push('a'));
        first.onDispose(() => order.push('b'));
        expect(first.isDisposed()).toBe(false);

        vi.resetModules();
        const second = await load();
        expect(order).toEqual(['b', 'a']);
        expect(first.isDisposed()).toBe(true);
        expect(second.isDisposed()).toBe(false);
    });

    it('a copy is retired once, and a disposer registered afterwards runs at once', async () => {
        const copy = await load();
        const disposer = vi.fn();
        copy.onDispose(disposer);
        copy.dispose();
        copy.dispose();
        expect(disposer).toHaveBeenCalledTimes(1);

        const late = vi.fn();
        copy.onDispose(late);
        expect(late).toHaveBeenCalledTimes(1);
    });

    it('one failing disposer does not stop the others', async () => {
        const copy = await load();
        const after = vi.fn();
        copy.onDispose(after);
        copy.onDispose(() => {
            throw new Error('boom');
        });
        copy.dispose();
        expect(after).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalled();
    });

    it('claimPage is explicit about its document', async () => {
        const copy = await load();
        const other = document.implementation.createHTMLDocument('other');
        const disposer = vi.fn();
        copy.onDispose(disposer);
        // Claiming another document does not retire this copy...
        copy.claimPage(other);
        expect(disposer).not.toHaveBeenCalled();
        // ...a later claim on that same document does.
        other.dispatchEvent(new Event(copy.replacedEventName()));
        expect(disposer).toHaveBeenCalledTimes(1);
        // sinon-chrome has no id, so the test name falls back to the plain prefix.
        expect(copy.replacedEventName()).toBe('exo:content-script-replaced');
    });

    it('carries the extension id in the event name, and still announces under the old name', async () => {
        vi.stubGlobal('chrome', {runtime: {id: 'abcdefgh'}});
        const copy = await load();
        expect(copy.replacedEventName()).toBe('abcdefgh:content-script-replaced');

        // A copy from before the name carried the id listens for the old name.
        const other = document.implementation.createHTMLDocument('other');
        const legacyCopy = vi.fn();
        other.addEventListener('exo:content-script-replaced', legacyCopy);
        copy.claimPage(other);
        expect(legacyCopy).toHaveBeenCalledTimes(1);
    });

    it('retires itself when its extension context is invalidated: on the next keystroke, or within a beat', async () => {
        vi.useFakeTimers();
        const runtime: {id?: string} = {id: 'abcdefgh'};
        vi.stubGlobal('chrome', {runtime});
        const copy = await load();
        const disposer = vi.fn();
        copy.onDispose(disposer);
        expect(copy.isInvalidated()).toBe(false);

        // The extension reloads: this copy's context loses its id.
        delete runtime.id;
        expect(copy.isInvalidated()).toBe(true);

        // A keystroke retires it before any later listener runs.
        const later = vi.fn();
        document.addEventListener('keydown', later, true);
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'h', bubbles: true}));
        expect(disposer).toHaveBeenCalledTimes(1);
        expect(copy.isDisposed()).toBe(true);
        expect(later).toHaveBeenCalledTimes(1); // other copies' listeners still run
        document.removeEventListener('keydown', later, true);
    });

    it('retires itself on its own clock when no key is pressed', async () => {
        vi.useFakeTimers();
        const runtime: {id?: string} = {id: 'abcdefgh'};
        vi.stubGlobal('chrome', {runtime});
        const copy = await load();
        const disposer = vi.fn();
        copy.onDispose(disposer);

        vi.advanceTimersByTime(5_000);
        expect(disposer).not.toHaveBeenCalled(); // still valid: nothing happens

        delete runtime.id;
        vi.advanceTimersByTime(2_100);
        expect(disposer).toHaveBeenCalledTimes(1);
    });

    it('a copy that never had an id (a test double) is not invalidated by having none', async () => {
        const copy = await load(); // sinon-chrome: id null
        expect(copy.isInvalidated()).toBe(false);
        expect(copy.retireIfInvalidated()).toBe(false);
    });
});
