import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {Notifications} from '@exo/lib/toast-notification';
import {showToastPayload} from '@exo/lib/actions/show-toast.action';

describe('showToastPayload', () => {
    let container: HTMLElement;

    beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Notifications as any).container = null;
        container = document.createElement('div');
        container.id = 'exo-notification-container';
        document.body.appendChild(container);
    });

    afterEach(() => {
        if (container.parentNode) {
            container.parentNode.removeChild(container);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Notifications as any).container = null;
        vi.clearAllTimers();
    });

    it('renders the message without detail', () => {
        showToastPayload({message: 'Copied!'});

        const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;
        expect(notification.textContent).toContain('Copied!');
    });

    it('renders the message headline alongside the detail block', async () => {
        showToastPayload({
            message: 'Nothing to copy here',
            detail: 'Tried: staging, production',
        });

        const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;
        await vi.waitFor(() => {
            expect(notification.textContent).toContain('Nothing to copy here');
            expect(notification.textContent).toContain('Tried: staging, production');
        });
        expect(notification.querySelector('pre')?.textContent).toBe('Tried: staging, production');
    });
});
