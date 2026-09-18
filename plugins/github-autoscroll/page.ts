import {
    goToChangedFiles,
    goToConversation,
    initializeAutoScroll,
    isGitHubHost,
    isGitHubPRChangesPage,
    isGitHubPRPage,
    markAutoHiddenFilesViewed,
    unmarkAutoHiddenFilesViewed,
} from '@exo/plugins/github-autoscroll';
import {
    scrollPageDown,
    scrollToPageBottom,
    scrollToPageTop,
} from '@exo/plugins/github-autoscroll/scroll';
import {keybindings} from '@exo/lib/keybindings';
import {Storage} from '@exo/lib/storage';
import {Notifications} from '@exo/lib/toast-notification';

declare global {
    interface Window {
        __ghAutoScrollStop?: (() => void) | undefined;
    }
}

/** Start autoscroll if it isn't running. True when it is running afterward. */
function startAutoscroll(): boolean {
    if (typeof window.__ghAutoScrollStop === 'function') return true;
    const stopFn = initializeAutoScroll();
    if (!stopFn) return false;
    window.__ghAutoScrollStop = stopFn;
    Notifications.show({message: 'GitHub PR Autoscroll enabled'});
    return true;
}

/** Stop autoscroll if it is running (idempotent). */
function stopAutoscroll(): void {
    if (typeof window.__ghAutoScrollStop !== 'function') return;
    window.__ghAutoScrollStop();
    Notifications.show({message: 'GitHub PR Autoscroll disabled', opacity: 0.5});
}

/** 'a': flip autoscroll — the one label-less surface that genuinely means "toggle". */
function toggleAutoscroll(): void {
    if (typeof window.__ghAutoScrollStop === 'function') {
        stopAutoscroll();
    } else if (!startAutoscroll()) {
        Notifications.show({
            message: "No files found. Make sure you're on a GitHub PR changes page.",
        });
    }
}

/**
 * Try to auto-run autoscroll on GitHub PR changes pages
 */
async function tryAutoRunAutoscroll() {
    if (!isGitHubPRChangesPage(window.location.href)) return;

    // Prevent race condition if already running
    if (typeof window.__ghAutoScrollStop === 'function') return;

    const exorun = await Storage.get<boolean>('exorun-github-autoscroll');
    const shouldAutoRun = exorun === undefined ? true : exorun;

    if (shouldAutoRun) {
        startAutoscroll();
    }
}

/**
 * Register the PR tab-navigation keybindings on any GitHub PR page and remove
 * them when navigating to a non-PR GitHub page — we must not swallow those
 * keystrokes elsewhere on the site. Never calls keybindings.unlisten(): the
 * listener is a singleton shared by every page module, and an attached
 * listener with no matching bindings is harmless.
 */
/**
 * 'd': mark this stretch's auto-hidden files as viewed, then advance a
 * viewport — so HOLDING d sweeps a huge PR, forcing GitHub to lazy-render
 * each next stretch of diffs. Silent under auto-repeat: the scroll is the
 * feedback, and the toast (replace, not stack) reports only actual marks.
 */
function markAutoHiddenFilesAndAdvance(): void {
    const {marked, alreadyViewed} = markAutoHiddenFilesViewed();
    if (marked > 0 || alreadyViewed > 0) {
        const alreadyViewedInfo = alreadyViewed > 0 ? ` (${alreadyViewed} already viewed)` : '';
        Notifications.show({
            message: `Marked ${marked} auto-hidden files as viewed${alreadyViewedInfo}`,
            replace: true,
        });
    }
    scrollPageDown();
}

/** 'D': undo — unmark the auto-hidden files so they show in the list again. */
function showAutoHiddenFiles(): void {
    const {unmarked} = unmarkAutoHiddenFilesViewed();
    Notifications.show({
        message:
            unmarked > 0
                ? `Showed ${unmarked} auto-hidden files (unmarked as viewed)`
                : 'No auto-hidden files to show',
        replace: true,
    });
}

// Scroll shortcuts for every GitHub page. Registering the 'g g' sequence
// makes the registry swallow GitHub's own g-prefixed nav (g c, g i, ...).
// That is a deliberate tradeoff — the Ctrl+V pass-through still sends a
// literal g to the page.
function registerScrollShortcuts(): void {
    keybindings.registerAll([
        {
            key: 'G',
            modifiers: {shift: true},
            description: 'Scroll to the bottom of the page',
            handler: () => scrollToPageBottom(),
            context: 'GitHub',
        },
        {
            sequence: ['g', 'g'],
            description: 'Scroll to the top of the page',
            handler: () => scrollToPageTop(),
            context: 'GitHub',
        },
    ]);
    keybindings.listen();
}

