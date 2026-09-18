import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {TabEnablementSection} from '@exo/lib/popup-exo-tabs/TabEnablementSection';

describe('TabEnablementSection', () => {
    beforeEach(() => {
        vi.stubGlobal('chrome', {
            storage: {
                local: {
                    get: vi.fn((_key, callback) => {
                        callback({});
                    }),
                    set: vi.fn((_, callback) => {
                        if (callback) callback();
                    }),
                },
            },
        });
    });

    it('renders checkbox with enabled label by default', async () => {
        render(<TabEnablementSection tabId="test-tab" />);

        await waitFor(() => {
            expect(screen.getByText(/Enable on page load:/)).toBeInTheDocument();
        });

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeChecked();
        expect(screen.getByText('Enabled')).toBeInTheDocument();
    });

    it('renders checkbox with disabled label when storage is false', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chrome.storage.local.get = vi.fn((_key: any, callback: any) => {
            callback({'exorun-test-tab': false});
        }) as unknown as typeof chrome.storage.local.get;

        render(<TabEnablementSection tabId="test-tab" />);

        await waitFor(() => {
            expect(screen.getByText(/Enable on page load:/)).toBeInTheDocument();
        });

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).not.toBeChecked();
        expect(screen.getByText('Disabled')).toBeInTheDocument();
    });

    it('toggles enabled state when checkbox is clicked', async () => {
        const user = userEvent.setup();

        render(<TabEnablementSection tabId="test-tab" />);

        await waitFor(() => {
            expect(screen.getByText('Enabled')).toBeInTheDocument();
        });

        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        await waitFor(() => {
            expect(screen.getByText('Disabled')).toBeInTheDocument();
        });

        expect(chrome.storage.local.set).toHaveBeenCalledWith(
            {'exorun-test-tab': false},
            expect.any(Function),
        );
    });
});
