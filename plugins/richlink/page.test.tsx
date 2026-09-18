import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render} from '@testing-library/react';
import {Clipboard} from '@exo/lib/clipboard';
import {Notifications} from '@exo/lib/toast-notification';
import {HandlerRegistry} from '@exo/plugins/richlink/handlers';
import {copyRichLink} from '@exo/plugins/richlink/page';

/**
 * The Cmd+Shift+C keybinding calls copyRichLink, which resolves formats via
 * HandlerRegistry.getAllFormats(url), picks formats[i], and writes
 * format.text / format.html to the clipboard.
 *
 * These tests zip both codepaths together: for each format the registry
 * offers, call copyRichLink with that formatIndex, then assert the clipboard
 * received the matching text and html.
 */

vi.mock('@exo/lib/clipboard', () => ({
    Clipboard: {write: vi.fn()},
}));
vi.mock('@exo/lib/toast-notification', () => ({
    Notifications: {show: vi.fn()},
    NotificationType: {Success: 'success', Error: 'error'},
}));
vi.mock('@exo/plugins/richlink/format-cycling', () => ({
    CYCLE_WINDOW_MS: 3000,
    getNextFormatIndex: vi.fn().mockReturnValue(0),
    cacheFormatIndex: vi.fn(),
    isCycling: vi.fn().mockReturnValue(false),
    clearCycleState: vi.fn(),
}));

describe('popup/page format parity', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.mocked(Clipboard.write).mockClear();
    });

    it('GitHub PR: every popup format matches what gets copied', async () => {
        const titleEl = document.createElement('span');
        titleEl.className = 'markdown-title';
        titleEl.textContent = 'Fix auth flow';
        document.body.appendChild(titleEl);

        const url = 'https://github.com/org/repo/pull/42';
        const popupFormats = HandlerRegistry.getAllFormats(url);

        for (let i = 0; i < popupFormats.length; i++) {
            vi.mocked(Clipboard.write).mockClear();
            const result = await copyRichLink({url, formatIndex: i});

            expect(result.formatIndex).toBe(i);
            expect(result.totalFormats).toBe(popupFormats.length);
            expect(Clipboard.write).toHaveBeenCalledWith(
                popupFormats[i].text,
                popupFormats[i].html,
            );
        }
    });

    it('copy toast: Copier and Next metadata as chips, copied title as the data line below', async () => {
        document.title = 'Example Page';
        const url = 'https://example.com/some-page';

        await copyRichLink({url, formatIndex: 0});

        const calls = vi.mocked(Notifications.show).mock.calls;
        const toast = calls[calls.length - 1]?.[0];
        const {container, getByText} = render(<>{toast?.children}</>);

        // Metadata: the copier's label and each Next label are standalone chips.
        expect(container.textContent).toContain('Copier:');
        expect(getByText('Page Title')).toBeInTheDocument();
        expect(container.textContent).toContain('Next:');
        expect(getByText('Raw URL')).toBeInTheDocument();

        // Data: the copied title (not the raw "title (url)" clipboard string),
        // rendered below the metadata lines.
        expect(container.textContent).toContain('Example Page');
        expect(container.textContent).not.toContain(url);
        const lines = Array.from(container.querySelectorAll(':scope > div'));
        expect(lines[lines.length - 1]?.textContent).toBe('Example Page');
    });

    it('plain URL (no specialized handler): fallback formats match', async () => {
        document.title = 'Example Page';

        const url = 'https://example.com/some-page';
        const popupFormats = HandlerRegistry.getAllFormats(url);

        for (let i = 0; i < popupFormats.length; i++) {
            vi.mocked(Clipboard.write).mockClear();
            const result = await copyRichLink({url, formatIndex: i});

            expect(result.formatIndex).toBe(i);
            expect(result.totalFormats).toBe(popupFormats.length);
            expect(Clipboard.write).toHaveBeenCalledWith(
                popupFormats[i].text,
                popupFormats[i].html,
            );
        }
    });
});
