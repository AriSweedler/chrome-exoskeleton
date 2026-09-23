import {keybindings} from '@exo/lib/keybindings';
import {onDispose} from '@exo/lib/lifecycle';
import {isTabEnabled} from '@exo/lib/popup-tabs/use-tab-enablement';
import {NotificationType, Notifications} from '@exo/lib/toast-notification';
import {waitFor} from '@exo/lib/wait-for';
import * as autoscroll from '@exo/plugins/github-autoscroll/autoscroll';
import {
    forgetSweep,
    markAutoHiddenFilesViewed,
    unmarkAutoHiddenFilesViewed,
} from '@exo/plugins/github-autoscroll/auto-hidden';
import {
    type FoldAction,
    foldActiveFile,
    getActiveFile,
} from '@exo/plugins/github-autoscroll/cursor';
import {getFiles, isViewed, setViewed} from '@exo/plugins/github-autoscroll/files';
import {
    scrollPageDown,
    scrollStep,
    scrollToPageBottom,
    scrollToPageTop,
} from '@exo/plugins/github-autoscroll/scroll';
import {
    goToChangedFiles,
    goToConversation,
    isGitHubHost,
    isGitHubPRChangesPage,
    isGitHubPRPage,
} from '@exo/plugins/github-autoscroll/url';

/** The popup tab's id; its enablement toggle gates the auto-run. */
const TAB_ID = 'github-autoscroll';
/** Help-overlay groups: the site, a pull request's tabs, and the review cursor. */
const SITE_CONTEXT = 'GitHub';
const PR_CONTEXT = 'GitHub PR';
const REVIEW_CONTEXT = 'GitHub PR review';
const NO_FILES_MESSAGE = "No files found. Make sure you're on a GitHub PR changes page.";

const onPRPage = (): boolean => isGitHubPRPage(window.location.href);

// --- autoscroll -----------------------------------------------------------

function announceAdvance(outcome: autoscroll.AdvanceOutcome): void {
    if (outcome.kind === 'all-viewed') {
        Notifications.show({message: 'All files viewed', replace: true});
    } else if (outcome.wrapped) {
        Notifications.show({message: 'Wrapped to the first unviewed file', replace: true});
    }
    // An ordinary advance announces itself: the ring moves and the page scrolls.
}

/** Start autoscroll if it isn't running. True when it is running afterward. */
function startAutoscroll(): boolean {
    if (autoscroll.isRunning()) return true;
    if (!autoscroll.start({onAdvance: announceAdvance})) return false;
    const cursor = getActiveFile();
    Notifications.show({
        message: cursor
            ? `GitHub PR Autoscroll enabled — cursor on ${cursor.path}`
            : 'GitHub PR Autoscroll enabled — every file is viewed',
    });
    return true;
}

function stopAutoscroll(): void {
    if (!autoscroll.isRunning()) return;
    autoscroll.stop();
    Notifications.show({message: 'GitHub PR Autoscroll disabled', opacity: 0.5});
}

/** 'a': the one label-less surface that genuinely means "toggle". */
function toggleAutoscroll(): void {
    if (autoscroll.isRunning()) {
        stopAutoscroll();
    } else if (!startAutoscroll()) {
        Notifications.show({message: NO_FILES_MESSAGE, type: NotificationType.Error});
    }
}

/**
 * Auto-run on a Files changed page the popup has not switched off. GitHub
 * renders the file list progressively, so wait for the first diff rather
 * than guess a delay.
 */
async function autorun(): Promise<void> {
    if (!isGitHubPRChangesPage(window.location.href) || autoscroll.isRunning()) return;
    if (!(await isTabEnabled(TAB_ID))) return;
    const rendered = await waitFor(() => getFiles().length > 0, {intervalMs: 250, attempts: 40});
    if (!rendered || autoscroll.isRunning() || !isGitHubPRChangesPage(window.location.href)) return;
    startAutoscroll();
}

// --- the cursor: J / K / v --------------------------------------------------

