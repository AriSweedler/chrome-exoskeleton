import {describe, it, expect, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import chrome from 'sinon-chrome';
import {ToastFiltersSection} from '@exo/popup/ToastFiltersSection';
import {TOAST_MUTES_KEY} from '@exo/lib/toast-mutes';

describe('ToastFiltersSection', () => {
    /** The stored list, read and written through the mocked chrome.storage. */
    let stored: string[];

    beforeEach(() => {
        stored = [];
        chrome.storage.local.get.callsFake(
            (_key: string, callback: (items: Record<string, unknown>) => void) =>
                callback({[TOAST_MUTES_KEY]: stored}),
        );
        chrome.storage.local.set.callsFake(
            (items: Record<string, string[]>, callback?: () => void) => {
                stored = items[TOAST_MUTES_KEY] ?? [];
                callback?.();
            },
        );
    });

    it('lists every stored filter with an unmute button', async () => {
        stored = ['keystroke', 'github.sweep'];
        render(<ToastFiltersSection />);
        expect(await screen.findByRole('button', {name: 'Unmute keystroke'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Unmute github.sweep'})).toBeInTheDocument();
    });

    it('mutes the typed tag, normalized, and clears the draft', async () => {
        render(<ToastFiltersSection />);
        const input = await screen.findByLabelText('Toast tag to mute');
        const mute = screen.getByRole('button', {name: 'Mute'});
        expect(mute).toBeDisabled();

        fireEvent.change(input, {target: {value: '  GitHub.Sweep '}});
        expect(mute).toBeEnabled();
        fireEvent.click(mute);

        expect(
            await screen.findByRole('button', {name: 'Unmute github.sweep'}),
        ).toBeInTheDocument();
        expect(stored).toEqual(['github.sweep']);
        expect((input as HTMLInputElement).value).toBe('');
    });

    it('unmutes a filter from its button', async () => {
        stored = ['keystroke', 'github'];
        render(<ToastFiltersSection />);
        fireEvent.click(await screen.findByRole('button', {name: 'Unmute keystroke'}));
        await waitFor(() =>
            expect(
                screen.queryByRole('button', {name: 'Unmute keystroke'}),
            ).not.toBeInTheDocument(),
        );
        expect(screen.getByRole('button', {name: 'Unmute github'})).toBeInTheDocument();
        expect(stored).toEqual(['github']);
    });
});
