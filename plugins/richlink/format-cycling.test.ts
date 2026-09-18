import {describe, it, expect, beforeEach} from 'vitest';
import {
    getNextFormatIndex,
    cacheFormatIndex,
    isCycling,
    clearCycleState,
} from '@exo/plugins/richlink/format-cycling';

describe('format-cycling', () => {
    beforeEach(() => {
        clearCycleState();
    });

    describe('getNextFormatIndex', () => {
        it('returns 0 when no cycle is in progress', () => {
            expect(getNextFormatIndex(3)).toBe(0);
        });

        it('cycles to the next format while the window is open', () => {
            cacheFormatIndex(0);
            expect(getNextFormatIndex(3)).toBe(1);
        });

        it('wraps around to 0 at the end', () => {
            cacheFormatIndex(2);
            expect(getNextFormatIndex(3)).toBe(0);
        });

        it('returns 0 after the window closes (toast dismissed)', () => {
            cacheFormatIndex(1);
            clearCycleState();
            expect(getNextFormatIndex(3)).toBe(0);
        });
    });

    describe('isCycling', () => {
        it('returns false when no cycle is in progress', () => {
            expect(isCycling()).toBe(false);
        });

        it('returns true while the window is open', () => {
            cacheFormatIndex(0);
            expect(isCycling()).toBe(true);
        });

        it('returns false after the window closes (toast dismissed)', () => {
            cacheFormatIndex(0);
            clearCycleState();
            expect(isCycling()).toBe(false);
        });
    });
});
