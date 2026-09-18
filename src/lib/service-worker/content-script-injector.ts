import {Tabs} from '@exo/lib/service-worker/tabs';

/**
 * Utilities for injecting content scripts into tabs
 */

/**
 * Content script file as declared in the manifest. Compiled builds rewrite
 * the file name, so derive it at runtime instead of hardcoding a path.
 */
export function getContentScriptPathFromManifest(): string | undefined {
    return chrome.runtime.getManifest()?.content_scripts?.[0]?.js?.[0];
}

export const CONTENT_SCRIPT_PATH: string = getContentScriptPathFromManifest() ?? 'src/index.tsx';

/**
 * Check if content script is injected in a tab
 */
export async function checkInjectContentScript(tabId: number): Promise<boolean> {
    try {
        await chrome.tabs.sendMessage(tabId, {type: 'PING'});
        return true;
    } catch {
        return false;
    }
}

/**
 * Inject content script into a single tab
 */
export async function injectContentScript(
    tabId: number,
    url: string | undefined,
    scriptPath: string = CONTENT_SCRIPT_PATH,
): Promise<boolean> {
    if (!Tabs.canInjectContent(url)) {
        return false;
    }

    try {
        await chrome.scripting.executeScript({
            target: {tabId},
            files: [scriptPath],
        });
        console.log(`Injected content script into tab ${tabId}: ${url}`);
        return true;
    } catch (error) {
        // Silently ignore errors (tab might not support injection)
        console.debug(`Could not inject into tab ${tabId}:`, error);
        return false;
    }
}

/**
 * Ensure content script is injected into all existing tabs
 * This ensures the content script is available even on tabs that were
 * already open before the extension was installed/reloaded
 */
export async function ensureInjectContentScript(scriptPath: string): Promise<void> {
    try {
        const tabs = await chrome.tabs.query({});

        for (const tab of tabs) {
            if (!tab.id) continue;

            const isInjected = await checkInjectContentScript(tab.id);
            if (!isInjected) {
                await injectContentScript(tab.id, tab.url, scriptPath);
            }
        }
    } catch (error) {
        console.error('Failed to inject content scripts:', error);
    }
}
