import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('@exo/lib/keybindings', () => ({
    keybindings: {register: vi.fn(), registerAll: vi.fn(), listen: vi.fn()},
}));
vi.mock('@exo/lib/clipboard', () => ({Clipboard: {write: vi.fn(async () => undefined)}}));
vi.mock('@exo/lib/toast-notification', () => ({
    Notifications: {show: vi.fn()},
    NotificationType: {Success: 'success', Error: 'error', Default: 'default'},
}));
vi.mock('@exo/plugins/save-page/download', () => ({downloadHtml: vi.fn()}));

async function load() {
    await import('@exo/plugins/save-page/page');
    const {keybindings} = await import('@exo/lib/keybindings');
    const {Clipboard} = await import('@exo/lib/clipboard');
    const {Notifications} = await import('@exo/lib/toast-notification');
    const {downloadHtml} = await import('@exo/plugins/save-page/download');
    const {savePageForClaude} = await import('@exo/plugins/save-page/page');
    return {keybindings, Clipboard, Notifications, downloadHtml, savePageForClaude};
}

describe('save-page page module', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.useFakeTimers({now: new Date('2026-11-04T12:00:00.000Z')});
        document.title = 'Example Fixture Page';
        document.body.innerHTML = '<h1>Hello</h1><div id="exo-notification-container">t</div>';
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('registers the global Cmd+Shift binding and listens', async () => {
        const {keybindings} = await load();
        expect(keybindings.register).toHaveBeenCalledWith(
            expect.objectContaining({
                key: 'd',
                modifiers: {meta: true, shift: true},
                context: 'Global',
            }),
        );
        expect(keybindings.listen).toHaveBeenCalled();
    });

    it('downloads the serialized page, copies the prompt, and toasts it', async () => {
        const {Clipboard, Notifications, downloadHtml, savePageForClaude} = await load();

        const filename = await savePageForClaude();

        expect(filename).toBe('example-fixture-page.1793793600.html');
        expect(downloadHtml).toHaveBeenCalledTimes(1);
        const [name, html] = vi.mocked(downloadHtml).mock.calls[0];
        expect(name).toBe(filename);
        expect(html).toContain('<h1>Hello</h1>');
        expect(html).toContain(`from ${window.location.href} at 2026-11-04T12:00:00.000Z`);
        expect(html).not.toContain('exo-notification-container');

        expect(Clipboard.write).toHaveBeenCalledWith(
            'Find the webpage @~/Downloads/example-fixture-page.1793793600.html',
        );
        expect(Notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({tag: 'save-page.saved', type: 'success'}),
        );
    });

    it('the binding handler reports a failure as an error toast', async () => {
        const {keybindings, Clipboard, Notifications} = await load();
        vi.mocked(Clipboard.write).mockRejectedValueOnce(new Error('denied'));
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const binding = vi.mocked(keybindings.register).mock.calls[0][0];
        binding.handler();
        await vi.runAllTimersAsync();

        expect(Notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({tag: 'save-page.failed', type: 'error'}),
        );
        expect(Notifications.show).not.toHaveBeenCalledWith(
            expect.objectContaining({tag: 'save-page.saved'}),
        );
    });
});
