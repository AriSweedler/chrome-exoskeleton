import {describe, it, expect, beforeEach, vi} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import chrome from 'sinon-chrome';
import {HelpHint} from '@exo/lib/popup-tabs/HelpHint';

const hint = () => screen.getByRole('button', {name: /press \? on the page to see keybindings/i});

describe('HelpHint', () => {
    beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (chrome.runtime as any).lastError;
        chrome.tabs.query.resolves([{id: 123}]);
    });

    it('renders the hint as a button', () => {
        render(<HelpHint />);
        expect(hint()).toBeInTheDocument();
    });

    it('clicking it asks the active tab to show the help overlay, then closes the popup', async () => {
        const close = vi.spyOn(window, 'close').mockImplementation(() => {});
        chrome.tabs.sendMessage.yields({success: true, data: undefined});
        render(<HelpHint />);

        await userEvent.click(hint());

        await waitFor(() => expect(close).toHaveBeenCalled());
        const [tabId, message] = chrome.tabs.sendMessage.firstCall.args;
        expect(tabId).toBe(123);
        expect(message).toEqual({type: 'SHOW_HELP'});
        expect(screen.queryByTestId('error-message')).toBeNull();
    });

    it('keeps the popup open and says so when no page answers', async () => {
        const close = vi.spyOn(window, 'close').mockImplementation(() => {});
        chrome.tabs.sendMessage.yields({success: false, error: 'Could not establish connection'});
        render(<HelpHint />);

        await userEvent.click(hint());

        expect(await screen.findByTestId('error-message')).toHaveTextContent(/reach the page/);
        expect(close).not.toHaveBeenCalled();
    });
});
