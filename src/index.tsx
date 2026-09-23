// First: retire the copy of this script an extension reload may have left
// behind in this page (see lib/lifecycle.ts).
import {onDispose} from '@exo/lib/lifecycle';
import {ShowToastAction, showToastPayload} from '@exo/lib/actions/show-toast.action';
import {Notifications} from '@exo/lib/toast-notification';
import {keybindings} from '@exo/lib/keybindings';

/**
 * Content script entry point: wire the standalone libraries together, load
 * every plugin's page module, register the global bindings.
 */

// The keybinding and toast libraries are standalone; this is where they meet.
keybindings.setNotifier(Notifications);

// Page side of plugin discovery. `bin/exo link` creates the src/plugins/<name>
// mounts this glob reads; each page module self-registers its keybindings,
// actions and rich-link handlers at import time.
import.meta.glob('./plugins/*/page.{ts,tsx}', {eager: true});

// Shared: the ShowToast action any popup or service worker can send.
ShowToastAction.handle(showToastPayload);

keybindings.registerAll([
    // Backspace stays free until a toast is on screen.
    {
        key: 'Backspace',
        description: 'Dismiss notifications',
        context: 'Global',
        when: () => Notifications.hasVisible(),
        silent: true,
        handler: () => Notifications.dismissAll(),
    },
]);
keybindings.listen();

// When a newer copy of this script takes over the page, this one lets go of
// the keyboard and its toasts.
onDispose(() => keybindings.unlisten());
onDispose(() => Notifications.teardown());

// The e2e harness waits for this line before driving a page.
console.log('chrome exoskeleton loaded');
