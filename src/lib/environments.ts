import type {Keybinding} from '@exo/lib/keybindings';
import {Notifications, NotificationType} from '@exo/lib/toast-notification';

export interface EnvironmentInfo {
    env: string;
    url: string;
    current: boolean;
}

/** The environment after the current one in rotation, or undefined. */
export function nextEnvironment(envs: EnvironmentInfo[] | undefined): EnvironmentInfo | undefined {
    if (!envs?.length) return undefined;
    const currentIdx = envs.findIndex((e) => e.current);
    return envs[(currentIdx + 1) % envs.length];
}

/** Every environment-cycling site binds the same key: Shift+E. */
export const ENV_CYCLE_KEY = 'E';

export interface EnvCycleBindingOptions {
    /** The page's environments, derived from its URL at keypress time. */
    getEnvs: (url: string) => EnvironmentInfo[] | undefined;
    /** Help-overlay grouping, e.g. 'Deploys'. */
    context: string;
    /** What the toast names — the environment by default. */
    label?: (next: EnvironmentInfo) => string;
}

/**
 * A page-side keybinding that cycles the page to the next environment in
 * rotation. Inactive (the key falls through to the page) wherever there is no
 * rotation, so it can be registered site-wide on SPAs. Runs in the page, so
 * it navigates with window.location — no service worker involved.
 */
export function makeEnvCycleBinding({
    getEnvs,
    context,
    label = (next) => next.env,
}: EnvCycleBindingOptions): Keybinding {
    const next = () => nextEnvironment(getEnvs(window.location.href));
    return {
        key: ENV_CYCLE_KEY,
        modifiers: {shift: true},
        description: 'Switch to the next environment',
        context,
        when: () => next() !== undefined,
        handler: () => {
            const target = next();
            if (!target) return;
            Notifications.show({
                message: `Navigating to ${label(target)}`,
                type: NotificationType.Success,
                duration: 2000,
            });
            window.location.assign(target.url);
        },
    };
}
