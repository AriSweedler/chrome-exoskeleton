import {describe, it, expect, vi, beforeEach, type Mock} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {GitHubAutoscrollContent} from '@exo/plugins/github-autoscroll/GitHubAutoscrollComponent';

describe('GitHubAutoscrollContent', () => {
    beforeEach(() => {
        vi.stubGlobal('chrome', {
            tabs: {
                query: vi.fn(),
                sendMessage: vi.fn(),
            },
            runtime: {
                sendMessage: vi.fn(),
            },
            storage: {
                local: {
                    get: vi.fn((_key, callback) => {
                        // Default: return undefined (which means "use default value")
                        callback({});
                    }),
                    set: vi.fn((_, callback) => {
                        if (callback) callback();
                    }),
                },
            },
        });
    });

    it('renders status and toggle button', async () => {
        (chrome.tabs.query as Mock).mockResolvedValue([{id: 123}]);
        (chrome.tabs.sendMessage as Mock).mockResolvedValue({
            active: false,
        });

        render(<GitHubAutoscrollContent />);

        await waitFor(() => {
            expect(screen.getByText(/Inactive/)).toBeInTheDocument();
        });
    });

    it('shows active status when autoscroll is running', async () => {
        (chrome.tabs.query as Mock).mockResolvedValue([{id: 123}]);
        (chrome.tabs.sendMessage as Mock).mockResolvedValue({
            active: true,
        });

        render(<GitHubAutoscrollContent />);

        await waitFor(() => {
            expect(screen.getByText(/✓ Active/)).toBeInTheDocument();
        });
    });

    it('toggles autoscroll when button clicked', async () => {
        const user = userEvent.setup();
        (chrome.tabs.query as Mock).mockResolvedValue([{id: 123}]);
        (chrome.tabs.sendMessage as Mock)
            .mockResolvedValueOnce({active: false})
            .mockResolvedValueOnce({active: true});

        render(<GitHubAutoscrollContent />);

        await waitFor(() => {
            expect(screen.getByText(/○ Inactive/)).toBeInTheDocument();
        });

        await user.click(screen.getByText(/○ Inactive/));

        await waitFor(() => {
            expect(screen.getByText(/✓ Active/)).toBeInTheDocument();
        });
    });

    it('shows the unavailable state for an empty tabs array', async () => {
        (chrome.tabs.query as Mock).mockResolvedValue([]);

        render(<GitHubAutoscrollContent />);

        // No page answered: the button must not claim a state.
        await waitFor(() => {
            expect(screen.getByText(/Unavailable on this page/)).toBeInTheDocument();
        });
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('shows the unavailable state for a tab without ID', async () => {
        (chrome.tabs.query as Mock).mockResolvedValue([{} as chrome.tabs.Tab]);

        render(<GitHubAutoscrollContent />);

        await waitFor(() => {
            expect(screen.getByText(/Unavailable on this page/)).toBeInTheDocument();
        });
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('shows error message when toggle fails', async () => {
        const user = userEvent.setup();
        (chrome.tabs.query as Mock).mockResolvedValue([{id: 123}]);
        (chrome.tabs.sendMessage as Mock)
            .mockResolvedValueOnce({active: false})
            .mockRejectedValueOnce(new Error('Connection error'));

        render(<GitHubAutoscrollContent />);

        await waitFor(() => {
            expect(screen.getByText(/○ Inactive/)).toBeInTheDocument();
        });

        await user.click(screen.getByText(/○ Inactive/));

        await waitFor(() => {
            expect(screen.getByTestId('error-message')).toBeInTheDocument();
        });
        expect(
            screen.getByText('Failed to toggle autoscroll. Please try again.'),
        ).toBeInTheDocument();
    });
});
