import {
    ensureInjectContentScript,
    CONTENT_SCRIPT_PATH,
} from '@exo/lib/service-worker/content-script-injector';
import {
    announceRebuild,
    takeRebuildNote,
    watchForRebuild,
} from '@exo/lib/service-worker/auto-reload';
import {recordInstalledVersion} from '@exo/lib/service-worker/installed-version';

/**
 * Background service worker entry point. Plugins are content-script + popup
 * only; the worker's jobs are getting the content script into tabs that
 * were already open when the extension loaded or updated, and reloading the
 * extension when a new build lands in dist/ (the edit loop). It also records
 * the running build in ~/.local/state/chrome-exoskeleton/installed-version
 * when Chrome starts and when the extension is installed or reloaded.
 */

// The build watcher comes first: whatever else fails at startup, the next
// build must still be able to reload us.
watchForRebuild();

// Did the previous worker reload us for a new build? Take its note before
// the injection so the announcement can follow it.
const rebuild = takeRebuildNote();

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('chrome exoskeleton installed/updated:', details.reason);
    void recordInstalledVersion(details.reason);
    await ensureInjectContentScript(CONTENT_SCRIPT_PATH);
});

chrome.runtime.onStartup.addListener(() => void recordInstalledVersion('startup'));

ensureInjectContentScript(CONTENT_SCRIPT_PATH);

void rebuild.then((note) => (note ? announceRebuild(note) : null));

console.log('chrome exoskeleton service worker loaded');
