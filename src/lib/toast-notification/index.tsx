import type {ReactNode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {renderMarkdown} from './markdown';
import {theme} from './theme';

const DEFAULT_DURATION_MS = 5000;

export enum NotificationType {
    Success = 'success',
    Error = 'error',
    Default = 'default',
}

/** Toast size preset — sets the root font size; all inner text scales with it. */
export type ToastSize = keyof typeof theme.toast.fontSize;

export interface NotificationOptions {
    /** Plain-text body. Used for logging even when `markdown`/`children` render the UI. */
    message?: string;
    /** Markdown body (a small subset). Rendered to plain DOM — safe in content scripts. */
    markdown?: string;
    type?: NotificationType;
    size?: ToastSize;
    duration?: number;
    replace?: boolean;
    opacity?: number;
    children?: ReactNode;
    onClick?: (notification: HTMLElement) => void;
    /** Called once when the toast is dismissed — by its timer, a click, or its handle. */
    onDismiss?: () => void;
}

/** Handle returned by Notifications.show, letting the caller dismiss it early. */
export interface ToastHandle {
    dismiss: () => void;
}

/**
 * Create a layout pin for a notification element.
 * Prevents layout shift when sibling notifications are removed by pinning
 * the notification in place and inserting a spacer element.
 */
function createLayoutPin(notification: HTMLElement, container: HTMLElement) {
    let spacer: HTMLElement | null = null;
    let layoutObserver: MutationObserver | null = null;
    let pinnedTop = 0;
    let pinnedHeight = 0;

    const cleanup = () => {
        if (layoutObserver) {
            layoutObserver.disconnect();
            layoutObserver = null;
        }
        if (spacer) {
            spacer.remove();
            spacer = null;
        }
        notification.style.position = 'relative';
        notification.style.top = '';
        notification.style.left = '';
        notification.style.right = '';
    };

    const pin = () => {
        if (spacer) return;

        pinnedTop = notification.offsetTop;
        pinnedHeight = notification.offsetHeight;
        const rect = notification.getBoundingClientRect();

        spacer = document.createElement('div');
        spacer.className = 'exo-toast-spacer';
        spacer.style.cssText = `
            height: ${pinnedHeight}px;
            min-width: ${rect.width}px;
            margin-bottom: ${theme.toast.marginBottom};
        `;
        notification.parentNode!.insertBefore(spacer, notification);
        notification.style.position = 'absolute';
        notification.style.top = `${pinnedTop}px`;
        notification.style.left = '0';
        notification.style.right = '0';

        layoutObserver = new MutationObserver(() => {
            if (!spacer) return;
            const spacerTop = spacer.offsetTop;
            if (spacerTop > pinnedTop) {
                pinnedTop = spacerTop;
                notification.style.top = `${spacerTop}px`;
            }
            spacer.style.height = `${pinnedTop + pinnedHeight - spacerTop}px`;
        });
        layoutObserver.observe(container, {childList: true});
    };

    return {pin, cleanup};
}

/**
 * One owner for a toast's held presentation and its countdown clock.
 *
 * Two ways to hold a toast \u2014 hovering it and right-click pinning it \u2014 feed
 * one `held` predicate, and a single sync() is the sole writer of the timer
 * bar's play state and the held visuals. The visible state and the countdown
 * are one mechanism and cannot disagree: unpausing under the cursor stays
 * held (still hovered), and a paused toast keeps its held look after the
 * pointer leaves.
 */
function attachInteractionState(
    notification: HTMLElement,
    timerBar: HTMLElement,
    opts: {
        pin: () => void;
        cleanupPin: () => void;
        isDismissing: () => boolean;
        colors: {base: string; hover: string; opacity: number};
    },
) {
    const {pin, cleanupPin, isDismissing, colors} = opts;
    let hovered = false;
    let paused = false;
    let pausedLabel: HTMLElement | null = null;

    const sync = () => {
        if (isDismissing()) return;
        const held = hovered || paused;
        timerBar.style.animationPlayState = held ? 'paused' : 'running';
        notification.style.opacity = held ? '1' : String(colors.opacity);
        notification.style.background = held ? colors.hover : colors.base;
        notification.style.boxShadow = held ? theme.shadow.overlay : theme.shadow.sm;

        if (paused && !pausedLabel) {
            pausedLabel = document.createElement('span');
            pausedLabel.textContent = '\u23F8';
            pausedLabel.style.cssText = `
                position: absolute;
                bottom: 4px;
                right: 8px;
                font-size: 0.6em;
                color: hsla(0, 0%, 100%, 1);
                pointer-events: none;
            `;
            notification.appendChild(pausedLabel);
        } else if (!paused && pausedLabel) {
            pausedLabel.remove();
            pausedLabel = null;
        }
    };

    notification.addEventListener('mouseenter', () => {
        if (isDismissing()) return;
        hovered = true;
        pin();
        sync();
    });
    notification.addEventListener('mouseleave', () => {
        hovered = false;
        cleanupPin();
        sync();
    });
    notification.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        paused = !paused;
        sync();
    });
}

