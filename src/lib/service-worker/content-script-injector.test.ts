import {describe, it, expect, beforeEach, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
    CONTENT_SCRIPT_PATH,
    getContentScriptPathFromManifest,
    checkInjectContentScript,
    injectContentScript,
    ensureInjectContentScript,
} from '@exo/lib/service-worker/content-script-injector';
import chrome from 'sinon-chrome';

type ManifestWithContentScripts = {content_scripts?: Array<{js?: string[]}>};

const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'manifest.json'), 'utf8'),
) as ManifestWithContentScripts;

function mockExecuteScript() {
    const executeScript = vi.fn().mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chrome as any).scripting = {executeScript};
    return executeScript;
}

describe('content-script-injector', () => {
    beforeEach(() => {
        chrome.reset();
    });

    describe('getContentScriptPathFromManifest', () => {
        it('should return the first content script file from the manifest', () => {
            chrome.runtime.getManifest.returns({
                content_scripts: [{js: ['assets/index.tsx-loader-abc123.js']}],
            });

            expect(getContentScriptPathFromManifest()).toBe('assets/index.tsx-loader-abc123.js');
        });

        it('should return undefined when the manifest has no content scripts', () => {
            chrome.runtime.getManifest.returns({});

            expect(getContentScriptPathFromManifest()).toBeUndefined();
        });
    });

    describe('CONTENT_SCRIPT_PATH', () => {
        it('should match the content script declared in manifest.json', () => {
            expect(manifest.content_scripts?.[0]?.js?.[0]).toBeDefined();
            expect(CONTENT_SCRIPT_PATH).toBe(manifest.content_scripts?.[0]?.js?.[0]);
        });

        it('should prefer the manifest-declared file when getManifest provides one', async () => {
            chrome.runtime.getManifest.returns({
                content_scripts: [{js: ['assets/index.tsx-loader-abc123.js']}],
            });
            vi.resetModules();
            const injector = await import('@exo/lib/service-worker/content-script-injector');

            expect(injector.CONTENT_SCRIPT_PATH).toBe('assets/index.tsx-loader-abc123.js');
        });
    });

    describe('checkInjectContentScript', () => {
        it('should return true when the content script responds to PING', async () => {
            chrome.tabs.sendMessage.resolves({});

            expect(await checkInjectContentScript(1)).toBe(true);
            expect(chrome.tabs.sendMessage.calledWith(1, {type: 'PING'})).toBe(true);
        });

        it('should return false when the tab has no content script', async () => {
            chrome.tabs.sendMessage.rejects(new Error('Receiving end does not exist.'));

            expect(await checkInjectContentScript(1)).toBe(false);
        });
    });

    describe('injectContentScript', () => {
        it('should return false without injecting into chrome:// pages', async () => {
            const executeScript = mockExecuteScript();

            expect(await injectContentScript(1, 'chrome://extensions')).toBe(false);
            expect(executeScript).not.toHaveBeenCalled();
        });

        it('should inject the manifest-declared content script by default', async () => {
            const executeScript = mockExecuteScript();

            expect(await injectContentScript(1, 'https://example.com')).toBe(true);
            expect(executeScript).toHaveBeenCalledWith({
                target: {tabId: 1},
                files: [CONTENT_SCRIPT_PATH],
            });
        });

        it('should inject an explicitly provided script path', async () => {
            const executeScript = mockExecuteScript();

            await injectContentScript(1, 'https://example.com', 'assets/custom.js');

            expect(executeScript).toHaveBeenCalledWith({
                target: {tabId: 1},
                files: ['assets/custom.js'],
            });
        });

        it('should return false instead of throwing when injection fails', async () => {
            vi.spyOn(console, 'debug').mockImplementation(() => {});
            const executeScript = mockExecuteScript();
            executeScript.mockRejectedValue(new Error('Could not load file'));

            expect(await injectContentScript(1, 'https://example.com')).toBe(false);
        });
    });

    describe('ensureInjectContentScript', () => {
        it('should inject only into tabs missing the content script', async () => {
            const executeScript = mockExecuteScript();
            chrome.tabs.query.resolves([
                {id: 1, url: 'https://already-injected.com'},
                {id: 2, url: 'https://needs-injection.com'},
                {url: 'https://no-tab-id.com'},
            ]);
            chrome.tabs.sendMessage.withArgs(1).resolves({});
            chrome.tabs.sendMessage.withArgs(2).rejects(new Error('Receiving end does not exist.'));

            await ensureInjectContentScript(CONTENT_SCRIPT_PATH);

            expect(executeScript).toHaveBeenCalledTimes(1);
            expect(executeScript).toHaveBeenCalledWith({
                target: {tabId: 2},
                files: [CONTENT_SCRIPT_PATH],
            });
        });

        it('should not throw when querying tabs fails', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            chrome.tabs.query.rejects(new Error('no windows'));

            await expect(ensureInjectContentScript(CONTENT_SCRIPT_PATH)).resolves.toBeUndefined();
            expect(consoleError).toHaveBeenCalled();
        });
    });
});
