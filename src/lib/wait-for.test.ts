import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {waitFor} from '@exo/lib/wait-for';

describe('waitFor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the probed value once it turns truthy', async () => {
        let value: string | null = null;
        const promise = waitFor(() => value);

        await vi.advanceTimersByTimeAsync(200);
        value = 'ready';
        await vi.advanceTimersByTimeAsync(100);

        await expect(promise).resolves.toBe('ready');
    });

    it('returns null after exhausting all attempts', async () => {
        const probe = vi.fn(() => null);
        const promise = waitFor(probe, {attempts: 3});

        await vi.advanceTimersByTimeAsync(300);

        await expect(promise).resolves.toBeNull();
        expect(probe).toHaveBeenCalledTimes(3);
    });

    it('probes only after the first interval, honoring intervalMs', async () => {
        const probe = vi.fn(() => 'hit');
        const promise = waitFor(probe, {intervalMs: 500});

        await vi.advanceTimersByTimeAsync(499);
        expect(probe).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);

        await expect(promise).resolves.toBe('hit');
    });
});