export class Notifications {
    private static container: HTMLElement | null = null;
    private static currentNotification: HTMLElement | null = null;
    private static keyframesInjected = false;
    private static pinCleanups = new WeakMap<HTMLElement, () => void>();
    private static reactRoots = new WeakMap<HTMLElement, Root>();
    private static dismissCallbacks = new WeakMap<HTMLElement, () => void>();
    private static dismissing = new WeakSet<HTMLElement>();

    /**
     * Show a toast notification.
     */
    static show(options: NotificationOptions): ToastHandle {
        const {
            message,
            markdown,
            type = NotificationType.Success,
            size = 'normal',
            duration = DEFAULT_DURATION_MS,
            replace,
            opacity = 0.95,
            children,
            onClick,
            onDismiss,
        } = options;

        console.log(`[exo toast] ${markdown ?? message ?? ''}`);

        this.injectKeyframes();

        // Use existing container if present (for testing)
        if (!this.container) {
            this.container = document.getElementById('exo-notification-container');
        }
        if (!this.container) {
            this.createContainer();
        }

        // If replace is true, remove current notification immediately
        if (replace && this.currentNotification) {
            this.dismiss(this.currentNotification, true);
        }

        const notification = document.createElement('div');
        notification.className = 'chrome-ext-notification';

        const {cssText, backgroundColor} = this.buildNotificationStyle(type, opacity, size);
        notification.style.cssText = cssText;

        // Content body, in priority order: markdown (plain-DOM render) > React
        // children > plain message. `message` is still used above for logging.
        if (markdown !== undefined) {
            notification.appendChild(renderMarkdown(markdown));
        } else if (children) {
            this.renderChildren(notification, children);
        } else {
            notification.appendChild(this.createMessageElement(message ?? ''));
        }

        // Timer bar — CSS animation is the single source of truth for auto-dismiss
        const timerBar = this.createTimerBar(duration);
        notification.appendChild(timerBar);

        const {isDismissing} = this.attachAutoDismiss(notification, timerBar);

        const {pin, cleanup: cleanupPin} = createLayoutPin(notification, this.container!);
        this.pinCleanups.set(notification, cleanupPin);

        const hoverBg = backgroundColor.replace(/[\d.]+\)$/, '1)');
        this.attachClickHandler(notification, onClick);
        attachInteractionState(notification, timerBar, {
            pin,
            cleanupPin,
            isDismissing,
            colors: {base: backgroundColor, hover: hoverBg, opacity},
        });

        if (onDismiss) {
            this.dismissCallbacks.set(notification, onDismiss);
        }

        this.container!.appendChild(notification);
        this.currentNotification = notification;

