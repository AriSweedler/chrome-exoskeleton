import {describe, it, expect, beforeEach, vi} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {TabBar} from '@exo/popup/TabBar';
import {TabRegistry, matchPriority} from '@exo/lib/popup-tabs/tab-registry';
import {Storage} from '@exo/lib/storage';
import chrome from 'sinon-chrome';

const AlphaContent = () => <div>Alpha Content</div>;
const BetaContent = () => <div>Beta Content</div>;

/** Two always-visible fixture tabs: Alpha (priority 0) before Beta (priority 1). */
function registerFixtureTabs() {
    TabRegistry.register({
        id: 'alpha',
        label: 'Alpha',
        component: AlphaContent,
        getPriority: () => 0,
    });
    TabRegistry.register({
        id: 'beta',
        label: 'Beta',
        component: BetaContent,
        getPriority: () => 1,
    });
}

describe('TabBar', () => {
    beforeEach(() => {
        chrome.reset();
        chrome.tabs.query.yields([
            {
                id: 123,
                url: 'http://example.com',
            },
        ]);
        chrome.storage.local.get.returns(Promise.resolve({}));
        chrome.storage.local.set.returns(Promise.resolve());
        TabRegistry.clearForTesting();
    });

    it('should render visible tabs', async () => {
        registerFixtureTabs();

        render(<TabBar />);

        // Wait for async query
        const element = await screen.findByText('Alpha');

        expect(element).toBeTruthy();
    });

    it('should render tabs in priority order', async () => {
        registerFixtureTabs();

        render(<TabBar />);

        await screen.findByText('Alpha');

        const buttons = screen.getAllByRole('button');
        expect(buttons[0].textContent).toContain('Alpha');
        expect(buttons[1].textContent).toContain('Beta');
    });

    it('should update active tab when clicked', async () => {
        registerFixtureTabs();

        // Mock Storage.get to resolve immediately (no stored selection)
        vi.spyOn(Storage, 'get').mockResolvedValue(null);

        render(<TabBar />);

        // Wait for both tabs to render and for Alpha to be active
        await waitFor(() => {
            const buttons = screen.getAllByRole('button');
            expect(buttons[0].className).toContain('active');
        });

        const buttons = screen.getAllByRole('button');

        // Alpha starts active (first visible tab)
        expect(buttons[0].className).toContain('active');
        expect(buttons[1].className).toBe('');

        // Click Beta
        fireEvent.click(buttons[1]);

        await waitFor(() => {
            const newButtons = screen.getAllByRole('button');
            expect(newButtons[0].className).toBe('');
            expect(newButtons[1].className).toContain('active');
        });
    });

    it('should save tab selection to storage', async () => {
        registerFixtureTabs();

        chrome.tabs.query.yields([
            {
                id: 456,
                url: 'http://example.com',
            },
        ]);

        const storageSpy = vi.spyOn(Storage, 'set');

        render(<TabBar />);

        await screen.findByText('Alpha');

        // Initially should not have called set (just restored)
        expect(storageSpy).not.toHaveBeenCalled();

        const button = screen.getByRole('button', {name: 'Alpha'});
        fireEvent.click(button);

        await waitFor(() => {
            expect(storageSpy).toHaveBeenCalledWith('selectedTab:456', 'alpha');
        });
    });

    it('should restore stored selection on mount', async () => {
        registerFixtureTabs();

        // Mock storage to return beta (not the default first tab)
        vi.spyOn(Storage, 'get').mockResolvedValue('beta');

        render(<TabBar />);

        // Wait for async storage load
        await waitFor(() => {
            const buttons = screen.getAllByRole('button');
            expect(buttons[1].className).toContain('active');
        });
    });

    it('should fall back to first visible tab when stored tab not found', async () => {
        registerFixtureTabs();

        // Mock Storage to return invalid tab ID
        vi.spyOn(Storage, 'get').mockResolvedValue('non-existent-tab');

        render(<TabBar />);

        await waitFor(() => {
            const buttons = screen.getAllByRole('button');
            expect(buttons[0].className).toContain('active');
        });
    });

    it('shows the empty state when no tab matches the page', async () => {
        TabRegistry.register({
            id: 'never-matches',
            label: 'Never',
            component: AlphaContent,
            getPriority: matchPriority(() => false),
        });

        render(<TabBar />);

        expect(await screen.findByText(/No exo tools match this page/)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders TabEnablementSection for tabs with enablementToggle', async () => {
        const TestComponent = () => <div>Test Content</div>;

        TabRegistry.register({
            id: 'test-enablement',
            label: 'Test',
            component: TestComponent,
            getPriority: () => 0,
            enablementToggle: true,
        });

        vi.spyOn(Storage, 'get').mockResolvedValue(true);

        render(<TabBar />);

        await waitFor(() => {
            expect(screen.getByText('Test Content')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText(/Enable on page load:/)).toBeInTheDocument();
        });
    });

    it('does not render TabEnablementSection for tabs without enablementToggle', async () => {
        const TestComponent = () => <div>Test Content</div>;

        TabRegistry.register({
            id: 'test-no-enablement',
            label: 'Test',
            component: TestComponent,
            getPriority: () => 0,
        });

        vi.spyOn(Storage, 'get').mockResolvedValue(null);

        render(<TabBar />);

        await waitFor(() => {
            expect(screen.getByText('Test Content')).toBeInTheDocument();
        });

        expect(screen.queryByText(/Enable on page load:/)).not.toBeInTheDocument();
    });
});
