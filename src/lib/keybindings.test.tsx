import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {KeybindingRegistry, SEQUENCE_TTL_MS} from '@exo/lib/keybindings';

// The library is notifier-agnostic; tests inject this fake via setNotifier.
const Notifications = {show: vi.fn()};

// Fired handlers are deferred past the next paint (so the toast renders first).
// Flush two animation frames to let a deferred handler run.
const flushFrames = () =>
    new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())),
    );

describe('KeybindingRegistry', () => {
    let registry: KeybindingRegistry;

    beforeEach(() => {
        vi.clearAllMocks();
        registry = new KeybindingRegistry();
        registry.setNotifier(Notifications);
        registry.listen();
    });

    afterEach(() => {
        registry.unlisten();
    });

    function pressKey(key: string, opts: {shiftKey?: boolean} = {}) {
        document.dispatchEvent(
            new KeyboardEvent('keydown', {
                key,
                shiftKey: opts.shiftKey ?? false,
                bubbles: true,
            }),
        );
    }

    function pressCtrl(key: string) {
        document.dispatchEvent(new KeyboardEvent('keydown', {key, ctrlKey: true, bubbles: true}));
    }

    function pressModifier(key: string) {
        document.dispatchEvent(new KeyboardEvent('keydown', {key, shiftKey: true, bubbles: true}));
    }

    it('should fire handler for simple key', async () => {
        const handler = vi.fn();
        registry.register({key: 'x', description: 'test', handler});

        pressKey('x');
        await flushFrames();

        expect(handler).toHaveBeenCalledOnce();
    });

    it('displays keys as registered in the help overlay, not uppercased', () => {
        registry.register({
            key: 'e',
            description: 'Toggle',
            handler: vi.fn(),
            context: 'Deploys',
        });
        registry.showHelp();

        const kbds = Array.from(document.querySelectorAll('kbd')).map((el) => el.textContent);
        expect(kbds).toContain('e');
        expect(kbds).not.toContain('E');
        registry.hideHelp();
    });

    it('displays a shifted letter with both the ⇧ prefix and the capital', () => {
        registry.register({
            key: 'G',
            modifiers: {shift: true},
            description: 'Jump',
            handler: vi.fn(),
            context: 'Deploys',
        });
        registry.showHelp();

        const kbds = Array.from(document.querySelectorAll('kbd')).map((el) => el.textContent);
        expect(kbds).toContain('⇧ + G');
        expect(kbds).not.toContain('G');
        registry.hideHelp();
    });

    it('orders modifiers as ⌘ + ⇧ + letter', () => {
        registry.register({
            key: 'c',
            modifiers: {meta: true, shift: true},
            description: 'Copy',
            handler: vi.fn(),
        });
        registry.showHelp();

        const kbds = Array.from(document.querySelectorAll('kbd')).map((el) => el.textContent);
        expect(kbds).toContain('⌘ + ⇧ + C');
        registry.hideHelp();
    });

    it('should fire handler for ? key (requires shift)', async () => {
        const handler = vi.fn();
        registry.register({key: '?', description: 'test', handler});

        // Pressing ? on a keyboard sends shiftKey: true, key: '?'
        pressKey('?', {shiftKey: true});
        await flushFrames();

        expect(handler).toHaveBeenCalledOnce();
    });

    it('should NOT fire lowercase key handler when shift is held', async () => {
        const handler = vi.fn();
        registry.register({key: 'x', description: 'test', handler});

        // Shift+X sends key: 'X', shiftKey: true
        pressKey('X', {shiftKey: true});
        await flushFrames();

        expect(handler).not.toHaveBeenCalled();
    });

    it('should fire handler for explicit shift+letter binding', async () => {
        const handler = vi.fn();
        registry.register({
            key: 'x',
            description: 'test',
            handler,
            modifiers: {shift: true},
        });

        pressKey('X', {shiftKey: true});
        await flushFrames();

        expect(handler).toHaveBeenCalledOnce();
    });

    it('should not fire when typing in an input field', async () => {
        const handler = vi.fn();
        registry.register({key: 'x', description: 'test', handler});

        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', {key: 'x', bubbles: true}));
        await flushFrames();

        expect(handler).not.toHaveBeenCalled();
        input.remove();
    });

    it('shows an "exo keystroke" toast with the binding description', () => {
        registry.register({key: 'x', description: 'Do the thing', handler: vi.fn()});

        pressKey('x');

        // Toast fires synchronously, before the handler is deferred. The
        // keystroke is a markdown `code` span; the description is on its own line.
        expect(Notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({markdown: 'exo keystroke `x`\nDo the thing'}),
        );
    });

    it('omits the description line when none is given', () => {
        registry.register({key: 'x', description: '', handler: vi.fn()});

        pressKey('x');

        expect(Notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({markdown: 'exo keystroke `x`'}),
        );
    });

    it('does not toast when no binding matches', () => {
        pressKey('z');

        expect(Notifications.show).not.toHaveBeenCalled();
    });

    describe('pass-through prefix (Ctrl+V)', () => {
        it('passes the next keystroke through instead of firing the binding', async () => {
            const handler = vi.fn();
            registry.register({key: 'c', description: 'exo C', handler});

            pressCtrl('v'); // arm
            pressKey('c'); // should reach the page, not exo
            await flushFrames();

            expect(handler).not.toHaveBeenCalled();
        });

        it('does not let a lone modifier consume the arm (e.g. Shift in "?")', async () => {
            const handler = vi.fn();
            registry.register({key: 'c', description: 'exo C', handler});

            pressCtrl('v'); // arm
            pressModifier('Shift'); // lone modifier — must NOT consume the arm
            pressKey('c'); // the real key — still passes through
            await flushFrames();

            // If Shift had consumed the arm, 'c' would have fired the binding.
            expect(handler).not.toHaveBeenCalled();
        });

        it('is one-shot: only the immediately following keystroke passes through', async () => {
            const handler = vi.fn();
            registry.register({key: 'c', description: 'exo C', handler});

            pressCtrl('v');
            pressKey('c'); // passed through
            pressKey('c'); // handled normally
            await flushFrames();

            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('shows a banner toast with the TTL when arming', () => {
            pressCtrl('v');

            expect(Notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    markdown: expect.stringContaining('pass'),
                    duration: 100_000,
                }),
            );
        });

        it('clears the banner toast when the key is consumed', () => {
            const dismiss = vi.fn();
            vi.mocked(Notifications.show).mockReturnValueOnce({dismiss});
            registry.register({key: 'c', description: 'exo C', handler: vi.fn()});

            pressCtrl('v'); // arm -> show returns {dismiss}
            pressKey('c'); // consume

            expect(dismiss).toHaveBeenCalled();
        });

        it('is consumed by a key typed in an input field (it already went to the page)', async () => {
            const handler = vi.fn();
            registry.register({key: 'c', description: 'exo C', handler});

            pressCtrl('v'); // arm
            const input = document.createElement('input');
            document.body.appendChild(input);
            input.dispatchEvent(new KeyboardEvent('keydown', {key: 'a', bubbles: true}));
            input.remove();
            pressKey('c'); // arm was consumed in the input — handled normally
            await flushFrames();

            expect(handler).toHaveBeenCalledOnce();
        });

        it('clears the banner toast when the arm is consumed inside an input field', () => {
            const dismiss = vi.fn();
            vi.mocked(Notifications.show).mockReturnValueOnce({dismiss});

            pressCtrl('v'); // arm -> show returns {dismiss}
            const input = document.createElement('input');
            document.body.appendChild(input);
            input.dispatchEvent(new KeyboardEvent('keydown', {key: 'a', bubbles: true}));
            input.remove();

            expect(dismiss).toHaveBeenCalled();
        });

        it('disarms when the banner toast is dismissed (e.g. TTL expiry)', async () => {
            const handler = vi.fn();
            registry.register({key: 'c', description: 'exo C', handler});

            let onDismiss: (() => void) | undefined;
            vi.mocked(Notifications.show).mockImplementationOnce((opts) => {
                onDismiss = opts.onDismiss;
                return {dismiss: vi.fn()};
            });

            pressCtrl('v'); // arm
            onDismiss?.(); // simulate the 100s TTL firing
            pressKey('c'); // should now be handled normally, not passed through
            await flushFrames();

            expect(handler).toHaveBeenCalledOnce();
        });
    });

    describe('multi-keystroke sequences', () => {
        beforeEach(() => {
            // Keep requestAnimationFrame real so flushFrames() still works;
            // only the sequence TTL runs on fake time.
            vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        function registerSequence(handler = vi.fn(), sequence = ['g', 'g']) {
            registry.register({sequence, description: 'Sequence demo', handler});
            return handler;
        }

        it('fires the handler after the full sequence', async () => {
            const handler = registerSequence();

            pressKey('g');
            expect(handler).not.toHaveBeenCalled();
            pressKey('g');
            await flushFrames();

            expect(handler).toHaveBeenCalledOnce();
        });

        it('swallows the prefix keystroke (preventDefault)', () => {
            registerSequence();

            const event = new KeyboardEvent('keydown', {key: 'g', bubbles: true, cancelable: true});
            document.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(true);
        });

        it('does not swallow a key that is neither a binding nor a prefix', () => {
            registerSequence();

            const event = new KeyboardEvent('keydown', {key: 'z', bubbles: true, cancelable: true});
            document.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(false);
            expect(Notifications.show).not.toHaveBeenCalled();
        });

        it('shows a pending banner naming the prefix, on the sequence TTL', () => {
            registerSequence();

            pressKey('g');

            expect(Notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    markdown: expect.stringContaining('`g`'),
                    duration: SEQUENCE_TTL_MS,
                }),
            );
        });

        it('dismisses the pending banner when the sequence completes', () => {
            const dismiss = vi.fn();
            vi.mocked(Notifications.show).mockReturnValueOnce({dismiss} as never);
            registerSequence();

            pressKey('g');
            pressKey('g');

            expect(dismiss).toHaveBeenCalled();
        });

        it('announces the completed sequence as a single chip', () => {
            registerSequence();

            pressKey('g');
            pressKey('g');

            expect(Notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({markdown: 'exo keystroke `gg`\nSequence demo'}),
            );
        });

        it('resets after the TTL, so a late second key does not fire', async () => {
            const handler = registerSequence();

            pressKey('g');
            vi.advanceTimersByTime(SEQUENCE_TTL_MS + 1);
            pressKey('g'); // starts a fresh pending sequence instead
            await flushFrames();

            expect(handler).not.toHaveBeenCalled();
            // Two pending banners were shown, one per prefix press.
            const pendingCalls = vi
                .mocked(Notifications.show)
                .mock.calls.filter(([opts]) => String(opts.markdown).includes('pending'));
            expect(pendingCalls).toHaveLength(2);
        });

        it('restarts the TTL on every step of a longer sequence', async () => {
            const handler = vi.fn();
            registry.register({sequence: ['g', 'i', 'g'], description: 'three', handler});

            pressKey('g');
            vi.advanceTimersByTime(SEQUENCE_TTL_MS - 100);
            pressKey('i');
            vi.advanceTimersByTime(SEQUENCE_TTL_MS - 100);
            pressKey('g');
            await flushFrames();

            expect(handler).toHaveBeenCalledOnce();
        });

        it('aborts when the pending banner is dismissed (click)', async () => {
            const handler = registerSequence();
            let onDismiss: (() => void) | undefined;
            vi.mocked(Notifications.show).mockImplementationOnce((opts) => {
                onDismiss = opts.onDismiss;
                return {dismiss: vi.fn()} as never;
            });

            pressKey('g');
            onDismiss?.();
            pressKey('g');
            await flushFrames();

            expect(handler).not.toHaveBeenCalled();
        });

        it('processes the aborting key normally when a prefix is abandoned', async () => {
            const sequenceHandler = registerSequence();
            const singleHandler = vi.fn();
            registry.register({key: 'f', description: 'single f', handler: singleHandler});

            pressKey('g');
            pressKey('f');
            await flushFrames();

            expect(sequenceHandler).not.toHaveBeenCalled();
            expect(singleHandler).toHaveBeenCalledOnce();
            expect(Notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({markdown: 'exo keystroke `f`\nsingle f'}),
            );
        });

        it('ignores a lone modifier mid-sequence', async () => {
            const handler = registerSequence();

            pressKey('g');
            pressModifier('Shift');
            pressKey('g');
            await flushFrames();

            expect(handler).toHaveBeenCalledOnce();
        });

        it('matches a shifted step only on a real shifted keydown', async () => {
            const shifted = vi.fn();
            registry.register({sequence: ['g', 'shift+g'], description: 'gG', handler: shifted});
            const plain = registerSequence();

            pressKey('g');
            pressKey('G', {shiftKey: true});
            await flushFrames();

            expect(shifted).toHaveBeenCalledOnce();
            expect(plain).not.toHaveBeenCalled();
        });

        it('leaves single bindings untouched by a registered sequence', async () => {
            registerSequence();
            const handler = vi.fn();
            registry.register({key: 'x', description: 'single', handler});

            pressKey('x');
            await flushFrames();

            expect(handler).toHaveBeenCalledOnce();
            expect(Notifications.show).not.toHaveBeenCalledWith(
                expect.objectContaining({markdown: expect.stringContaining('pending')}),
            );
        });

        it('lets a single binding shadow a sequence with the same first key', async () => {
            const sequenceHandler = registerSequence();
            const singleHandler = vi.fn();
            registry.register({key: 'g', description: 'single g', handler: singleHandler});

            pressKey('g');
            await flushFrames();

            expect(singleHandler).toHaveBeenCalledOnce();
            expect(sequenceHandler).not.toHaveBeenCalled();
        });

        it('cancels a pending sequence when typing goes to an input field', async () => {
            const handler = registerSequence();

            pressKey('g');
            const input = document.createElement('input');
            document.body.appendChild(input);
            input.dispatchEvent(new KeyboardEvent('keydown', {key: 'a', bubbles: true}));
            input.remove();
            pressKey('g');
            await flushFrames();

            expect(handler).not.toHaveBeenCalled();
        });

        it('cancels a pending sequence when pass-through arms', async () => {
            const handler = registerSequence();

            pressKey('g'); // pending
            pressCtrl('v'); // arm pass-through — cancels the sequence
            pressKey('g'); // passed through to the page
            pressKey('g'); // fresh prefix, not a completion
            await flushFrames();

            expect(handler).not.toHaveBeenCalled();
        });

        it('never starts a sequence from a passed-through key', () => {
            registerSequence();

            pressCtrl('v');
            const event = new KeyboardEvent('keydown', {key: 'g', bubbles: true, cancelable: true});
            document.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(false);
            expect(Notifications.show).not.toHaveBeenCalledWith(
                expect.objectContaining({markdown: expect.stringContaining('pending')}),
            );
        });

        it('clears pending state on unlisten', () => {
            const dismiss = vi.fn();
            vi.mocked(Notifications.show).mockReturnValueOnce({dismiss} as never);
            registerSequence();

            pressKey('g');
            registry.unlisten();

            expect(dismiss).toHaveBeenCalled();
            expect(() => vi.advanceTimersByTime(SEQUENCE_TTL_MS + 1)).not.toThrow();
        });

        it('clear() removes sequences and resets pending state', async () => {
            const handler = registerSequence();

            pressKey('g');
            registry.clear();
            pressKey('g');
            pressKey('g');
            await flushFrames();

            expect(handler).not.toHaveBeenCalled();
        });

        it('lists a sequence as its concatenated keys in the help overlay', () => {
            registerSequence();
            registry.showHelp();

            const kbds = Array.from(document.querySelectorAll('kbd')).map((el) => el.textContent);
            expect(kbds).toContain('gg');
            registry.hideHelp();
        });

        it('unregisterSequence removes the sequence and its prefix', () => {
            registerSequence();
            registry.unregisterSequence(['g', 'g']);

            const event = new KeyboardEvent('keydown', {key: 'g', bubbles: true, cancelable: true});
            document.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(false);
        });

        it('rejects Escape as a sequence step and bindings with neither key nor sequence', () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            const handler = vi.fn();

            registry.register({sequence: ['g', 'Escape'], description: 'bad', handler});
            registry.register({description: 'worse', handler});

            expect(error).toHaveBeenCalledTimes(2);
            pressKey('g');
            expect(Notifications.show).not.toHaveBeenCalled();
            error.mockRestore();
        });
    });

    it('should show help overlay on ?', async () => {
        // ? help is auto-registered in constructor
        pressKey('?', {shiftKey: true});
        await flushFrames();

        const overlay = document.querySelector('[style*="position: fixed"]');
        expect(overlay).not.toBeNull();

        // Clean up
        registry.hideHelp();
    });
});

