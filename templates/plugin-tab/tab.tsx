import {TabRegistry} from '@exo/lib/popup-tabs/tab-registry';
import {__Pascal__Component} from '@exo/plugins/__NAME__/__Pascal__Component';

TabRegistry.register({
    id: '__NAME__',
    label: '__Pascal__',
    component: __Pascal__Component,
    // 0 = the best match for this URL; -1 = hide. Higher numbers lose to lower ones.
    getPriority: (url) => (new URL(url).hostname === 'example.com' ? 0 : -1),
});
