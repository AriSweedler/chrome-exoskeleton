import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {
    currentPanelView,
    isPanelOpen,
    panelToggle,
    showPanelView,
    togglePanel,
} from '@exo/plugins/github-autoscroll/panel';
import {installPanelBehavior, renderPanelPage} from '@exo/plugins/github-autoscroll/test-dom';

describe('the docked side panel', () => {
    let uninstall: () => void;

    const settle = async <T>(promise: Promise<T>): Promise<T> => {
        await vi.advanceTimersByTimeAsync(1000);
        return promise;
    };

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = renderPanelPage();
        uninstall = installPanelBehavior(document);
    });

    afterEach(() => {
        uninstall();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('reads a closed panel: no view', () => {
        expect(panelToggle()).not.toBeNull();
        expect(isPanelOpen()).toBe(false);
        expect(currentPanelView()).toBeNull();
    });

    it('opens on the view GitHub restores, then closes', async () => {
        expect(await settle(togglePanel())).toEqual({kind: 'opened', view: 'Merge status'});
        expect(isPanelOpen()).toBe(true);
        expect(await settle(togglePanel())).toEqual({kind: 'closed'});
        expect(isPanelOpen()).toBe(false);
        expect(currentPanelView()).toBeNull();
    });

    it('reports a page without the panel', async () => {
        document.body.innerHTML = '<main></main>';
        expect(await settle(togglePanel())).toEqual({kind: 'no-panel'});
        expect(await settle(showPanelView({position: 1}))).toEqual({kind: 'no-panel'});
    });

    it('picks a view by menu position, through the menu, and closes the menu', async () => {
        await settle(togglePanel());
        expect(await settle(showPanelView({position: 3}))).toEqual({
            kind: 'shown',
            view: 'Activity',
        });
        expect(currentPanelView()).toBe('Activity');
        expect(document.querySelector('[role="menu"]')).toBeNull();
        expect(await settle(showPanelView({position: 2}))).toEqual({
            kind: 'shown',
            view: 'Description',
        });
        expect(currentPanelView()).toBe('Description');
    });

    it('picks a view by a word of its name, case-insensitively', async () => {
        await settle(togglePanel());
        await settle(showPanelView({position: 3}));
        expect(await settle(showPanelView({named: 'STATUS'}))).toEqual({
            kind: 'shown',
            view: 'Merge status',
        });
        expect(currentPanelView()).toBe('Merge status');
    });

    it('leaves the view alone when it already shows, without opening the menu', async () => {
        await settle(togglePanel());
        expect(await settle(showPanelView({named: 'status'}))).toEqual({
            kind: 'already',
            view: 'Merge status',
        });
        expect(await settle(showPanelView({position: 1}))).toEqual({
            kind: 'already',
            view: 'Merge status',
        });
        expect(document.querySelector('[role="menu"]')).toBeNull();
    });

    it('names the views on offer when the pick is not among them, and closes the menu', async () => {
        await settle(togglePanel());
        expect(await settle(showPanelView({position: 7}))).toEqual({
            kind: 'no-such-view',
            pick: {position: 7},
            views: ['Merge status', 'Description', 'Activity'],
        });
        expect(await settle(showPanelView({named: 'copilot'}))).toMatchObject({
            kind: 'no-such-view',
        });
        expect(document.querySelector('[role="menu"]')).toBeNull();
        expect(isPanelOpen()).toBe(true);
    });

    it('finds the menu that just opened when it does not name its button', async () => {
        uninstall();
        uninstall = installPanelBehavior(document);
        await settle(togglePanel());
        const observer = new MutationObserver(() =>
            document.querySelector('#exo-test-panel-menu')?.removeAttribute('aria-labelledby'),
        );
        observer.observe(document.body, {childList: true});
        expect(await settle(showPanelView({position: 2}))).toEqual({
            kind: 'shown',
            view: 'Description',
        });
        observer.disconnect();
    });
});
