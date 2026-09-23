import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {diffSettingsButton, toggleDiffLayout} from '@exo/plugins/github-autoscroll/layout';
import {
    GITHUB_LAYOUT_MENU_SCRIPT_BEHAVIOR,
    installLayoutMenu,
    renderToolbar,
} from '@exo/plugins/github-autoscroll/test-dom';

describe('toggleDiffLayout', () => {
    let uninstall: () => void;

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = renderToolbar('unified');
        uninstall = installLayoutMenu(document);
    });

    afterEach(() => {
        uninstall();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('finds the gear by its icon inside the files toolbar', () => {
        expect(diffSettingsButton()).not.toBeNull();
        expect(diffSettingsButton()?.querySelector('svg.octicon-gear')).not.toBeNull();
    });

    it('opens the menu, clicks the other layout, and the menu closes', async () => {
        const toggled = toggleDiffLayout();
        await vi.advanceTimersByTimeAsync(400);
        expect(await toggled).toEqual({kind: 'switched', to: 'split'});
        expect(document.body.dataset.layout).toBe('split');
        expect(document.querySelector('[role="menu"]')).toBeNull();

        const back = toggleDiffLayout();
        await vi.advanceTimersByTimeAsync(400);
        expect(await back).toEqual({kind: 'switched', to: 'unified'});
        expect(document.body.dataset.layout).toBe('unified');
    });

    it('uses a menu that is already open', async () => {
        diffSettingsButton()!.click();
        await vi.advanceTimersByTimeAsync(60);
        expect(document.querySelector('[role="menu"]')).not.toBeNull();
        const toggled = toggleDiffLayout();
        await vi.advanceTimersByTimeAsync(400);
        expect(await toggled).toEqual({kind: 'switched', to: 'split'});
    });

    it('reports a missing gear, and a menu without layout items (closing it again)', async () => {
        document.body.innerHTML = '<main>no toolbar</main>';
        expect(await toggleDiffLayout()).toEqual({kind: 'no-settings-button'});

        document.body.innerHTML = renderToolbar('unified');
        uninstall();
        uninstall = installLayoutMenu(document, {items: false});
        const toggled = toggleDiffLayout();
        await vi.advanceTimersByTimeAsync(2_000);
        expect(await toggled).toEqual({kind: 'no-layout-items'});
        expect(document.querySelector('[role="menu"]')).toBeNull();
        expect(GITHUB_LAYOUT_MENU_SCRIPT_BEHAVIOR).toContain('menuitemradio');
    });
});
