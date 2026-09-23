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
 * The announcement is not the only way out. A copy also checks, on every
 * keystroke and every couple of seconds, whether its own extension context
 * is still valid, and retires itself when it is not — so a copy that never
 * hears an announcement (a handover protocol that changed under it, an
 * extension removed outright) cannot linger.
 *
 * Register whatever your page module set up that must not outlive it:
 * observers, intervals, engines with a stop().
 */

/** The extension id as of load; an invalidated context reports none. */
const ID_AT_LOAD = runtimeId();

/**
 * Namespaced by extension id (when there is one): a page script that
 * happens to dispatch a fixed name must not be able to retire the copy.
 */
const REPLACED_EVENT = `${ID_AT_LOAD ?? 'exo'}:content-script-replaced`;

/**
 * The name copies used before it carried the extension id. Still announced,
 * so a copy from before the change retires like any other.
 */
const LEGACY_REPLACED_EVENT = 'exo:content-script-replaced';

/** How often a copy checks that its extension context is still valid. */
const LIVENESS_INTERVAL_MS = 2_000;

const disposers: Array<() => void> = [];
let disposed = false;
let livenessTimer: ReturnType<typeof setInterval> | null = null;

function runtimeId(): string | undefined {
    if (typeof chrome === 'undefined') return undefined;
    const id: unknown = chrome.runtime?.id;
    return typeof id === 'string' ? id : undefined;
}

/** The handover event's name, for tests and tooling. */
export function replacedEventName(): string {
    return REPLACED_EVENT;
}

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
    if (livenessTimer !== null) clearInterval(livenessTimer);
    document.removeEventListener('keydown', retireIfInvalidated, true);
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

/**
 * Whether this copy's extension context has been invalidated: the id it
 * loaded with is gone. (A context that never had an id — a test double —
 * is not invalidated by having none.)
 */
export function isInvalidated(): boolean {
    return ID_AT_LOAD !== undefined && runtimeId() !== ID_AT_LOAD;
}

/** Retire this copy if its context is gone. Returns whether it did. */
export function retireIfInvalidated(): boolean {
    if (!isInvalidated()) return false;
    dispose();
    return true;
}

/** Retire the previous copy of the content script on `target`, then wait to be retired in turn. */
export function claimPage(target: Document = document): void {
    target.dispatchEvent(new Event(LEGACY_REPLACED_EVENT));
    target.dispatchEvent(new Event(REPLACED_EVENT));
    target.addEventListener(REPLACED_EVENT, () => dispose(), {once: true});
    target.addEventListener(LEGACY_REPLACED_EVENT, () => dispose(), {once: true});
}

/**
 * Watch this copy's own context. The keydown check is registered before any
 * other listener of this copy (this module evaluates first), so an orphan
 * gives up the keyboard before its own handler could answer.
 */
function watchLiveness(): void {
    document.addEventListener('keydown', retireIfInvalidated, true);
    livenessTimer = setInterval(retireIfInvalidated, LIVENESS_INTERVAL_MS);
}

// Evaluated on import, before any page module runs: the earliest the new
// copy can retire the old one. (The service worker has no document.)
if (typeof document !== 'undefined') {
    claimPage();
    watchLiveness();
}
