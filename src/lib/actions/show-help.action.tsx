import {Action} from '@exo/lib/actions/base-action';

/**
 * Ask a page to open the keybinding help overlay. The popup sends it when the
 * reader clicks a keybinding hint: on a page that swallows every keystroke
 * (a Google Doc in preview mode) the overlay's click-to-run rows are the only
 * way to reach a binding, so the overlay itself must open without a key.
 */
export class ShowHelpAction extends Action<void, void> {
    type = 'SHOW_HELP' as const;
}
