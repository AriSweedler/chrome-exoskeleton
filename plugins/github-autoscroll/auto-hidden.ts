import {getFiles, isAutoHidden, isViewed, setViewed} from '@exo/plugins/github-autoscroll/files';
import {ignoreNextViewedFlip} from '@exo/plugins/github-autoscroll/autoscroll';

/**
 * The `d` / `D` sweep: wave through the files GitHub hid by default
 * (generated, deleted — see files.isAutoHidden) by marking them viewed, and
 * take that back. GitHub drops a file's body once it is viewed, and the body
 * is what identifies an auto-hidden file, so the sweep remembers what it
 * marked: `D` can find those again after they collapsed. Files that were
 * already viewed when the page loaded are out of its reach.
 */

/** Anchors `d` marked viewed on this page. */
const swept = new Set<string>();

export function markAutoHiddenFilesViewed(): {marked: number; alreadyViewed: number} {
    const hidden = getFiles().filter(isAutoHidden);
    const toMark = hidden.filter((file) => !isViewed(file));
    ignoreNextViewedFlip(toMark.map((file) => file.anchor));
    for (const file of toMark) {
        setViewed(file, true);
        swept.add(file.anchor);
    }
    return {marked: toMark.length, alreadyViewed: hidden.length - toMark.length};
}

export function unmarkAutoHiddenFilesViewed(): {unmarked: number} {
    const targets = getFiles().filter(
        (file) => isViewed(file) && (isAutoHidden(file) || swept.has(file.anchor)),
    );
    for (const file of targets) {
        setViewed(file, false);
        swept.delete(file.anchor);
    }
    return {unmarked: targets.length};
}

/** Forget what `d` marked (a new page). */
export function forgetSweep(): void {
    swept.clear();
}