/** J / K: step to the next / previous unviewed file. Starts autoscroll if it is off. */
function stepCursor(direction: 'next' | 'previous'): void {
    if (!autoscroll.isRunning() && !startAutoscroll()) {
        Notifications.show({message: NO_FILES_MESSAGE, type: NotificationType.Error});
        return;
    }
    announceAdvance(autoscroll.moveCursor(getActiveFile(), direction));
}

/**
 * v: toggle Viewed on the active file. Marking it viewed is a flip like any
 * other, so autoscroll carries the cursor on to the next unviewed file.
 */
function toggleViewedOnActive(): void {
    if (!autoscroll.isRunning() && !startAutoscroll()) {
        Notifications.show({message: NO_FILES_MESSAGE, type: NotificationType.Error});
        return;
    }
    const file = getActiveFile();
    if (!file) {
        Notifications.show({
            message: 'No active file',
            type: NotificationType.Error,
            replace: true,
        });
        return;
    }
    if (!setViewed(file, !isViewed(file))) {
        Notifications.show({
            message: 'The active file has no Viewed toggle',
            type: NotificationType.Error,
            replace: true,
        });
    }
}

// --- folds ----------------------------------------------------------------

function fold(action: FoldAction): void {
    const path = getActiveFile()?.path;
    const outcome = foldActiveFile(action);
    const error = (message: string) =>
        Notifications.show({message, type: NotificationType.Error, replace: true});
    switch (outcome) {
        case 'no-active-file':
            error('No active file — press a to start autoscroll');
            return;
        case 'no-fold-control':
            error(`No fold control on ${path}`);
            return;
        case 'unchanged':
            Notifications.show({
                message: `${path} is already ${action === 'close' ? 'closed' : 'open'}`,
                replace: true,
            });
            return;
        case 'opened':
        case 'closed':
            // The fold may be off screen while it pins back: say which file.
            Notifications.show({
                message: `${outcome === 'opened' ? 'Opened' : 'Closed'} ${path}`,
                replace: true,
            });
    }
}

// --- the d sweep ----------------------------------------------------------

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

// --- keys -----------------------------------------------------------------

function registerKeybindings(): void {
    keybindings.registerAll([
        // Every GitHub page. Registering the 'g g' sequence makes the registry
        // swallow GitHub's own g-prefixed nav (g c, g i, ...): a deliberate
        // tradeoff — the Ctrl+V pass-through still sends a literal g.
        {
            key: 'G',
            modifiers: {shift: true},
            description: 'Scroll to the bottom of the page',
            handler: () => scrollToPageBottom(),
            context: SITE_CONTEXT,
        },
        {
            sequence: ['g', 'g'],
            description: 'Scroll to the top of the page',
            handler: () => scrollToPageTop(),
            context: SITE_CONTEXT,
        },
        // Pull request pages only; elsewhere on the site these keys fall through.
        {
            key: 'c',
            description: 'Go to Conversation tab',
            handler: goToConversation,
            context: PR_CONTEXT,
            when: onPRPage,
        },
        {
            key: 'f',
            description: 'Go to Files changed tab',
            handler: goToChangedFiles,
            context: PR_CONTEXT,
            when: onPRPage,
        },
        {
            key: 'a',
            description: 'Toggle PR autoscroll',
            handler: toggleAutoscroll,
            context: REVIEW_CONTEXT,
            when: onPRPage,
        },
        {
            key: 'j',
            description: 'Scroll down a step',
            handler: () => scrollStep(1),
            context: REVIEW_CONTEXT,
            when: onPRPage,
            silent: true,
        },
        {
            key: 'k',
            description: 'Scroll up a step',
            handler: () => scrollStep(-1),
            context: REVIEW_CONTEXT,
            when: onPRPage,
            silent: true,
        },
        {
            key: 'J',
            modifiers: {shift: true},
            description: 'Next unviewed file',
            handler: () => stepCursor('next'),
            context: REVIEW_CONTEXT,
            when: onPRPage,
        },
        {
            key: 'K',
            modifiers: {shift: true},
            description: 'Previous unviewed file',
            handler: () => stepCursor('previous'),
            context: REVIEW_CONTEXT,
            when: onPRPage,
        },
        {
            key: 'v',
            description: 'Toggle Viewed on the active file (viewed → on to the next)',
            handler: toggleViewedOnActive,
            context: REVIEW_CONTEXT,
            when: onPRPage,
        },
        {
            key: 'l',
            description: 'Open the active file (unfold)',
            handler: () => fold('open'),
            context: REVIEW_CONTEXT,
            when: onPRPage,
        },
        {
            key: 'h',
            description: 'Close the active file (fold)',
            handler: () => fold('close'),
            context: REVIEW_CONTEXT,
            when: onPRPage,
        },
        {
            key: 'd',
            description:
                'Mark auto-hidden files viewed + scroll down (hold to sweep; skips large diffs)',
            handler: markAutoHiddenFilesAndAdvance,
            context: REVIEW_CONTEXT,
            when: onPRPage,
            silent: true,
        },
        {
            key: 'D',
            modifiers: {shift: true},
            description: 'Show the auto-hidden files again (unmark as viewed)',
            handler: showAutoHiddenFiles,
            context: REVIEW_CONTEXT,
            when: onPRPage,
        },
    ]);
    keybindings.listen();
}

