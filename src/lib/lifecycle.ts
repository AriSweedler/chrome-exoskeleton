/**
 * Content-script lifetime.
 *
 * An extension reload leaves the previous copy of the content script
 * orphaned in every open tab: its DOM listeners and observers stay alive
 * while its chrome.* is gone, and the new worker injects a fresh copy
 * alongside it. This module makes the handover explicit. Evaluating it is
 * the first thing a fresh copy does (every importer evaluates it first), and
 * that announces the new copy on the document; the orphan hears the
 * announcement and runs every disposer registered with onDispose. The page
 * keeps exactly one live copy and never has to reload.
 *
 * Register whatever your page module set up that must not outlive it:
 * observers, intervals, engines with a stop().
 */

/**
 * Namespaced by extension id (when there is one): a page script that
 * happens to dispatch a fixed name must not be able to retire the copy.
 */
const REPLACED_EVENT = `${
    typeof chrome !== 'undefined' && typeof chrome.runtime?.id === 'string'
        ? chrome.runtime.id
        : 'exo'
}:content-script-replaced`;

/** The handover event's name, for tests and tooling. */
export function replacedEventName(): string {
    return REPLACED_EVENT;
}

const disposers: Array<() => void> = [];
let disposed = false;

/** Run `disposer` when this copy of the content script is retired (at once if it already was). */
export function onDispose(disposer: () => void): void {
    if (disposed) {
        disposer();
        return;
    }
    disposers.push(disposer);
}

/** Retire this copy: run the disposers, newest first. Idempotent. */
export function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const disposer of disposers.splice(0).reverse()) {
        try {
            disposer();
        } catch (error) {
            console.error('[exo lifecycle] a disposer failed', error);
        }
    }
}

export function isDisposed(): boolean {
    return disposed;
}

/** Retire the previous copy of the content script on `target`, then wait to be retired in turn. */
export function claimPage(target: Document = document): void {
    target.dispatchEvent(new Event(REPLACED_EVENT));
    target.addEventListener(REPLACED_EVENT, () => dispose(), {once: true});
}

// Evaluated on import, before any page module runs: the earliest the new
// copy can retire the old one. (The service worker has no document.)
if (typeof document !== 'undefined') claimPage();