        return {dismiss: () => this.dismiss(notification)};
    }

    /** True while any toast is on screen (including one fading out). */
    static hasVisible(): boolean {
        return Boolean(this.container?.querySelector('.chrome-ext-notification'));
    }

    /** Dismiss every visible toast. */
    static dismissAll(): void {
        const toasts = this.container?.querySelectorAll('.chrome-ext-notification') ?? [];
        toasts.forEach((toast) => this.dismiss(toast as HTMLElement));
    }

    private static dismiss(notification: HTMLElement, immediate?: boolean): void {
        // Mark as dismissing so hover handlers cannot revive the toast.
        this.dismissing.add(notification);
        // A dismissed toast leaves the interactive layer the moment it
        // starts leaving the visual one: no clicks, hovers, or context
        // menus on a fading ghost.
        notification.style.pointerEvents = 'none';

        // Fire the dismiss callback exactly once (timer, click, or handle).
        const onDismiss = this.dismissCallbacks.get(notification);
        if (onDismiss) {
            this.dismissCallbacks.delete(notification);
            onDismiss();
        }

        // Stop timer bar animation to prevent animationend from re-firing
        const timerBar = notification.querySelector('.exo-toast-timer-bar') as HTMLElement | null;
        if (timerBar) timerBar.style.animation = 'none';

        // Clean up pin spacer if present
        const cleanupPin = this.pinCleanups.get(notification);
        if (cleanupPin) cleanupPin();

        // Clean up React root if present
        const root = this.reactRoots.get(notification);
        if (root) root.unmount();

        if (immediate) {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            if (this.currentNotification === notification) {
                this.currentNotification = null;
            }
            return;
        }

        // Animated dismiss — the fade transition IS the removal clock
        // (both it and the fallback below derive from the one fadeMs token,
        // so they cannot drift). The timeout only covers environments where
        // transition events never fire (jsdom, reduced motion).
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(20px)';
        const remove = () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            if (this.currentNotification === notification) {
                this.currentNotification = null;
            }
        };
        notification.addEventListener('transitionend', (event) => {
            if (event.target === notification && event.propertyName === 'opacity') {
                remove();
            }
        });
        setTimeout(remove, theme.toast.fadeMs);
    }

    private static attachClickHandler(
        notification: HTMLElement,
        onClick?: (notification: HTMLElement) => void,
    ): void {
        if (onClick) {
            notification.appendChild(this.createCloseButton(notification));
        }
        notification.addEventListener('click', (e) => {
            if (e.button !== 0) return;
            if (onClick) {
                onClick(notification);
            } else {
                this.dismiss(notification);
            }
        });
    }

    private static buildNotificationStyle(
        type: NotificationType,
        opacity: number,
        size: ToastSize,
    ): {cssText: string; backgroundColor: string} {
        let backgroundColor = theme.toast.bg[type] as string;
        if (opacity !== 1) {
            backgroundColor = backgroundColor.replace(/[\d.]+\)$/, `${0.8 * opacity})`);
        }
        return {
            backgroundColor,
            cssText: `
                position: relative;
                padding: ${theme.toast.padding};
                margin-bottom: ${theme.toast.marginBottom};
                background: ${backgroundColor};
                color: ${theme.text.white};
                border-radius: ${theme.toast.borderRadius};
                font-size: ${theme.toast.fontSize[size]};
                box-shadow: ${theme.shadow.sm};
                line-height: ${theme.toast.lineHeight};
                transition: opacity ${theme.toast.fadeMs}ms ease-out, transform ${theme.toast.fadeMs}ms ease-out, box-shadow ${theme.toast.fadeMs}ms ease-out;
                opacity: ${opacity};
                transform: translateX(0);
                overflow: hidden;
                box-sizing: border-box;
                cursor: pointer;
            `,
        };
    }

    private static attachAutoDismiss(
        notification: HTMLElement,
        timerBar: HTMLElement,
    ): {isDismissing: () => boolean} {
        timerBar.addEventListener('animationend', () => {
            this.dismiss(notification);
        });
        return {isDismissing: () => this.dismissing.has(notification)};
    }

    private static renderChildren(notification: HTMLElement, children: ReactNode): void {
        const container = document.createElement('div');
        notification.appendChild(container);
        const root = createRoot(container);
        root.render(children);
        this.reactRoots.set(notification, root);
    }

    private static createMessageElement(message: string): HTMLElement {
        const el = document.createElement('div');
        el.textContent = message;
        el.style.cssText = 'font-weight: 500;';
        return el;
    }

    private static createTimerBar(duration: number): HTMLElement {
        const timerBar = document.createElement('div');
        timerBar.className = 'exo-toast-timer-bar';
        timerBar.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            height: ${theme.toast.timerBarHeight};
            background: ${theme.toast.timerBarColor};
            border-radius: 0 0 ${theme.toast.borderRadius} ${theme.toast.borderRadius};
            animation: exo-toast-timer ${duration}ms linear forwards;
        `;
        return timerBar;
    }

    private static createCloseButton(notification: HTMLElement): HTMLElement {
        const closeBtn = document.createElement('span');
        // \u00D7 means dismiss \u2014 \u23F8 is reserved for the paused-state indicator.
        closeBtn.textContent = '\u00D7';
        closeBtn.style.cssText = `
            position: absolute;
            top: 4px;
            right: 8px;
            font-size: ${theme.toast.closeBtnFontSize};
            color: ${theme.toast.closeBtnDefault};
            cursor: pointer;
            line-height: 1;
        `;
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.color = theme.toast.closeBtnHover;
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.color = theme.toast.closeBtnDefault;
        });
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // dismiss() cleans the layout pin via pinCleanups.
            this.dismiss(notification);
        });
        return closeBtn;
    }

    private static injectKeyframes(): void {
        if (this.keyframesInjected) return;
        const style = document.createElement('style');
        style.textContent = `
            @keyframes exo-toast-timer {
                from { width: 0%; }
                to { width: 100%; }
            }
        `;
        document.head.appendChild(style);
        this.keyframesInjected = true;
    }

    private static createContainer(): void {
        this.container = document.createElement('div');
        this.container.id = 'exo-notification-container';
        this.container.style.cssText = `
            position: fixed;
            top: ${theme.toast.containerTop};
            right: ${theme.toast.containerRight};
            z-index: ${theme.toast.containerZIndex};
            min-width: ${theme.toast.containerMinWidth};
            max-width: max-content;
        `;
        document.body.appendChild(this.container);
    }
}
