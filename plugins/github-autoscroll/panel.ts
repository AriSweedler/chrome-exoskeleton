import {waitFor} from '@exo/lib/wait-for';

/**
 * The docked side panel of GitHub's 2026 pull request pages (the "Preview"
 * Overview page, formerly Conversation):
 *
 *   <div [data-testid="diff-comparison-viewer-sticky-header-bar"]>     ← mini header, always present
 *     <button data-docked-panel-toggle aria-expanded="true|false">   ← "Open panel" / "Close panel"
 *   <div class="…SidebarWrapper… [HiddenSidePanel__…]">              ← hidden class while closed
 *     <div id="docked-side-panel-content">                           ← empty while closed
 *       <h3><button class="PanelNavigationDropdown__…"
 *                   aria-label="Merge status|Activity|…"
 *                   aria-haspopup="true">                             ← which view the panel shows
 *
 * The view button opens a menu of the panel's views. The menu exists only
 * while open, so views are read from it at runtime, never hardcoded.
 * `data-is-hidden` on the wrapper reads "false" whether or not the panel
 * shows, so open/closed comes from the toggle's aria-expanded.
 */

const TOGGLE_SELECTOR = 'button[data-docked-panel-toggle]';
const CONTENT_SELECTOR = '#docked-side-panel-content';
const VIEW_BUTTON_SELECTOR = 'button[class*="PanelNavigationDropdown__"]';
const MENU_SELECTOR = '[role="menu"], [role="listbox"]';
const MENU_ITEM_SELECTOR = '[role="menuitemradio"], [role="menuitem"], [role="option"]';

/** The mini header's open/close panel button; null on pages without the docked panel. */
export function panelToggle(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(TOGGLE_SELECTOR);
}

export function isPanelOpen(): boolean {
    return panelToggle()?.getAttribute('aria-expanded') === 'true';
}

/** The panel header's view dropdown; null while the panel is closed. */
export function panelViewButton(): HTMLButtonElement | null {
    const content = document.querySelector(CONTENT_SELECTOR);
    if (!content) return null;
    return (
        content.querySelector<HTMLButtonElement>(VIEW_BUTTON_SELECTOR) ??
        content.querySelector<HTMLButtonElement>('h3 button[aria-haspopup]')
    );
}

const text = (element: Element | null | undefined): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The view the panel shows ("Merge status", "Activity", …), or null while closed. */
export function currentPanelView(): string | null {
    const button = panelViewButton();
    if (!button) return null;
    return button.getAttribute('aria-label')?.trim() || text(button) || null;
}

const sameView = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** Whether a view's name contains `word`, case-insensitively ("status" names "Merge status"). */
const viewNamed = (view: string, word: string) => view.toLowerCase().includes(word.toLowerCase());

/** A menu item's name: what its aria-labelledby points at, else its text. */
function itemLabel(item: Element): string {
    const ids = item.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
    const labelled = ids.map((id) => text(document.getElementById(id))).join(' ');
    return labelled.trim() || text(item);
}

/**
 * The selectable items of the view menu once it is open: the menu that
 * names the view button through aria-labelledby, else a menu that was not
 * in the document before the button was clicked (the overlay just opened).
 */
function viewMenuItems(button: HTMLButtonElement, before: Set<Element>): HTMLElement[] | null {
    const menus = Array.from(document.querySelectorAll<HTMLElement>(MENU_SELECTOR));
    const menu =
        menus.find(
            (m) =>
                button.id !== '' &&
                (m.getAttribute('aria-labelledby') ?? '').split(/\s+/).includes(button.id),
        ) ?? menus.reverse().find((m) => !before.has(m));
    if (!menu) return null;
    const items = Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
        (item) => item.getAttribute('aria-disabled') !== 'true',
    );
    return items.length > 0 ? items : null;
}

function closeMenu(button: HTMLButtonElement): void {
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    if (button.isConnected && button.getAttribute('aria-expanded') === 'true') button.click();
}

export type TogglePanelOutcome =
    | {kind: 'opened'; view: string | null}
    | {kind: 'closed'}
    | {kind: 'no-panel'};

/** Open the panel on whatever view GitHub restores, or close it. */
export async function togglePanel(): Promise<TogglePanelOutcome> {
    const toggle = panelToggle();
    if (!toggle) return {kind: 'no-panel'};
    if (isPanelOpen()) {
        toggle.click();
        return {kind: 'closed'};
    }
    toggle.click();
    const view = await waitFor(currentPanelView, {intervalMs: 50, attempts: 40});
    return {kind: 'opened', view};
}

/** A view by its 1-based place in the menu, or by a word its name contains (case-insensitive). */
export type ViewPick = {position: number} | {named: string};

export type ShowViewOutcome =
    | {kind: 'shown'; view: string}
    | {kind: 'already'; view: string}
    | {kind: 'no-such-view'; pick: ViewPick; views: string[]}
    | {kind: 'no-panel'}
    | {kind: 'no-menu'};

/** Switch the open panel to the picked view through its header menu. */
export async function showPanelView(pick: ViewPick): Promise<ShowViewOutcome> {
    const button = panelViewButton();
    if (!button) return {kind: 'no-panel'};
    const current = currentPanelView();
    // A named view already showing needs no menu.
    if ('named' in pick && current && viewNamed(current, pick.named)) {
        return {kind: 'already', view: current};
    }

    const before = new Set(document.querySelectorAll(MENU_SELECTOR));
    button.click();
    const items = await waitFor(() => viewMenuItems(button, before), {
        intervalMs: 50,
        attempts: 40,
    });
    if (!items) {
        closeMenu(button);
        return {kind: 'no-menu'};
    }
    const target =
        'position' in pick
            ? items[pick.position - 1]
            : items.find((item) => viewNamed(itemLabel(item), pick.named));
    if (!target) {
        closeMenu(button);
        return {kind: 'no-such-view', pick, views: items.map(itemLabel)};
    }
    const view = itemLabel(target);
    if (current && sameView(current, view)) {
        closeMenu(button);
        return {kind: 'already', view};
    }
    target.click();
    // A selection closes the menu; if this one did not, close it.
    const closed = await waitFor(() => !viewMenuItems(button, before), {
        intervalMs: 50,
        attempts: 6,
    });
    if (!closed && button.isConnected) closeMenu(button);
    return {kind: 'shown', view};
}
