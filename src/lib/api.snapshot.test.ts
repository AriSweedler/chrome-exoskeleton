import {describe, it, expect} from 'vitest';

/**
 * The framework's public surface, as plugins see it. A plugin may import
 * @exo/lib/* and @exo/theme/*; this test pins each module's export names so
 * removing or renaming one is a deliberate, reviewed change (update the
 * inline snapshot) rather than a silent break of a plugin in another tier.
 */

const modules = {
    '@exo/lib/actions/base-action': () => import('@exo/lib/actions/base-action'),
    '@exo/lib/actions/show-toast.action': () => import('@exo/lib/actions/show-toast.action'),
    '@exo/lib/clipboard': () => import('@exo/lib/clipboard'),
    '@exo/lib/dom': () => import('@exo/lib/dom'),
    '@exo/lib/environments': () => import('@exo/lib/environments'),
    '@exo/lib/example-dom': () => import('@exo/lib/example-dom'),
    '@exo/lib/keybindings': () => import('@exo/lib/keybindings'),
    '@exo/lib/lifecycle': () => import('@exo/lib/lifecycle'),
    '@exo/lib/popup-tabs/tab-registry': () => import('@exo/lib/popup-tabs/tab-registry'),
    '@exo/lib/popup-tabs/environment-ui': () => import('@exo/lib/popup-tabs/environment-ui'),
    '@exo/lib/popup-tabs/use-tab-enablement': () =>
        import('@exo/lib/popup-tabs/use-tab-enablement'),
    '@exo/lib/richlink': () => import('@exo/lib/richlink'),
    '@exo/lib/service-worker/tabs': () => import('@exo/lib/service-worker/tabs'),
    '@exo/lib/service-worker/navigate-with-toast': () =>
        import('@exo/lib/service-worker/navigate-with-toast'),
    '@exo/lib/storage': () => import('@exo/lib/storage'),
    '@exo/lib/toast-notification': () => import('@exo/lib/toast-notification'),
    '@exo/lib/url': () => import('@exo/lib/url'),
    '@exo/lib/wait-for': () => import('@exo/lib/wait-for'),
    '@exo/theme/default': () => import('@exo/theme/default'),
};

describe('framework API surface', () => {
    it('exports exactly the pinned names', async () => {
        const surface: Record<string, string[]> = {};
        for (const [name, load] of Object.entries(modules)) {
            surface[name] = Object.keys(await load()).sort();
        }
        expect(surface).toMatchInlineSnapshot(`
          {
            "@exo/lib/actions/base-action": [
              "Action",
            ],
            "@exo/lib/actions/show-toast.action": [
              "ShowToastAction",
              "showToastPayload",
            ],
            "@exo/lib/clipboard": [
              "Clipboard",
            ],
            "@exo/lib/dom": [
              "queryFirst",
              "queryFirstText",
            ],
            "@exo/lib/environments": [
              "ENV_CYCLE_KEY",
              "makeEnvCycleBinding",
              "nextEnvironment",
            ],
            "@exo/lib/example-dom": [
              "createExampleDomLoader",
            ],
            "@exo/lib/keybindings": [
              "KeybindingRegistry",
              "SEQUENCE_TTL_MS",
              "keybindings",
            ],
            "@exo/lib/lifecycle": [
              "claimPage",
              "dispose",
              "isDisposed",
              "onDispose",
            ],
            "@exo/lib/popup-tabs/environment-ui": [
              "EnvButton",
              "EnvButtonRow",
              "makeEnvToast",
              "navigateToEnv",
              "useEnvironments",
              "withEnvRow",
            ],
            "@exo/lib/popup-tabs/tab-registry": [
              "TabRegistry",
              "matchPriority",
            ],
            "@exo/lib/popup-tabs/use-tab-enablement": [
              "isTabEnabled",
              "useTabEnablement",
            ],
            "@exo/lib/richlink": [
              "Handler",
              "HandlerRegistry",
              "cleanUrl",
              "escapeHtml",
              "linkFormat",
              "prefixedTitle",
              "truncateWithEllipsis",
            ],
            "@exo/lib/service-worker/navigate-with-toast": [
              "navigateAndToast",
            ],
            "@exo/lib/service-worker/tabs": [
              "Tabs",
            ],
            "@exo/lib/storage": [
              "Storage",
            ],
            "@exo/lib/toast-notification": [
              "NotificationType",
              "Notifications",
            ],
            "@exo/lib/url": [
              "safeUrl",
            ],
            "@exo/lib/wait-for": [
              "sleep",
              "waitFor",
            ],
            "@exo/theme/default": [
              "theme",
            ],
          }
        `);
    });
});
