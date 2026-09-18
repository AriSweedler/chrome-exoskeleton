import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('@exo/lib/keybindings', () => ({
    keybindings: {
        register: vi.fn(),
        registerAll: vi.fn(),
        listen: vi.fn(),
    },
}));
vi.mock('@exo/plugins/playground/actions', () => ({
    typeXxxAndScrollToBottom: vi.fn(),
    announceSequenceDemo: vi.fn(),
}));

const GDOC_URL = 'https://docs.google.com/document/d/1abc/edit';

function stubStorage(values: Record<string, unknown>) {
    vi.stubGlobal('chrome', {
        storage: {
            local: {
                get: vi.fn((_key: string, callback: (result: Record<string, unknown>) => void) => {
                    callback(values);
                }),
            },
        },
    });
}

async function importPageModule() {
    await import('@exo/plugins/playground/page');
    // Let the async enablement check settle
    await new Promise((resolve) => setTimeout(resolve, 0));
    const {keybindings} = await import('@exo/lib/keybindings');
    return keybindings;
}

describe('playground page module', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('registers the x keybinding on Google Docs when enabled by default', async () => {
        vi.stubGlobal('location', {href: GDOC_URL});
        stubStorage({});

        const keybindings = await importPageModule();

        expect(keybindings.register).toHaveBeenCalledWith(
            expect.objectContaining({key: 'x', context: 'Playground'}),
        );
        expect(keybindings.register).toHaveBeenCalledWith(
            expect.objectContaining({sequence: ['g', 'g'], context: 'Playground'}),
        );
        expect(keybindings.listen).toHaveBeenCalled();
    });

    it('registers nothing when exorun-playground is false', async () => {
        vi.stubGlobal('location', {href: GDOC_URL});
        stubStorage({'exorun-playground': false});

        const keybindings = await importPageModule();

        expect(keybindings.register).not.toHaveBeenCalled();
        expect(keybindings.listen).not.toHaveBeenCalled();
    });

    it('registers nothing on non-Google-Docs pages', async () => {
        vi.stubGlobal('location', {href: 'https://example.com/page'});
        stubStorage({});

        const keybindings = await importPageModule();

        expect(keybindings.register).not.toHaveBeenCalled();
        expect(keybindings.listen).not.toHaveBeenCalled();
    });
});
