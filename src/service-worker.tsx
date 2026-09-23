import {
    ensureInjectContentScript,
    CONTENT_SCRIPT_PATH,
} from '@exo/lib/service-worker/content-script-injector';
import {
    announceRebuild,
    takeRebuildNote,
    watchForRebuild,
} from '@exo/lib/service-worker/auto-reload';

/**
 * Background service worker entry point. Plugins are content-script + popup
 * only; the worker's jobs are getting the content script into tabs that
 * were already open when the extension loaded or updated, and reloading the
 * extension when a new build lands in dist/ (the edit loop).
 */

// Did the previous worker reload us for a new build? Take its note before
// anything else so the announcement below can follow the injection.
const rebuild = takeRebuildNote();

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('chrome exoskeleton installed/updated:', details.reason);
    await ensureInjectContentScript(CONTENT_SCRIPT_PATH);
});

ensureInjectContentScript(CONTENT_SCRIPT_PATH);

watchForRebuild();
void rebuild.then((note) => (note ? announceRebuild(note) : null));

console.log('chrome exoskeleton service worker loaded');
