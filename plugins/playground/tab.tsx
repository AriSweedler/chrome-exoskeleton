import {TabRegistry, matchPriority} from '@exo/lib/popup-tabs/tab-registry';
import {PlaygroundComponent} from '@exo/plugins/playground/PlaygroundComponent';

TabRegistry.register({
    id: 'playground',
    label: 'Playground',
    component: PlaygroundComponent,
    enablementToggle: true,
    getPriority: matchPriority((url) => url.includes('docs.google.com/document')),
});
