import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {Notifications} from '@exo/lib/toast-notification';

/** Simulate the CSS animation completing on a notification's timer bar. */
function finishTimerBar(notification: HTMLElement): void {
    const timerBar = notification.querySelector('.exo-toast-timer-bar') as HTMLElement;
    timerBar.dispatchEvent(new Event('animationend'));
}

describe('Notifications', () => {
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

    describe('show', () => {
        it('should create a notification element', () => {
            Notifications.show({message: 'Test message'});

            const notification = container.querySelector('.chrome-ext-notification');
            expect(notification).toBeTruthy();
            expect(notification?.textContent).toBe('Test message');
        });

        it('sizes the toast via the size preset, defaulting to normal', () => {
            Notifications.show({message: 'default'});
            Notifications.show({message: 'small', size: 'small'});
            Notifications.show({message: 'large', size: 'large'});

            const sizes = Array.from(container.querySelectorAll('.chrome-ext-notification')).map(
                (el) => (el as HTMLElement).style.fontSize,
            );
            expect(sizes).toEqual(['18px', '14px', '22px']);
        });

        it('should set timer bar animation with specified duration', () => {
            Notifications.show({message: 'Test', duration: 2000});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;
            const timerBar = notification.querySelector('.exo-toast-timer-bar') as HTMLElement;

            expect(timerBar.style.animation).toContain('exo-toast-timer');
            expect(timerBar.style.animation).toContain('2000ms');
        });

        it('should use default duration for timer bar animation', () => {
            Notifications.show({message: 'Test'});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;
            const timerBar = notification.querySelector('.exo-toast-timer-bar') as HTMLElement;

            expect(timerBar.style.animation).toContain('5000ms');
        });

        it('should dismiss when timer bar animation ends', () => {
            vi.useFakeTimers();

            Notifications.show({message: 'Test', duration: 2000});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;

            finishTimerBar(notification);

            // Fade animation (300ms)
            vi.advanceTimersByTime(300);
            expect(notification.parentNode).toBeFalsy();

            vi.useRealTimers();
        });

        it('returns a handle that dismisses the toast early', () => {
            vi.useFakeTimers();

            const handle = Notifications.show({message: 'Test', duration: 100_000});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;
            expect(notification.parentNode).toBeTruthy();

            handle.dismiss();
            vi.advanceTimersByTime(300);
            expect(notification.parentNode).toBeFalsy();

            vi.useRealTimers();
        });

        it('calls onDismiss exactly once, however it is dismissed', () => {
            vi.useFakeTimers();

            const onDismiss = vi.fn();
            const handle = Notifications.show({message: 'Test', duration: 100_000, onDismiss});

            handle.dismiss();
            handle.dismiss(); // second dismiss must not re-fire
            expect(onDismiss).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(300);
            vi.useRealTimers();
        });

        it('calls onDismiss when the timer bar expires', () => {
            vi.useFakeTimers();

            const onDismiss = vi.fn();
            Notifications.show({message: 'Test', duration: 2000, onDismiss});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;

            finishTimerBar(notification);
            expect(onDismiss).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(300);
            vi.useRealTimers();
        });

        it('should create container automatically if not present', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (Notifications as any).container = null;
            const existingContainer = document.getElementById('exo-notification-container');
            if (existingContainer) existingContainer.remove();

            Notifications.show({message: 'Test message'});

            const createdContainer = document.getElementById('exo-notification-container');
            expect(createdContainer).toBeTruthy();
            expect(createdContainer?.children.length).toBe(1);

            createdContainer?.remove();
        });

        it('should reuse cached container', () => {
            Notifications.show({message: 'First message'});
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((Notifications as any).container).toBe(container);

            Notifications.show({message: 'Second message'});
            expect(container.children.length).toBe(2);
        });

        it('should handle notification removed before animation ends', () => {
            Notifications.show({message: 'Test', duration: 2000});
            const notification = container.querySelector('.chrome-ext-notification');
            notification?.remove();

            // Should not throw
            expect(() => {
                // Animation would never fire since element is removed, but just in case
            }).not.toThrow();
        });

        it('should dismiss on click by default', () => {
            vi.useFakeTimers();

            Notifications.show({message: 'Click me', duration: 10000});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;

            notification.click();

            vi.advanceTimersByTime(300);
            expect(container.querySelector('.chrome-ext-notification')).toBeFalsy();

            vi.useRealTimers();
        });

        it('should pause auto-dismiss on hover and resume on leave', () => {
            vi.useFakeTimers();

            Notifications.show({message: 'Hover me', duration: 1000});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;
            const timerBar = notification.querySelector('.exo-toast-timer-bar') as HTMLElement;

            // Hover pauses animation
            notification.dispatchEvent(new Event('mouseenter'));
            expect(timerBar.style.animationPlayState).toBe('paused');

            // Unhover resumes animation from where it was
            notification.dispatchEvent(new Event('mouseleave'));
            expect(timerBar.style.animationPlayState).toBe('running');

            // Animation ends after resume
            finishTimerBar(notification);
            vi.advanceTimersByTime(300);
            expect(notification.parentNode).toBeFalsy();

            vi.useRealTimers();
        });

        it('should show close button and call onClick when provided', () => {
            const onClick = vi.fn();
            Notifications.show({message: 'Custom click', onClick});

            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;
            expect(notification.style.cursor).toBe('pointer');

            const closeBtn = notification.querySelector('span');
            expect(closeBtn).toBeTruthy();
            // \u00D7 means dismiss \u2014 \u23F8 is reserved for the paused indicator.
            expect(closeBtn?.textContent).toBe('\u00D7');

            notification.click();
            expect(onClick).toHaveBeenCalledWith(notification);
        });

        it('should dismiss via close button without triggering onClick', () => {
            vi.useFakeTimers();

            const onClick = vi.fn();
            Notifications.show({message: 'Close me', onClick, duration: 10000});

            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;
            const closeBtn = notification.querySelector('span') as HTMLElement;

            closeBtn.click();
            vi.advanceTimersByTime(300);

            expect(onClick).not.toHaveBeenCalled();
            expect(container.querySelector('.chrome-ext-notification')).toBeFalsy();

            vi.useRealTimers();
        });
    });

    describe('hasVisible / dismissAll', () => {
        it('hasVisible reflects whether any toast is on screen', () => {
            expect(Notifications.hasVisible()).toBe(false);

            Notifications.show({message: 'One'});
            expect(Notifications.hasVisible()).toBe(true);
        });

        it('dismissAll dismisses every visible toast', () => {
            vi.useFakeTimers();

            Notifications.show({message: 'One'});
            Notifications.show({message: 'Two'});
            expect(container.querySelectorAll('.chrome-ext-notification')).toHaveLength(2);

            Notifications.dismissAll();
            vi.advanceTimersByTime(300);

            expect(container.querySelectorAll('.chrome-ext-notification')).toHaveLength(0);
            expect(Notifications.hasVisible()).toBe(false);

            vi.useRealTimers();
        });

        it('dismissAll fires each toast’s onDismiss exactly once', () => {
            const onDismiss = vi.fn();
            Notifications.show({message: 'One', onDismiss});

            Notifications.dismissAll();
            Notifications.dismissAll();

            expect(onDismiss).toHaveBeenCalledTimes(1);
        });
    });

    describe('dismissal is final', () => {
        it('hover during click dismissal does not revive the toast or orphan a spacer', () => {
            vi.useFakeTimers();

            Notifications.show({message: 'Click me', duration: 10000});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;

            notification.click();
            notification.dispatchEvent(new Event('mouseenter'));

            expect(container.querySelector('.exo-toast-spacer')).toBeFalsy();
            expect(notification.style.opacity).toBe('0');

            vi.advanceTimersByTime(300);
            expect(notification.parentNode).toBeFalsy();
            expect(container.querySelector('.exo-toast-spacer')).toBeFalsy();

            vi.useRealTimers();
        });

        it('hover during handle dismissal does not revive the toast or orphan a spacer', () => {
            vi.useFakeTimers();

            const handle = Notifications.show({message: 'Handled', duration: 10000});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;

            handle.dismiss();
            notification.dispatchEvent(new Event('mouseenter'));

            expect(container.querySelector('.exo-toast-spacer')).toBeFalsy();
            expect(notification.style.opacity).toBe('0');

            vi.advanceTimersByTime(300);
            expect(notification.parentNode).toBeFalsy();
            expect(container.querySelector('.exo-toast-spacer')).toBeFalsy();

            vi.useRealTimers();
        });
    });

    describe('hover pinning', () => {
        it('should insert spacer and pin notification on hover', () => {
            Notifications.show({message: 'Pin me', duration: 10000});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;

            notification.dispatchEvent(new Event('mouseenter'));

            expect(container.querySelector('.exo-toast-spacer')).toBeTruthy();
            expect(notification.style.position).toBe('absolute');
        });

        it('should remove spacer and unpin on mouseleave', () => {
            vi.useFakeTimers();

            Notifications.show({message: 'Pin me', duration: 10000});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;

            notification.dispatchEvent(new Event('mouseenter'));
            expect(container.querySelector('.exo-toast-spacer')).toBeTruthy();

            notification.dispatchEvent(new Event('mouseleave'));
            expect(container.querySelector('.exo-toast-spacer')).toBeFalsy();
            expect(notification.style.position).toBe('relative');

            vi.useRealTimers();
        });

        it('should clean up spacer when notification is dismissed while hovered', () => {
            vi.useFakeTimers();

            Notifications.show({message: 'Click me', duration: 10000});
            const notification = container.querySelector('.chrome-ext-notification') as HTMLElement;

            notification.dispatchEvent(new Event('mouseenter'));
            expect(container.querySelector('.exo-toast-spacer')).toBeTruthy();

            notification.click();
            vi.advanceTimersByTime(300);

            expect(container.querySelector('.exo-toast-spacer')).toBeFalsy();
            expect(container.querySelector('.chrome-ext-notification')).toBeFalsy();

            vi.useRealTimers();
        });
    });

    describe('per-notification independence', () => {
        it('should dismiss each notification independently via animationend', () => {
            vi.useFakeTimers();

            Notifications.show({message: 'First', duration: 1000});
            Notifications.show({message: 'Second', duration: 5000});

            const notifications = container.querySelectorAll('.chrome-ext-notification');
            expect(notifications.length).toBe(2);

            // First animation ends
            finishTimerBar(notifications[0] as HTMLElement);
            vi.advanceTimersByTime(300);

            const remaining = container.querySelectorAll('.chrome-ext-notification');
            expect(remaining.length).toBe(1);
            expect(remaining[0].textContent).toBe('Second');

            // Second animation ends
            finishTimerBar(remaining[0] as HTMLElement);
            vi.advanceTimersByTime(300);
            expect(container.querySelectorAll('.chrome-ext-notification').length).toBe(0);

            vi.useRealTimers();
        });

        it('should not dismiss hovered notification when sibling animation ends', () => {
            vi.useFakeTimers();

            Notifications.show({message: 'First', duration: 1000});
            Notifications.show({message: 'Hovered', duration: 1000});

            const notifications = container.querySelectorAll('.chrome-ext-notification');
            const hovered = notifications[1] as HTMLElement;

            // Hover second notification (pauses its animation)
            hovered.dispatchEvent(new Event('mouseenter'));

            // First's animation ends
            finishTimerBar(notifications[0] as HTMLElement);
            vi.advanceTimersByTime(300);

            const remaining = container.querySelectorAll('.chrome-ext-notification');
            expect(remaining.length).toBe(1);
            expect(remaining[0].textContent).toBe('Hovered');

            vi.useRealTimers();
        });
    });
});

describe('teardown', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('drops every toast and the container, and a later show starts a fresh container', () => {
        Notifications.show({message: 'one'});
        Notifications.show({message: 'two'});
        expect(document.querySelectorAll('.chrome-ext-notification')).toHaveLength(2);

        Notifications.teardown();
        expect(document.getElementById('exo-notification-container')).toBeNull();
        expect(Notifications.hasVisible()).toBe(false);

        Notifications.show({message: 'again'});
        expect(document.querySelectorAll('#exo-notification-container')).toHaveLength(1);
        expect(document.querySelectorAll('.chrome-ext-notification')).toHaveLength(1);
    });

    it('is harmless before anything was shown', () => {
        Notifications.teardown();
        expect(document.getElementById('exo-notification-container')).toBeNull();
    });
});
