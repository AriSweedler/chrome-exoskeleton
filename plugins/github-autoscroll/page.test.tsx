import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
    anchorFor,
    installGitHubBehavior,
    renderFilesList,
    type FixtureFile,
} from '@exo/plugins/github-autoscroll/test-dom';

type ChromeMessageListener = (
    message: {type: string; active?: boolean},
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
) => boolean | void;

const PR_ROOT = 'https://github.com/owner/repo/pull/123';
const PR_CHANGES = `${PR_ROOT}/changes`;

const FILES: FixtureFile[] = [
    {path: 'src/a.ts'},
    {path: 'gen/alpha.json', body: 'generated'},
    {path: 'src/b.ts'},
];

type Loaded = {
    autoscroll: typeof import('@exo/plugins/github-autoscroll/autoscroll');
    cursor: typeof import('@exo/plugins/github-autoscroll/cursor');
    files: typeof import('@exo/plugins/github-autoscroll/files');
    keybindings: (typeof import('@exo/lib/keybindings'))['keybindings'];
};

/** Every module set a test loaded; each one's key listener is detached after the test. */
const loaded: Loaded[] = [];

/**
 * The page module initializes on import, so every test re-imports it fresh
 * against a stubbed location and chrome. `load` returns the sibling modules
 * from the same module registry, so their state is the one page.ts uses.
 */
async function load(href: string): Promise<Loaded> {
    vi.stubGlobal('location', {href, hash: ''});
    await import('@exo/plugins/github-autoscroll/page');
    const autoscroll = await import('@exo/plugins/github-autoscroll/autoscroll');
    const cursor = await import('@exo/plugins/github-autoscroll/cursor');
    const files = await import('@exo/plugins/github-autoscroll/files');
    const {keybindings} = await import('@exo/lib/keybindings');
    const modules = {autoscroll, cursor, files, keybindings};
    loaded.push(modules);
    return modules;
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {key, cancelable: true, bubbles: true, ...init});
    document.body.dispatchEvent(event);
    return event;
}

const toastText = () => document.getElementById('exo-notification-container')?.textContent ?? '';