describe('when guards, silent bindings, and interactive help', () => {
    let registry: KeybindingRegistry;
    const notifier = {show: vi.fn()};

    beforeEach(() => {
        vi.clearAllMocks();
        registry = new KeybindingRegistry();
        registry.setNotifier(notifier);
        registry.listen();
    });

    afterEach(() => {
        registry.hideHelp();
        registry.unlisten();
    });

    function press(key: string, init: KeyboardEventInit = {}): boolean {
        const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...init});
        document.dispatchEvent(event);
        return event.defaultPrevented;
    }

    function findHelpRow(description: string): HTMLElement {
        // A row is the innermost div holding the description and a <kbd> chip.
        const row = Array.from(document.querySelectorAll('div')).find(
            (el) =>
                Array.from(el.children).some((child) => child.tagName === 'KBD') &&
                el.textContent?.includes(description),
        );
        expect(row).toBeDefined();
        return row as HTMLElement;
    }

    it('matches meta+shift+letter bindings (Cmd+Shift+C style)', async () => {
        const handler = vi.fn();
        registry.register({
            key: 'c',
            modifiers: {meta: true, shift: true},
            description: 'copy',
            handler,
        });

        press('C', {metaKey: true, shiftKey: true});
        await flushFrames();

        expect(handler).toHaveBeenCalledOnce();
    });

    it('a when-guarded binding lets the key fall through while inactive', async () => {
        const handler = vi.fn();
        registry.register({key: 'j', description: 'guarded', handler, when: () => false});

        const prevented = press('j');
        await flushFrames();

        expect(handler).not.toHaveBeenCalled();
        expect(prevented).toBe(false);
    });

    it('a when-guarded binding fires while its guard holds', async () => {
        const handler = vi.fn();
        registry.register({key: 'j', description: 'guarded', handler, when: () => true});

        const prevented = press('j');
        await flushFrames();

        expect(handler).toHaveBeenCalledOnce();
        expect(prevented).toBe(true);
    });

    it('a silent binding fires without announcing', async () => {
        const handler = vi.fn();
        registry.register({key: 'j', description: 'quiet', handler, silent: true});

        press('j');
        await flushFrames();

        expect(handler).toHaveBeenCalledOnce();
        expect(notifier.show).not.toHaveBeenCalled();
    });

    it('q closes the help overlay, and stays free otherwise', async () => {
        registry.showHelp();
        expect(document.body.textContent).toContain('Keyboard Shortcuts');

        press('q');
        await flushFrames();
        expect(document.body.textContent).not.toContain('Keyboard Shortcuts');

        // Overlay closed: q is not intercepted any more.
        expect(press('q')).toBe(false);
    });

    it('clear() keeps both built-in help bindings', () => {
        registry.register({key: 'z', description: 'custom', handler: vi.fn()});

        registry.clear();

        const keys = registry.getAll().map((kb) => kb.key);
        expect(keys).toContain('?');
        expect(keys).toContain('q');
        expect(keys).not.toContain('z');
    });

    it('clear() restores the real builtins even after a page overrode them', () => {
        registry.register({key: 'q', description: 'usurper', handler: vi.fn()});

        registry.clear();

        const q = registry.getAll().find((kb) => kb.key === 'q');
        expect(q?.description).toBe('Close the help overlay');
    });

    it('the pending window rides the banner: no hidden timer expires it', async () => {
        vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
        const handler = vi.fn();
        registry.register({sequence: ['g', 'g'], description: 'chord', handler});
        // The banner is alive (e.g. hovered, countdown paused) and never
        // auto-dismisses — the sequence window must stay open with it.
        notifier.show.mockReturnValueOnce({dismiss: vi.fn()});

        press('g');
        vi.advanceTimersByTime(10 * SEQUENCE_TTL_MS);
        press('g');
        vi.useRealTimers();
        await flushFrames();

        expect(handler).toHaveBeenCalledOnce();
    });

    it('silent mode still expires the pending window via the fallback timer', async () => {
        vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
        registry.setNotifier(null);
        const handler = vi.fn();
        registry.register({sequence: ['g', 'g'], description: 'chord', handler});

        press('g');
        vi.advanceTimersByTime(SEQUENCE_TTL_MS + 1);
        press('g');
        vi.useRealTimers();
        await flushFrames();

        expect(handler).not.toHaveBeenCalled();
    });

    it('silent mode still disarms pass-through via the fallback timer', () => {
        vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
        registry.setNotifier(null);

        // Arm pass-through (ctrl+v), then let the TTL lapse un-consumed.
        press('v', {ctrlKey: true});
        vi.advanceTimersByTime(100_000 + 1);

        // Disarmed: a bound key is intercepted again instead of passed through.
        const handler = vi.fn();
        registry.register({key: 'j', description: 'bound', handler});
        const prevented = press('j');
        vi.useRealTimers();

        expect(prevented).toBe(true);
    });

    it('an inactive guarded row shows no hover affordance', () => {
        const handler = vi.fn();
        registry.register({key: 'z', description: 'Zap the page', handler, when: () => false});
        registry.showHelp();
        const row = findHelpRow('Zap the page');

        row.dispatchEvent(new Event('mouseenter'));

        expect(row.style.cursor).toBe('default');
        expect(row.style.background).toBe('transparent');
    });

    it('an active row shows the pointer cursor and highlight on hover', () => {
        registry.register({key: 'z', description: 'Zap the page', handler: vi.fn()});
        registry.showHelp();
        const row = findHelpRow('Zap the page');

        row.dispatchEvent(new Event('mouseenter'));

        expect(row.style.cursor).toBe('pointer');
        expect(row.style.background).not.toBe('transparent');
    });

    it('an inactive guarded sequence does not swallow its prefix key', async () => {
        const handler = vi.fn();
        registry.register({
            sequence: ['g', 'g'],
            description: 'guarded sequence',
            handler,
            when: () => false,
        });

        const prevented = press('g');
        press('g');
        await flushFrames();

        expect(prevented).toBe(false);
        expect(handler).not.toHaveBeenCalled();
    });

    it('rejects ctrl+v as a sequence step (reserved for pass-through)', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        registry.register({sequence: ['ctrl+v', 'g'], description: 'bad', handler: vi.fn()});

        expect(error).toHaveBeenCalledOnce();
        error.mockRestore();
    });

    it('clicking a help row whose guard is false does nothing', async () => {
        const handler = vi.fn();
        registry.register({key: 'z', description: 'Zap the page', handler, when: () => false});
        registry.showHelp();

        findHelpRow('Zap the page').dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await flushFrames();

        expect(handler).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('Keyboard Shortcuts');
    });

    it('clicking a help row invokes its binding and closes the overlay', async () => {
        const handler = vi.fn();
        registry.register({key: 'z', description: 'Zap the page', handler});
        registry.showHelp();

        findHelpRow('Zap the page').dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await flushFrames();

        expect(handler).toHaveBeenCalledOnce();
        expect(document.body.textContent).not.toContain('Keyboard Shortcuts');
    });

    it('hovering a help row highlights it', () => {
        registry.register({key: 'z', description: 'Zap the page', handler: vi.fn()});
        registry.showHelp();
        const row = findHelpRow('Zap the page');

        row.dispatchEvent(new Event('mouseenter'));
        expect(row.style.background).not.toBe('transparent');
        expect(row.style.background).not.toBe('');

        row.dispatchEvent(new Event('mouseleave'));
        expect(row.style.background).toBe('transparent');
    });
});
