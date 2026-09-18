import {describe, it, expect} from 'vitest';
import {TabRegistry} from '@exo/lib/popup-tabs/tab-registry';

// Import the tab - it will auto-register
import '@exo/plugins/github-autoscroll/tab';

describe('GitHub Autoscroll Tab', () => {
    it('registers tab with correct id and label', () => {
        const tabs = TabRegistry.getVisibleTabs('https://github.com/owner/repo/pull/123/changes');
        const autoscrollTab = tabs.find((t) => t.id === 'github-autoscroll');
        expect(autoscrollTab).toBeDefined();
        expect(autoscrollTab?.label).toBe('Autoscroll');
    });

    it('shows tab on GitHub PR changes pages', () => {
        const url = 'https://github.com/exo-test/repo/pull/198551/changes';
        const tabs = TabRegistry.getVisibleTabs(url);
        const autoscrollTab = tabs.find((t) => t.id === 'github-autoscroll');
        expect(autoscrollTab).toBeDefined();
        expect(autoscrollTab?.priority).toBe(0);
    });

    it('hides tab on non-PR pages', () => {
        const url = 'https://github.com/owner/repo';
        const tabs = TabRegistry.getVisibleTabs(url);
        const autoscrollTab = tabs.find((t) => t.id === 'github-autoscroll');
        expect(autoscrollTab).toBeUndefined();
    });

    it('hides tab on GitHub PR files pages', () => {
        const url = 'https://github.com/owner/repo/pull/123/files';
        const tabs = TabRegistry.getVisibleTabs(url);
        const autoscrollTab = tabs.find((t) => t.id === 'github-autoscroll');
        expect(autoscrollTab).toBeUndefined();
    });
});
