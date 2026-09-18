import {
    ensureInjectContentScript,
    CONTENT_SCRIPT_PATH,
} from '@exo/lib/service-worker/content-script-injector';

/**
 * Background service worker entry point. Plugins are content-script + popup
 * only; the worker's one job is getting the content script into tabs that
 * were already open when the extension loaded or updated.
 */

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('chrome exoskeleton installed/updated:', details.reason);
    await ensureInjectContentScript(CONTENT_SCRIPT_PATH);
});

ensureInjectContentScript(CONTENT_SCRIPT_PATH);

console.log('chrome exoskeleton service worker loaded');