describe('github-autoscroll page module', () => {
    let messageListeners: ChromeMessageListener[] = [];
    let storage: Record<string, unknown> = {};
    let uninstall: (() => void) | null = null;

    beforeEach(() => {
        messageListeners = [];
        storage = {};
        vi.stubGlobal('chrome', {
            runtime: {
                onMessage: {addListener: vi.fn((listener) => messageListeners.push(listener))},
                sendMessage: vi.fn(),
            },
            storage: {
                local: {
                    get: vi.fn((_key, callback) => callback(storage)),
                    set: vi.fn((_items, callback) => callback?.()),
                },
            },
            tabs: {query: vi.fn(), sendMessage: vi.fn()},
        });
        document.body.innerHTML = '';
        vi.resetModules();
    });

    afterEach(() => {
        for (const modules of loaded.splice(0)) {
            modules.autoscroll.stop();
            modules.keybindings.unlisten();
        }
        uninstall?.();
        uninstall = null;
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
        document.querySelectorAll('#exo-notification-container').forEach((el) => el.remove());
    });

    /** Load on `href` with the fixture files rendered and GitHub emulated. */
    async function loadWithFiles(href: string): Promise<Loaded> {
        document.body.innerHTML = renderFilesList(FILES);
        uninstall = installGitHubBehavior(document);
        return load(href);
    }

    const listener = () => {
        const found = messageListeners.find((candidate) => {
            const probe = vi.fn();
            return (
                candidate(
                    {type: 'GITHUB_AUTOSCROLL_GET_STATUS'},
                    {} as chrome.runtime.MessageSender,
                    probe,
                ) === true
            );
        });
        if (!found) throw new Error('no GitHub autoscroll message listener');
        return found;
    };

    describe('popup messages', () => {
        it('reports the running state', async () => {
            const {autoscroll} = await loadWithFiles(PR_ROOT);
            const respond = vi.fn();
            listener()(
                {type: 'GITHUB_AUTOSCROLL_GET_STATUS'},
                {} as chrome.runtime.MessageSender,
                respond,
            );
            expect(respond).toHaveBeenCalledWith({active: false});
            autoscroll.start();
            listener()(
                {type: 'GITHUB_AUTOSCROLL_GET_STATUS'},
                {} as chrome.runtime.MessageSender,
                respond,
            );
            expect(respond).toHaveBeenLastCalledWith({active: true});
        });

        it('SET names the wanted state and answers with the real one', async () => {
            const {autoscroll} = await loadWithFiles(PR_ROOT);
            const respond = vi.fn();
            listener()(
                {type: 'GITHUB_AUTOSCROLL_SET', active: true},
                {} as chrome.runtime.MessageSender,
                respond,
            );
            expect(respond).toHaveBeenLastCalledWith({active: true});
            expect(autoscroll.isRunning()).toBe(true);
            listener()(
                {type: 'GITHUB_AUTOSCROLL_SET', active: true},
                {} as chrome.runtime.MessageSender,
                respond,
            );
            expect(respond).toHaveBeenLastCalledWith({active: true}); // idempotent
            listener()(
                {type: 'GITHUB_AUTOSCROLL_SET', active: false},
                {} as chrome.runtime.MessageSender,
                respond,
            );
            expect(respond).toHaveBeenLastCalledWith({active: false});
            expect(autoscroll.isRunning()).toBe(false);
        });

        it('SET on a page without files toasts and stays off', async () => {
            await load(PR_ROOT);
            const respond = vi.fn();
            listener()(
                {type: 'GITHUB_AUTOSCROLL_SET', active: true},
                {} as chrome.runtime.MessageSender,
                respond,
            );
            expect(respond).toHaveBeenLastCalledWith({active: false});
            expect(toastText()).toContain('No files found');
        });

        it('ignores other message types', async () => {
            await load('https://example.com');
            expect(
                listener()({type: 'SOMETHING_ELSE'}, {} as chrome.runtime.MessageSender, vi.fn()),
            ).toBe(false);
        });
    });

    describe('keys', () => {
        it('a toggles autoscroll on a PR page, with a toast each way', async () => {
            const {autoscroll} = await loadWithFiles(PR_ROOT);
            expect(press('a').defaultPrevented).toBe(true);
            await vi.waitFor(() => expect(autoscroll.isRunning()).toBe(true));
            expect(toastText()).toContain('GitHub PR Autoscroll enabled');
            press('a');
            await vi.waitFor(() => expect(autoscroll.isRunning()).toBe(false));
            expect(toastText()).toContain('GitHub PR Autoscroll disabled');
        });

        it('a toasts instead of starting when the page has no files', async () => {
            const {autoscroll} = await load(PR_ROOT);
            press('a');
            await vi.waitFor(() => expect(toastText()).toContain('No files found'));
            expect(autoscroll.isRunning()).toBe(false);
        });

        it('leaves a, d and the z chords alone off PR pages, keeping gg / G', async () => {
            await loadWithFiles('https://github.com/owner/repo/issues/1');
            window.scrollTo = vi.fn();
            expect(press('a').defaultPrevented).toBe(false);
            expect(press('d').defaultPrevented).toBe(false);
            expect(press('z').defaultPrevented).toBe(false);
            expect(press('G', {shiftKey: true}).defaultPrevented).toBe(true);
            expect(press('g').defaultPrevented).toBe(true);
            expect(press('g').defaultPrevented).toBe(true);
        });

        it('touches nothing off GitHub', async () => {
            await load('https://example.com/owner/repo/pull/1/changes');
            expect(press('a').defaultPrevented).toBe(false);
            expect(press('G', {shiftKey: true}).defaultPrevented).toBe(false);
        });

        it('zc / zo / za fold the active file', async () => {
            const {autoscroll, cursor, files} = await loadWithFiles(PR_ROOT);
            autoscroll.start();
            const active = () => cursor.getActiveFile()!;
            expect(active().path).toBe('src/a.ts');

            press('z');
            press('c');
            await vi.waitFor(() => expect(files.isCollapsed(active())).toBe(true));
            press('z');
            press('o');
            await vi.waitFor(() => expect(files.isCollapsed(active())).toBe(false));
            press('z');
            press('a');
            await vi.waitFor(() => expect(files.isCollapsed(active())).toBe(true));
        });

        it('a fold key without an active file says so', async () => {
            await loadWithFiles(PR_ROOT);
            press('z');
            press('c');
            await vi.waitFor(() => expect(toastText()).toContain('No active file'));
        });

        it('d marks the auto-hidden files and scrolls; D shows them again', async () => {
            const {files} = await loadWithFiles(PR_ROOT);
            window.scrollBy = vi.fn();
            press('d');
            await vi.waitFor(() =>
                expect(toastText()).toContain('Marked 1 auto-hidden files as viewed'),
            );
            expect(window.scrollBy).toHaveBeenCalled();
            const gen = () => files.fileByAnchor(anchorFor('gen/alpha.json'))!;
            await vi.waitFor(() => expect(files.isViewed(gen())).toBe(true));

            press('D', {shiftKey: true});
            await vi.waitFor(() => expect(toastText()).toContain('Showed 1 auto-hidden files'));
            await vi.waitFor(() => expect(files.isViewed(gen())).toBe(false));
        });

        it('G and gg scroll to the page ends on any GitHub page', async () => {
            await load('https://github.com/owner/repo');
            window.scrollTo = vi.fn();
            press('G', {shiftKey: true});
            await vi.waitFor(() =>
                expect(window.scrollTo).toHaveBeenCalledWith(
                    expect.objectContaining({top: document.documentElement.scrollHeight}),
                ),
            );
            press('g');
            press('g');
            await vi.waitFor(() =>
                expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({top: 0})),
            );
        });
    });

    describe('auto-run', () => {
        it('starts on a Files changed page once GitHub has rendered the files', async () => {
            const {autoscroll} = await loadWithFiles(PR_CHANGES);
            await vi.waitFor(() => expect(autoscroll.isRunning()).toBe(true), {timeout: 2000});
            expect(toastText()).toContain('GitHub PR Autoscroll enabled');
        });

        it('waits for files that render late', async () => {
            const {autoscroll} = await load(PR_CHANGES);
            await new Promise((resolve) => setTimeout(resolve, 300));
            expect(autoscroll.isRunning()).toBe(false);
            document.body.innerHTML = renderFilesList(FILES);
            await vi.waitFor(() => expect(autoscroll.isRunning()).toBe(true), {timeout: 2000});
        });

        it('respects the popup switch (exorun-github-autoscroll = false)', async () => {
            storage = {'exorun-github-autoscroll': false};
            const {autoscroll} = await loadWithFiles(PR_CHANGES);
            await new Promise((resolve) => setTimeout(resolve, 400));
            expect(autoscroll.isRunning()).toBe(false);
        });

        it('does not start on other PR tabs', async () => {
            const {autoscroll} = await loadWithFiles(PR_ROOT);
            await new Promise((resolve) => setTimeout(resolve, 400));
            expect(autoscroll.isRunning()).toBe(false);
        });

        it('stops when the SPA navigates away from Files changed, and restarts on return', async () => {
            const {autoscroll} = await loadWithFiles(PR_CHANGES);
            await vi.waitFor(() => expect(autoscroll.isRunning()).toBe(true), {timeout: 2000});

            window.location.href = PR_ROOT;
            await vi.waitFor(() => expect(autoscroll.isRunning()).toBe(false), {timeout: 2000});

            window.location.href = PR_CHANGES;
            await vi.waitFor(() => expect(autoscroll.isRunning()).toBe(true), {timeout: 2000});
        });
    });
});
