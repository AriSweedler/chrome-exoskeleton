import {describe, it, expect, vi, beforeEach} from 'vitest';
import {renderHook, waitFor, act} from '@testing-library/react';
import {isTabEnabled, useTabEnablement} from '@exo/lib/popup-exo-tabs/use-tab-enablement';

describe('useTabEnablement', () => {
    beforeEach(() => {
        vi.stubGlobal('chrome', {
            storage: {
                local: {
                    get: vi.fn((_key, callback) => {
                        callback({});
                    }),
                    set: vi.fn((_, callback) => {
                        if (callback) callback();
                    }),
                },
            },
        });
    });

    it('defaults to enabled when no storage value exists', async () => {
        const {result} = renderHook(() => useTabEnablement('test-tab'));

        expect(result.current.loading).toBe(true);

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.enabled).toBe(true);
    });

    it('loads enabled state from storage', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chrome.storage.local.get = vi.fn((_key: any, callback: any) => {
            callback({'exorun-test-tab': false});
        }) as unknown as typeof chrome.storage.local.get;

        const {result} = renderHook(() => useTabEnablement('test-tab'));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.enabled).toBe(false);
    });

    it('updates enabled state in storage', async () => {
        const {result} = renderHook(() => useTabEnablement('test-tab'));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.setEnabled(false);
        });

        expect(chrome.storage.local.set).toHaveBeenCalledWith(
            {'exorun-test-tab': false},
            expect.any(Function),
        );
        expect(result.current.enabled).toBe(false);
    });
});

describe('isTabEnabled', () => {
    function stubStorageGet(values: Record<string, unknown>) {
        chrome.storage.local.get = vi.fn(
            (_key: string, callback: (result: Record<string, unknown>) => void) => {
                callback(values);
            },
        ) as unknown as typeof chrome.storage.local.get;
    }

    beforeEach(() => {
        vi.stubGlobal('chrome', {
            storage: {
                local: {
                    get: vi.fn((_key, callback) => {
                        callback({});
                    }),
                },
            },
        });
    });

    it('defaults to true when no storage value exists', async () => {
        await expect(isTabEnabled('test-tab')).resolves.toBe(true);
        expect(chrome.storage.local.get).toHaveBeenCalledWith(
            'exorun-test-tab',
            expect.any(Function),
        );
    });

    it('returns false when the tab is disabled in storage', async () => {
        stubStorageGet({'exorun-test-tab': false});
        await expect(isTabEnabled('test-tab')).resolves.toBe(false);
    });

    it('returns true when the tab is enabled in storage', async () => {
        stubStorageGet({'exorun-test-tab': true});
        await expect(isTabEnabled('test-tab')).resolves.toBe(true);
    });
});
