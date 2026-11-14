import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
    NATIVE_HOST,
    chromeVersion,
    installedVersion,
    recordInstalledVersion,
} from '@exo/lib/service-worker/installed-version';

const STAMP = {
    builtAt: '2026-11-13T12:00:00.000Z',
    sha: 'f'.repeat(40),
    dirty: false,
    plugins: [{name: 'richlink', tier: 'df'}],
};

function stubChrome(sendNativeMessage: (host: string, message: unknown) => Promise<unknown>) {
    const chrome = {
        runtime: {
            id: 'abcdefghijklmnopabcdefghijklmnop',
            getURL: (file: string) => `chrome-extension://abc/${file}`,
            getManifest: () => ({version: '0.4.0'}),
            sendNativeMessage: vi.fn(sendNativeMessage),
        },
    };
    vi.stubGlobal('chrome', chrome);
    return chrome;
}

function stubStamp(stamp: unknown, ok = true) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ok, json: async () => stamp})),
    );
}

function stubUAData(fullVersionList: Array<{brand: string; version: string}> | null) {
    const userAgentData =
        fullVersionList === null
            ? undefined
            : {getHighEntropyValues: vi.fn(async () => ({fullVersionList}))};
    vi.stubGlobal('navigator', {userAgentData});
}

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('chromeVersion', () => {
    it('takes Google Chrome from the full version list, else Chromium', async () => {
        stubUAData([
            {brand: 'Not_A Brand', version: '99.0.0.0'},
            {brand: 'Chromium', version: '142.0.7444.59'},
            {brand: 'Google Chrome', version: '142.0.7444.60'},
        ]);
        expect(await chromeVersion()).toBe('142.0.7444.60');
        stubUAData([{brand: 'Chromium', version: '142.0.7444.59'}]);
        expect(await chromeVersion()).toBe('142.0.7444.59');
    });

    it('is null without client hints or a known brand', async () => {
        stubUAData(null);
        expect(await chromeVersion()).toBeNull();
        stubUAData([{brand: 'Not_A Brand', version: '99.0.0.0'}]);
        expect(await chromeVersion()).toBeNull();
    });
});

describe('installedVersion', () => {
    it('joins the manifest, the build stamp and the running Chrome', async () => {
        stubChrome(async () => ({ok: true}));
        stubStamp(STAMP);
        stubUAData([{brand: 'Google Chrome', version: '142.0.7444.60'}]);
        expect(await installedVersion('startup')).toEqual({
            type: 'installed-version',
            reason: 'startup',
            extensionId: 'abcdefghijklmnopabcdefghijklmnop',
            version: '0.4.0',
            ...STAMP,
            chromeVersion: '142.0.7444.60',
        });
    });

    it('reports the stamp fields as null when dist/ has no stamp', async () => {
        stubChrome(async () => ({ok: true}));
        stubStamp(null, false);
        stubUAData(null);
        expect(await installedVersion('update')).toMatchObject({
            reason: 'update',
            version: '0.4.0',
            sha: null,
            dirty: null,
            builtAt: null,
            plugins: null,
            chromeVersion: null,
        });
    });
});

describe('recordInstalledVersion', () => {
    beforeEach(() => {
        stubStamp(STAMP);
        stubUAData(null);
    });

    it('sends the record to the native host and is true when it wrote it', async () => {
        const chrome = stubChrome(async () => ({ok: true, path: '/state/installed-version'}));
        expect(await recordInstalledVersion('install')).toBe(true);
        expect(chrome.runtime.sendNativeMessage).toHaveBeenCalledWith(
            NATIVE_HOST,
            expect.objectContaining({type: 'installed-version', reason: 'install', sha: STAMP.sha}),
        );
    });

    it('is false, without throwing, when the host is missing or refuses', async () => {
        stubChrome(async () => {
            throw new Error('Specified native messaging host not found.');
        });
        expect(await recordInstalledVersion('startup')).toBe(false);
        stubChrome(async () => ({ok: false, error: 'nope'}));
        expect(await recordInstalledVersion('startup')).toBe(false);
    });
});
