import {waitFor} from '@exo/lib/wait-for';

/**
 * The diff layout, unified or split, lives in GitHub's "diff view settings"
 * menu (the gear in the files toolbar) as two radio items under "Layout".
 * Toggling it is: open the menu, read which item is checked, click the
 * other, and make sure the menu is closed again. GitHub saves the choice as
 * the account's preference, so it carries to every pull request.
 */

export type DiffLayout = 'unified' | 'split';

const LAYOUT_LABELS: Record<DiffLayout, string> = {unified: 'Unified', split: 'Split'};

/** A button's name as assistive tech reads it: aria-label plus what aria-labelledby points at. */
function accessibleName(button: HTMLButtonElement): string {
    const ids = button.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
    const labelled = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    return `${button.getAttribute('aria-label') ?? ''} ${labelled}`.trim();
}

/**
 * The gear that opens the diff view settings. Found by its own name first
 * ("Open diff view settings"), then as the gear-iconed menu button inside the
 * files toolbar proper — never by the first PullRequestFilesToolbar-classed
 * element, which is an empty sticky-header sentinel that precedes it.
 */
export function diffSettingsButton(): HTMLButtonElement | null {
    const gears = Array.from(
        document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]'),
    ).filter((button) => button.querySelector('svg.octicon-gear') !== null);
    return (
        gears.find((button) => /diff view settings/i.test(accessibleName(button))) ??
        gears.find((button) =>
            button.closest('[class*="PullRequestFilesToolbar-module__toolbar"]'),
        ) ??
        gears[0] ??
        null
    );
}

interface LayoutItems {
    current: DiffLayout;
    other: DiffLayout;
    otherItem: HTMLElement;
}

/** The two Layout radio items of an open diff view settings menu, if it is open. */
function layoutItems(): LayoutItems | null {
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    const find = (layout: DiffLayout) =>
        items.find((item) => item.textContent?.trim() === LAYOUT_LABELS[layout]) ?? null;
    const unified = find('unified');
    const split = find('split');
    if (!unified || !split) return null;
    const current: DiffLayout = split.getAttribute('aria-checked') === 'true' ? 'split' : 'unified';
    const other: DiffLayout = current === 'split' ? 'unified' : 'split';
    return {current, other, otherItem: other === 'split' ? split : unified};
}

export type ToggleLayoutOutcome =
    | {kind: 'switched'; to: DiffLayout}
    | {kind: 'no-settings-button'}
    | {kind: 'no-layout-items'};

/** Flip the diff layout between unified and split. */
export async function toggleDiffLayout(): Promise<ToggleLayoutOutcome> {
    let items = layoutItems();
    const gear = diffSettingsButton();
    if (!items) {
        if (!gear) return {kind: 'no-settings-button'};
        gear.click();
        items = await waitFor(layoutItems, {intervalMs: 50, attempts: 30});
        if (!items) {
            closeMenu(gear);
            return {kind: 'no-layout-items'};
        }
    }
    const {other, otherItem} = items;
    otherItem.click();
    // A radio menu usually closes on selection; if this one did not, close it.
    await waitFor(() => !layoutItems(), {intervalMs: 50, attempts: 6});
    if (layoutItems()) closeMenu(gear);
    return {kind: 'switched', to: other};
}

function closeMenu(gear: HTMLButtonElement | null): void {
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    if (layoutItems() && gear) gear.click();
}
