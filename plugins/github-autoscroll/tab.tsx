import {TabRegistry, matchPriority} from '@exo/lib/popup-tabs/tab-registry';
import {GitHubAutoscrollContent} from '@exo/plugins/github-autoscroll/GitHubAutoscrollComponent';
import {isGitHubPRChangesPage} from '@exo/plugins/github-autoscroll';

TabRegistry.register({
    id: 'github-autoscroll',
    label: 'Autoscroll',
    component: GitHubAutoscrollContent,
    getPriority: matchPriority(isGitHubPRChangesPage),
    enablementToggle: true,
});
