import {keybindings} from '@exo/lib/keybindings';
import {isTabEnabled} from '@exo/lib/popup-tabs/use-tab-enablement';
import {typeXxxAndScrollToBottom, announceSequenceDemo} from '@exo/plugins/playground/actions';

async function initialize() {
    if (!window.location.href.includes('docs.google.com/document')) return;
    if (!(await isTabEnabled('playground'))) return;

    keybindings.register({
        key: 'x',
        description: 'Type XXX and scroll to bottom',
        handler: typeXxxAndScrollToBottom,
        context: 'Playground',
    });
    keybindings.register({
        sequence: ['g', 'g'],
        description: 'Demo multi-keystroke sequence',
        handler: announceSequenceDemo,
        context: 'Playground',
    });
    keybindings.listen();
}

initialize();
