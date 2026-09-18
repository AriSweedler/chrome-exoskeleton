import {keybindings} from '@exo/lib/keybindings';
import {Notifications} from '@exo/lib/toast-notification';
import {safeUrl} from '@exo/lib/url';

/** True on the site this plugin is for. Everything below is gated on it. */
export function isTargetPage(url: string): boolean {
    return safeUrl(url)?.hostname === 'example.com';
}

function initialize(): void {
    if (!isTargetPage(window.location.href)) return;

    keybindings.registerAll([
        {
            key: 'x',
            description: 'Say hello',
            context: '__Pascal__',
            handler: () => Notifications.show({message: 'Hello from __NAME__'}),
        },
    ]);
    keybindings.listen();
}

initialize();