// --- navigation -----------------------------------------------------------

/**
 * GitHub is a single-page app: the URL changes without a reload. Chrome's
 * Navigation API reports every same-document navigation; where it is absent
 * (tests), poll.
 */
function watchNavigation(onChange: () => void): () => void {
    let last = window.location.href;
    const check = (): void => {
        if (window.location.href === last) return;
        last = window.location.href;
        onChange();
    };
    const navigation = (
        window as {
            navigation?: {
                addEventListener(type: string, listener: () => void): void;
                removeEventListener(type: string, listener: () => void): void;
            };
        }
    ).navigation;
    if (navigation) {
        navigation.addEventListener('currententrychange', check);
        return () => navigation.removeEventListener('currententrychange', check);
    }
    const timer = window.setInterval(check, 500);
    return () => window.clearInterval(timer);
}

function onNavigate(): void {
    // Leaving the Files changed view ends the session quietly; the sweep's
    // memory is per page too.
    if (!isGitHubPRChangesPage(window.location.href)) {
        autoscroll.stop();
        forgetSweep();
    }
    void autorun();
}

// --- popup messages -------------------------------------------------------

function registerMessageHandlers(): void {
    chrome.runtime.onMessage.addListener(
        (
            message: {type: string; active?: boolean},
            _sender: chrome.runtime.MessageSender,
            sendResponse: (response: {active: boolean}) => void,
        ) => {
            if (message.type === 'GITHUB_AUTOSCROLL_GET_STATUS') {
                sendResponse({active: autoscroll.isRunning()});
                return true;
            }
            // SET is for surfaces that display a state (the popup button):
            // the request names the state its label promised, so a stale
            // label degrades to a visible self-correcting no-op instead of a
            // silent inverse action. Idempotent; responds with the real state.
            if (message.type === 'GITHUB_AUTOSCROLL_SET') {
                if (message.active) {
                    if (!startAutoscroll()) {
                        Notifications.show({
                            message: NO_FILES_MESSAGE,
                            type: NotificationType.Error,
                        });
                    }
                } else {
                    stopAutoscroll();
                }
                sendResponse({active: autoscroll.isRunning()});
                return true;
            }
            return false;
        },
    );
}

// --- entry ----------------------------------------------------------------

function initialize(): void {
    registerMessageHandlers();

    // The content script runs on <all_urls>; everything past message handling
    // is GitHub-only, so touch nothing (especially the shared keybinding
    // registry) on other sites.
    if (!isGitHubHost(window.location.href)) return;

    registerKeybindings();
    const stopWatching = watchNavigation(onNavigate);
    void autorun();

    // A newer copy of the content script (after an extension reload) takes
    // over the page: stop watching and drop the cursor.
    onDispose(() => {
        stopWatching();
        autoscroll.stop();
    });
}

initialize();
