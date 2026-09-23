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
        vi.restoreAllMocks();
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
        other.dispatchEvent(new Event('exo:content-script-replaced'));
        expect(disposer).toHaveBeenCalledTimes(1);
    });
});