function syncPRTabShortcuts() {
    if (isGitHubPRPage(window.location.href)) {
        keybindings.registerAll([
            {
                key: 'c',
                description: 'Go to Conversation tab',
                handler: goToConversation,
                context: 'GitHub PR',
            },
            {
                key: 'f',
                description: 'Go to Files changed tab',
                handler: goToChangedFiles,
                context: 'GitHub PR',
            },
            {
                key: 'd',
                description:
                    'Mark auto-hidden files viewed + scroll down (hold to sweep; skips large diffs)',
                handler: markAutoHiddenFilesAndAdvance,
                context: 'GitHub PR',
                silent: true,
            },
            {
                key: 'D',
                modifiers: {shift: true},
                description: 'Show the auto-hidden files again (unmark as viewed)',
                handler: showAutoHiddenFiles,
                context: 'GitHub PR',
            },
            {
                key: 'a',
                description: 'Toggle PR autoscroll',
                handler: toggleAutoscroll,
                context: 'GitHub PR',
            },
        ]);
        keybindings.listen();
    } else {
        keybindings.unregister('c');
        keybindings.unregister('f');
        keybindings.unregister('d');
        keybindings.unregister('D', {shift: true});
        keybindings.unregister('a');
    }
}

/**
 * Setup SPA navigation listener for GitHub
 */
function setupSPANavigationListener() {
    let lastUrl = window.location.href;
    new MutationObserver(() => {
        // Guard against teardown (MutationObserver can fire after environment cleanup)
        if (typeof window === 'undefined') return;

        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;

            // If we left a PR changes page, stop autoscroll
            if (
                !isGitHubPRChangesPage(currentUrl) &&
                typeof window.__ghAutoScrollStop === 'function'
            ) {
                window.__ghAutoScrollStop();
            }

            // Keep the PR tab-navigation shortcuts in sync with the new URL
            syncPRTabShortcuts();

            // If we entered a PR changes page, maybe start autoscroll
            setTimeout(tryAutoRunAutoscroll, 500); // Wait for GitHub to render
        }
    }).observe(document, {subtree: true, childList: true});
}

/**
 * Initialize GitHub autoscroll message handlers
 */
function initializeMessageHandlers() {
    chrome.runtime.onMessage.addListener(
        (
            message: {type: string; active?: boolean},
            _sender: chrome.runtime.MessageSender,
            sendResponse: (response: {active: boolean}) => void,
        ) => {
            if (message.type === 'GITHUB_AUTOSCROLL_GET_STATUS') {
                const active = typeof window.__ghAutoScrollStop === 'function';
                sendResponse({active});
                return true;
            }

            // SET is for surfaces that display a state (the popup button):
            // the request names the state its label promised, so a stale
            // label degrades to a visible self-correcting no-op instead of a
            // silent inverse action. Idempotent; responds with the real state.
            // (A label-less flip is the 'a' keybinding, handled page-side.)
            if (message.type === 'GITHUB_AUTOSCROLL_SET') {
                if (message.active) {
                    if (!startAutoscroll()) {
                        Notifications.show({
                            message:
                                "No files found. Make sure you're on a GitHub PR changes page.",
                        });
                    }
                } else {
                    stopAutoscroll();
                }
                sendResponse({active: typeof window.__ghAutoScrollStop === 'function'});
                return true;
            }

            return false;
        },
    );
}

/**
 * Initialize GitHub autoscroll (runs at module level)
 */
function initialize(): void {
    initializeMessageHandlers();

    // The content script runs on <all_urls>; everything past message handling
    // is GitHub-only, so touch nothing (especially the shared keybinding
    // registry) on other sites.
    if (!isGitHubHost(window.location.href)) return;

    setupSPANavigationListener();

    registerScrollShortcuts();

    // Register the PR tab-navigation shortcuts if we loaded onto a PR page
    syncPRTabShortcuts();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(tryAutoRunAutoscroll, 500); // Wait for GitHub to render
        });
    } else {
        setTimeout(tryAutoRunAutoscroll, 500); // Wait for GitHub to render
    }
}

// Self-register: importing this module initializes GitHub autoscroll
initialize();
