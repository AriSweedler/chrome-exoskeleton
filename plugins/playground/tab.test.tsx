import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {TabRegistry} from '@exo/lib/popup-tabs/tab-registry';

// Import the tab - it will auto-register
import '@exo/plugins/playground/tab';

const GDOC_URL = 'https://docs.google.com/document/d/1abc/edit';
const OTHER_URL = 'https://github.com/owner/repo';

describe('Playground Tab', () => {
    it('registers with correct id and label', () => {
        const tabs = TabRegistry.getVisibleTabs(GDOC_URL);
        const tab = tabs.find((t) => t.id === 'playground');
        expect(tab).toBeDefined();
        expect(tab?.label).toBe('Playground');
    });

    it('has priority 0 on Google Docs pages', () => {
        const tabs = TabRegistry.getVisibleTabs(GDOC_URL);
        const tab = tabs.find((t) => t.id === 'playground');
        expect(tab?.priority).toBe(0);
    });

    it('is hidden on non-Google Docs pages', () => {
        const tabs = TabRegistry.getVisibleTabs(OTHER_URL);
        const tab = tabs.find((t) => t.id === 'playground');
        expect(tab).toBeUndefined();
    });

    it('renders component with keybinding hint', () => {
        const tabs = TabRegistry.getVisibleTabs(GDOC_URL);
        const tab = tabs.find((t) => t.id === 'playground')!;
        const Component = tab.component;
        render(<Component />);
        expect(screen.getByText('Playground')).toBeDefined();
        expect(screen.getByText('?')).toBeDefined();
    });
});
