/**
 * Keybinding Registry Library
 *
 * Provides a data-driven keybinding system with auto-generated help overlay.
 * Features:
 * - Register keybindings as objects with key, description, and handler
 * - Automatic event listener setup
 * - Automatic "exo keystroke" notification on every fired binding
 * - Auto-generated help overlay with '?' key
 * - Context-aware filtering (skips INPUT/TEXTAREA elements)
 *
 * This library is standalone: it has no imports. Feedback banners go through
 * a pluggable notifier (see setNotifier) and default to silent.
 */

/** Handle to an on-screen notification, so the registry can retract it. */
export interface NotifierHandle {
    dismiss: () => void;
}

/**
 * Where the registry's feedback banners go (fired keystrokes, pending
 * sequences, pass-through). `markdown` is a small subset — `code`, **bold**,
 * plain text, newlines — that the host may render or strip as it likes.
 */
export interface KeybindingNotifier {
    show(opts: {
        markdown: string;
        duration?: number;
        onDismiss?: () => void;
    }): NotifierHandle | null;
}

// Inline-code markdown span, e.g. `gg`.
const code = (text: string): string => `\`${text}\``;

// The help overlay's own palettes — the library styles itself and follows
// the system theme (prefers-color-scheme). The overlay's z-index is 999999;
// notifiers that should stay visible above it (the exo toast container does)
// must sit higher.
const HELP_PALETTES = {
    light: {
        backdrop: 'hsla(0, 0%, 0%, 0.85)',
        panelShadow: '0 4px 24px hsla(0, 0%, 0%, 0.3)',
        panelBg: 'hsla(0, 0%, 100%, 1)',
        title: 'hsla(0, 0%, 10%, 1)',
        contextHeader: 'hsla(0, 0%, 40%, 1)',
        rowSeparator: 'hsla(0, 0%, 94%, 1)',
        rowHover: 'hsla(0, 0%, 0%, 0.07)',
        text: 'hsla(0, 0%, 20%, 1)',
        kbdBg: 'hsla(0, 0%, 93%, 1)',
        kbdBorder: 'hsla(0, 0%, 82%, 1)',
        hint: 'hsla(0, 0%, 60%, 1)',
    },
    dark: {
        backdrop: 'hsla(0, 0%, 0%, 0.85)',
        panelShadow: '0 4px 24px hsla(0, 0%, 0%, 0.6)',
        panelBg: 'hsla(0, 0%, 13%, 1)',
        title: 'hsla(0, 0%, 95%, 1)',
        contextHeader: 'hsla(0, 0%, 65%, 1)',
        rowSeparator: 'hsla(0, 0%, 24%, 1)',
        rowHover: 'hsla(0, 0%, 100%, 0.08)',
        text: 'hsla(0, 0%, 88%, 1)',
        kbdBg: 'hsla(0, 0%, 24%, 1)',
        kbdBorder: 'hsla(0, 0%, 36%, 1)',
        hint: 'hsla(0, 0%, 55%, 1)',
    },
} as const;

// Overlay layout: widen into more columns before ever scrolling.
const HELP_COLUMN_WIDTH = 340;
const HELP_COLUMN_GAP = 40;
const HELP_PANEL_PADDING = 24; // each side
// One constant feeds both the panel's CSS max-width and the JS column
// budget, so the two width caps cannot drift.
const HELP_PANEL_VIEWPORT_FRACTION = 0.9;

const INPUT_TAG_NAMES = ['INPUT', 'TEXTAREA'] as const;

function isTypingInInputField(target: HTMLElement): boolean {
    return INPUT_TAG_NAMES.some((tag) => target.tagName === tag) || target.isContentEditable;
}

/**
 * Run a callback after the next paint. Lets the keystroke toast render before a
 * handler that navigates away tears down the page. Falls back to setTimeout
 * where requestAnimationFrame is unavailable.
 */
function afterNextPaint(fn: () => void): void {
    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => window.requestAnimationFrame(fn));
    } else {
        setTimeout(fn, 0);
    }
}

export interface Keybinding {
    // Exactly one of key/sequence. A sequence step is written like a
    // signature: a plain key ('g') or modifier-prefixed ('shift+g'). Escape
    // is reserved (it closes the help overlay) and cannot be a step.
    key?: string;
    sequence?: string[];
    description: string;
    handler: () => void;
    modifiers?: {
        ctrl?: boolean;
        shift?: boolean;
        alt?: boolean;
        meta?: boolean;
    };
    context?: string; // Optional grouping context (e.g., "GitHub", "Docs")
    // Only intercept the keystroke while this returns true; otherwise it
    // falls through to the page untouched. For bindings that dismiss things:
    // the key stays free until there is something to dismiss.
    when?: () => boolean;
    // Skip the "exo keystroke" notification when fired. For handlers that
    // dismiss notifications — announcing one would defeat the point.
    silent?: boolean;
}

// How long a pending sequence waits for its next keystroke.
export const SEQUENCE_TTL_MS = 1_200;

// Joins the per-keystroke signatures of a sequence. A single-key signature
// never contains a space (the Space key itself is not bindable this way).
const SEQUENCE_SEPARATOR = ' ';

// Parse a sequence step ('g', 'shift+g', 'ctrl+x') into binding parts.
function parseStep(step: string): {key: string; modifiers: Keybinding['modifiers']} {
    const tokens = step.split('+');
    const key = tokens.pop() || '+';
    const modifiers: Keybinding['modifiers'] = {};
    for (const token of tokens) {
        const name = token.toLowerCase();
        if (name === 'ctrl') modifiers.ctrl = true;
        if (name === 'shift') modifiers.shift = true;
        if (name === 'alt') modifiers.alt = true;
        if (name === 'meta') modifiers.meta = true;
    }
    return {key, modifiers};
}

// The "quote next keystroke" prefix: after it, the next key is passed straight
// to the page instead of being handled by exo. Outside input fields (where we
// don't listen anyway), Ctrl+V has no native effect, so it's free to reuse.
const PASS_THROUGH_PREFIX = 'ctrl+v';

// How long the armed pass-through waits for its key before auto-disarming.
const PASS_THROUGH_TTL_MS = 100_000;

// Lone modifier keydowns (e.g. the Shift in '?' = Shift+Slash). They must not
// consume the one-shot pass-through — we wait for the actual key.
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph']);

// Derive the {key, modifiers} a keydown maps to — shared by lookup and display.
// For non-letter keys (like ? ! @ #) shift is implicit in the character itself,
// so only treat shift as an explicit modifier for letters (a-z).
function eventBindingParts(event: KeyboardEvent): Pick<Keybinding, 'key' | 'modifiers'> {
    const isLetter = /^[a-zA-Z]$/.test(event.key);
    return {
        key: event.key,
        modifiers: {
            ctrl: event.ctrlKey,
            shift: isLetter && event.shiftKey,
            alt: event.altKey,
            meta: event.metaKey,
        },
    };
}

export class KeybindingRegistry {
    private keybindings: Map<string, Keybinding> = new Map();
    private helpOverlay: HTMLElement | null = null;
    private keydownHandler: ((event: KeyboardEvent) => void) | null = null;
    private notifier: KeybindingNotifier | null = null;
    // Armed by PASS_THROUGH_PREFIX, consumed by next key. The arm IS its
    // banner/timer handle: armed ⇔ non-null, and dismissing it disarms.
    private passThroughArm: NotifierHandle | null = null;
    private helpCloseHandler: ((event?: Event) => void) | null = null;
    private helpResizeHandler: (() => void) | null = null;
    // Every proper prefix of a registered sequence, as a joined signature.
    private sequencePrefixes: Set<string> = new Set();
    private pendingSteps: string[] = []; // signatures typed toward a sequence
    private pendingToast: NotifierHandle | null = null;

    // The registry's own bindings, kept by object (not by current map value)
    // so clear() restores them even after a page module overrode a signature.
    private builtins: Array<[string, Keybinding]> = [];

    constructor() {
        // Auto-register the help keybindings
        this.register({
            key: '?',
            description: 'Show this help overlay',
            handler: () => this.showHelp(),
            context: 'Global',
        });
        this.register({
            key: 'q',
            description: 'Close the help overlay',
            handler: () => this.hideHelp(),
            context: 'Global',
            when: () => this.helpOverlay !== null,
            silent: true,
        });
        this.builtins = Array.from(this.keybindings.entries());
    }

    /**
     * Register a keybinding
     */
    register(keybinding: Keybinding): void {
        if (!keybinding.sequence?.length && !keybinding.key) {
            console.error('[exo keybindings] a binding needs a key or a sequence', keybinding);
            return;
        }
        if (keybinding.sequence?.some((step) => parseStep(step).key.toLowerCase() === 'escape')) {
            console.error('[exo keybindings] Escape cannot be a sequence step', keybinding);
            return;
        }
        if (
            keybinding.sequence?.some(
                (step) => this.getKeySignature(parseStep(step)) === PASS_THROUGH_PREFIX,
            )
        ) {
            console.error(
                '[exo keybindings] ctrl+v is reserved for pass-through and cannot be a sequence step',
                keybinding,
            );
            return;
        }
        this.keybindings.set(this.bindingSignature(keybinding), keybinding);
        this.reindexSequences();
    }

    /**
     * Register multiple keybindings at once
     */
    registerAll(keybindings: Keybinding[]): void {
        keybindings.forEach((kb) => this.register(kb));
    }

    /**
     * Unregister a keybinding
     */
    unregister(key: string, modifiers?: Keybinding['modifiers']): void {
        const signature = this.getKeySignature({key, modifiers} as Keybinding);
        this.keybindings.delete(signature);
        this.reindexSequences();
    }

    unregisterSequence(sequence: string[]): void {
        this.keybindings.delete(this.bindingSignature({sequence} as Keybinding));
        this.reindexSequences();
    }

    /**
     * Start listening for keybindings
     */
    listen(): void {
        if (this.keydownHandler) {
            return; // Already listening
        }

        this.keydownHandler = (event: KeyboardEvent) => {
            const parts = eventBindingParts(event);
            const signature = this.getKeySignature(parts);

            // A prior prefix armed this keystroke: let it reach the page
            // untouched (no preventDefault/stop), consuming the one-shot arm.
            // Checked before the input-field skip — a key typed into an input
            // has already gone to the page, so it consumes the arm too.
            if (this.passThroughArm) {
                // A lone modifier (e.g. the Shift in '?') passes through but
                // must not consume the arm — wait for the actual key.
                if (MODIFIER_KEYS.has(event.key)) {
                    return;
                }
                const passed = this.formatKeybinding(parts);
                this.disarmPassThrough();
                this.notify(`passed ${code(passed)} to the page`);
                return;
            }

            // Skip if user is typing in an input field. The key went to the
            // field, so it also breaks any pending sequence.
            if (isTypingInInputField(event.target as HTMLElement)) {
                this.resetPendingSequence();
                return;
            }

            // The prefix itself: arm the next keystroke to pass through, and show
            // a banner toast that stays until consumed or the TTL expires (which
            // also disarms, via onDismiss). Pass-through and a pending sequence
            // are mutually exclusive modes.
            if (signature === PASS_THROUGH_PREFIX) {
                this.resetPendingSequence();
                event.preventDefault();
                event.stopImmediatePropagation();
                // The banner IS the arm and its countdown IS the disarm
                // clock — pausing the banner genuinely holds the arm open.
                this.passThroughArm = this.showTtlBanner(
                    '**pass-through** — next key goes to the page',
                    PASS_THROUGH_TTL_MS,
                    () => this.disarmPassThrough(),
                );
                return;
            }

            // Continue a pending sequence: fire on an exact match, extend on a
            // prefix, otherwise abandon it and treat this keystroke as fresh.
            if (this.pendingSteps.length > 0) {
                if (MODIFIER_KEYS.has(event.key)) {
                    return;
                }
                const candidate = [...this.pendingSteps, signature];
                const candidateSignature = candidate.join(SEQUENCE_SEPARATOR);
                const sequenceBinding = this.keybindings.get(candidateSignature);
                if (sequenceBinding && this.isActive(sequenceBinding)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    this.resetPendingSequence();
                    this.fire(sequenceBinding);
                    return;
                }
                if (this.hasActivePrefix(candidateSignature)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    this.setPendingSequence(candidate);
                    return;
                }
                this.resetPendingSequence();
            }

            const keybinding = this.keybindings.get(signature);
            if (keybinding && this.isActive(keybinding)) {
                // Capture phase + stopImmediatePropagation so our shortcut wins
                // over the host page's own handlers (e.g. GitHub's 'c' hotkey).
                event.preventDefault();
                event.stopImmediatePropagation();
                this.fire(keybinding);
                return;
            }

            // Start a sequence. Checked after the single-binding lookup, so a
            // single binding always wins over a same-key sequence prefix.
            if (this.hasActivePrefix(signature)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                this.setPendingSequence([signature]);
            }
        };

        // Capture phase: intercept before the page's bubble-phase listeners.
        document.addEventListener('keydown', this.keydownHandler, true);
    }

    /**
     * Stop listening for keybindings
     */
    unlisten(): void {
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler, true);
            this.keydownHandler = null;
        }
        this.disarmPassThrough();
        this.resetPendingSequence();
    }

    /**
     * Generate a unique signature for a keybinding
     */
    private getKeySignature(keybinding: Pick<Keybinding, 'key' | 'modifiers'>): string {
        const modifiers = keybinding.modifiers || {};
        const parts: string[] = [];

        if (modifiers.ctrl) parts.push('ctrl');
        if (modifiers.shift) parts.push('shift');
        if (modifiers.alt) parts.push('alt');
        if (modifiers.meta) parts.push('meta');
        parts.push((keybinding.key ?? '').toLowerCase());

        return parts.join('+');
    }

    private bindingSignature(keybinding: Keybinding): string {
        if (keybinding.sequence?.length) {
            return keybinding.sequence
                .map((step) => this.getKeySignature(parseStep(step)))
                .join(SEQUENCE_SEPARATOR);
        }
        return this.getKeySignature(keybinding);
    }

    // A single binding is matched before a sequence can start, so a sequence
    // whose first step collides with a single binding is unreachable.
    private reindexSequences(): void {
        this.sequencePrefixes.clear();
        for (const [signature, keybinding] of this.keybindings) {
            if (!keybinding.sequence?.length) continue;
            const steps = signature.split(SEQUENCE_SEPARATOR);
            for (let i = 1; i < steps.length; i++) {
                this.sequencePrefixes.add(steps.slice(0, i).join(SEQUENCE_SEPARATOR));
            }
        }
        for (const prefix of this.sequencePrefixes) {
            if (!prefix.includes(SEQUENCE_SEPARATOR) && this.keybindings.has(prefix)) {
                console.warn(
                    `[exo keybindings] single binding '${prefix}' shadows a sequence starting with it`,
                );
            }
        }
    }

    private setPendingSequence(steps: string[]): void {
        this.resetPendingSequence();
        this.pendingSteps = steps;
        // The banner IS the TTL: hovering it genuinely holds the window
        // open, and its dismissal — countdown, click, or reset — expires
        // the pending sequence.
        this.pendingToast = this.showTtlBanner(
            `**pending** ${code(this.formatSequenceSignatures(steps))} — waiting for the next key`,
            SEQUENCE_TTL_MS,
            () => this.resetPendingSequence(),
        );
    }

    /** Abort any pending sequence and its banner (idempotent). */
    private resetPendingSequence(): void {
        this.pendingSteps = [];
        const toast = this.pendingToast;
        this.pendingToast = null;
        toast?.dismiss();
    }

    /**
     * Route feedback banners (fired keystrokes, pending sequences,
     * pass-through) to `notifier`. Pass null to silence them (the default).
     */
    setNotifier(notifier: KeybindingNotifier | null): void {
        this.notifier = notifier;
    }

    /** A `when`-guarded binding only intercepts while its guard holds. */
    private isActive(keybinding: Keybinding): boolean {
        return !keybinding.when || keybinding.when();
    }

    /**
     * Is `prefix` a live sequence prefix right now? A prefix whose every
     * sequence is `when`-guarded inactive must not swallow keystrokes.
     */
    private hasActivePrefix(prefix: string): boolean {
        if (!this.sequencePrefixes.has(prefix)) return false;
        const prefixWithSeparator = prefix + SEQUENCE_SEPARATOR;
        for (const [signature, keybinding] of this.keybindings) {
            if (!keybinding.sequence?.length) continue;
            if (signature.startsWith(prefixWithSeparator) && this.isActive(keybinding)) {
                return true;
            }
        }
        return false;
    }

    /** Announce (unless silent) and run a binding, deferring past the next paint. */
    private fire(keybinding: Keybinding): void {
        if (!keybinding.silent) {
            this.announce(keybinding);
        }
        // Defer the handler past the next paint so the notification is
        // visible even when the handler navigates to another page.
        afterNextPaint(keybinding.handler);
    }

    /**
     * Show a notification. Best-effort: a missing notifier or a rendering
     * failure must never block the keystroke that triggered it.
     */
    private notify(
        markdown: string,
        opts: {duration?: number; onDismiss?: () => void} = {},
    ): NotifierHandle | null {
        try {
            return this.notifier?.show({markdown, ...opts}) ?? null;
        } catch (err) {
            console.error('[exo keybindings] failed to show notification', err);
            return null;
        }
    }

    /**
     * Start a TTL carried by the notifier banner itself: the visible
     * countdown IS the clock (pausing the banner pauses the expiry), and
     * dismissal — countdown end, click, or the returned handle — runs
     * `onExpire` exactly once. When no banner can carry it (no notifier, or
     * show threw), a bare timer keeps the expiry so state never sticks.
     */
    private showTtlBanner(markdown: string, ttlMs: number, onExpire: () => void): NotifierHandle {
        const banner = this.notify(markdown, {duration: ttlMs, onDismiss: onExpire});
        if (banner) return banner;
        const timer = window.setTimeout(onExpire, ttlMs);
        return {
            dismiss: () => {
                window.clearTimeout(timer);
                onExpire();
            },
        };
    }

    /** Disarm pass-through, retiring its banner/timer (idempotent). */
    private disarmPassThrough(): void {
        const arm = this.passThroughArm;
        this.passThroughArm = null;
        arm?.dismiss();
    }

    /**
     * Show the "exo keystroke" toast for a fired binding. The keystroke is
     * rendered as an inline code chip so it reads as an interpolated value, not
     * part of the static template; the description follows when provided.
     */
    private announce(keybinding: Keybinding): void {
        const lines = [`exo keystroke ${code(this.formatKeybinding(keybinding))}`];
        if (keybinding.description) {
            lines.push(keybinding.description);
        }

        this.notify(lines.join('\n'));
    }

    /**
     * Format a keybinding for display
     */
    private formatKeybinding(
        keybinding: Pick<Keybinding, 'key' | 'modifiers' | 'sequence'>,
    ): string {
        if (keybinding.sequence?.length) {
            return this.formatSequenceSignatures(
                keybinding.sequence.map((step) => this.getKeySignature(parseStep(step))),
            );
        }

        const key = keybinding.key ?? '';
        const modifiers = keybinding.modifiers || {};
        // A shifted letter paints both the modifier and the capital —
        // '⇧ + G', '⌘ + ⇧ + C'. Redundant, deliberately so.
        const isShiftedLetter = Boolean(modifiers.shift) && /^[a-zA-Z]$/.test(key);
        const parts: string[] = [];

        if (modifiers.ctrl) parts.push('Ctrl');
        if (modifiers.alt) parts.push('Alt');
        if (modifiers.meta) parts.push('⌘');
        if (modifiers.shift) parts.push('⇧');
        parts.push(isShiftedLetter ? key.toUpperCase() : key);

        return parts.join(' + ');
    }

    // 'g g' renders as 'gg'; steps that need more than one character keep a
    // space between them ('Ctrl + V g').
    private formatSequenceSignatures(stepSignatures: string[]): string {
        const parts = stepSignatures.map((signature) =>
            this.formatKeybinding(parseStep(signature)),
        );
        return parts.every((part) => part.length === 1) ? parts.join('') : parts.join(' ');
    }

    /**
     * Show the help overlay
     */
    showHelp(): void {
        if (this.helpOverlay) {
            return; // Already showing
        }

        const colors =
            HELP_PALETTES[
                window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
            ];

        // Group keybindings by context
        const grouped = new Map<string, Keybinding[]>();
        this.keybindings.forEach((kb) => {
            const context = kb.context || 'Other';
            if (!grouped.has(context)) {
                grouped.set(context, []);
            }
            grouped.get(context)!.push(kb);
        });

        // Create overlay
        this.helpOverlay = document.createElement('div');
        this.helpOverlay.id = 'exo-help-overlay';
        this.helpOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: ${colors.backdrop};
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

        // Create the panel
        const panel = document.createElement('div');
        panel.id = 'exo-help-panel';
        panel.style.cssText = `
      background: ${colors.panelBg};
      border-radius: 8px;
      padding: ${HELP_PANEL_PADDING}px;
      max-width: ${HELP_PANEL_VIEWPORT_FRACTION * 100}vw;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: ${colors.panelShadow};
    `;

        // Add title
        const title = document.createElement('h2');
        title.textContent = 'Keyboard Shortcuts';
        title.style.cssText = `
      margin: 0 0 20px 0;
      font-size: 24px;
      font-weight: 600;
      color: ${colors.title};
    `;
        panel.appendChild(title);

        // Context groups flow into CSS columns; each group stays whole.
        const groups = document.createElement('div');
        groups.id = 'exo-help-groups';
        groups.style.cssText = `
      column-gap: ${HELP_COLUMN_GAP}px;
      max-width: 100%;
    `;
        panel.appendChild(groups);

        const rowBindings = new Map<HTMLElement, Keybinding>();

        // Add keybindings grouped by context
        grouped.forEach((keybindings, context) => {
            // The group may fragment across columns (a page with one big
            // group must still be able to spread); rows never split, and the
            // header sticks with its first row.
            const group = document.createElement('div');

            // Add context header
            const contextHeader = document.createElement('h3');
            contextHeader.textContent = context;
            contextHeader.style.cssText = `
        margin: 16px 0 8px 0;
        font-size: 14px;
        font-weight: 600;
        color: ${colors.contextHeader};
        text-transform: uppercase;
        letter-spacing: 0.5px;
        break-inside: avoid;
        break-after: avoid;
      `;
            group.appendChild(contextHeader);

            // Add keybindings for this context
            keybindings.forEach((kb) => {
                const row = document.createElement('div');
                row.className = 'exo-help-row';
                row.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          margin: 0 -8px;
          border-radius: 4px;
          border-bottom: 1px solid ${colors.rowSeparator};
          user-select: none;
          break-inside: avoid;
          transition: background 0.1s ease;
        `;
                rowBindings.set(row, kb);

                // The same predicate the click handler uses decides the
                // affordance at hover time (guards are dynamic): what
                // highlights is exactly what clicks. Activation itself is
                // delegated to the overlay's click handler so clicks on the
                // row's children count too.
                row.addEventListener('mouseenter', () => {
                    const active = this.isActive(kb);
                    row.style.cursor = active ? 'pointer' : 'default';
                    row.style.background = active ? colors.rowHover : 'transparent';
                });
                row.addEventListener('mouseleave', () => {
                    row.style.background = 'transparent';
                });

                const desc = document.createElement('span');
                desc.textContent = kb.description;
                desc.style.cssText = `
          flex: 1;
          color: ${colors.text};
          font-size: 14px;
        `;

                const keyDisplay = document.createElement('kbd');
                keyDisplay.textContent = this.formatKeybinding(kb);
                keyDisplay.style.cssText = `
          background: ${colors.kbdBg};
          border: 1px solid ${colors.kbdBorder};
          border-radius: 4px;
          padding: 4px 8px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 12px;
          color: ${colors.text};
          white-space: nowrap;
          margin-left: 16px;
        `;

                row.appendChild(desc);
                row.appendChild(keyDisplay);
                group.appendChild(row);
            });

            groups.appendChild(group);
        });

        // Add close instruction
        const closeHint = document.createElement('p');
        closeHint.textContent =
            'Click a shortcut to run it · press ESC or q, or click outside, to close';
        closeHint.style.cssText = `
      margin: 20px 0 0 0;
      text-align: center;
      color: ${colors.hint};
      font-size: 12px;
    `;
        panel.appendChild(closeHint);

        this.helpOverlay.appendChild(panel);
        document.body.appendChild(this.helpOverlay);
        // Fit now and on every resize — the JS column budget follows the
        // same live viewport the panel's CSS max-width already tracks.
        this.fitHelpColumns(panel, groups);
        this.helpResizeHandler = () => this.fitHelpColumns(panel, groups);
        window.addEventListener('resize', this.helpResizeHandler);

        // One delegated click handler for the whole overlay:
        // - a click anywhere inside a row (its text and kbd chip included, and
        //   clicks whose mousedown/mouseup drift retargets within the row)
        //   invokes that binding;
        // - a click on the backdrop closes;
        // - a click elsewhere in the panel is inert — it must never dismiss
        //   the overlay out from under a slightly-missed row click.
        this.helpOverlay.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const row = target?.closest('.exo-help-row');
            if (row instanceof HTMLElement) {
                const kb = rowBindings.get(row);
                // Guard first: hideHelp mutates state guards may read
                // (the built-in 'q' checks the overlay is open). A guard
                // that flipped since hover repaints the row inert.
                if (!kb || !this.isActive(kb)) {
                    row.style.cursor = 'default';
                    row.style.background = 'transparent';
                    return;
                }
                this.hideHelp();
                this.fire(kb);
                return;
            }
            if (!target || !panel.contains(target)) {
                this.hideHelp();
            }
        });

        // Close on ESC
        const closeHandler = (event?: Event) => {
            if (event instanceof KeyboardEvent && event.key !== 'Escape') {
                return;
            }
            this.hideHelp();
        };
        document.addEventListener('keydown', closeHandler);

        // Store cleanup handler
        this.helpCloseHandler = closeHandler;
    }

    /**
     * Widen the panel into more columns until nothing scrolls (or the
     * viewport can't fit another column — then one column may scroll).
     * jsdom reports zero layout, so unit tests stay single-column.
     */
    private fitHelpColumns(panel: HTMLElement, groups: HTMLElement): void {
        const usableWidth =
            window.innerWidth * HELP_PANEL_VIEWPORT_FRACTION - HELP_PANEL_PADDING * 2;
        const maxColumns = Math.max(
            1,
            Math.floor((usableWidth + HELP_COLUMN_GAP) / (HELP_COLUMN_WIDTH + HELP_COLUMN_GAP)),
        );

        let columns = 1;
        const apply = () => {
            groups.style.columnCount = String(columns);
            groups.style.width =
                columns === 1
                    ? 'auto'
                    : `${columns * HELP_COLUMN_WIDTH + (columns - 1) * HELP_COLUMN_GAP}px`;
        };
        apply();
        while (columns < maxColumns && panel.scrollHeight > panel.clientHeight) {
            columns += 1;
            apply();
        }
    }

    /**
     * Hide the help overlay
     */
    hideHelp(): void {
        this.resetPendingSequence();
        if (!this.helpOverlay) {
            return;
        }

        if (this.helpCloseHandler) {
            document.removeEventListener('keydown', this.helpCloseHandler);
            this.helpCloseHandler = null;
        }
        if (this.helpResizeHandler) {
            window.removeEventListener('resize', this.helpResizeHandler);
            this.helpResizeHandler = null;
        }

        this.helpOverlay.remove();
        this.helpOverlay = null;
    }

    /**
     * Get all registered keybindings
     */
    getAll(): Keybinding[] {
        return Array.from(this.keybindings.values());
    }

    /**
     * Clear all keybindings (except the registry's own help bindings)
     */
    clear(): void {
        this.keybindings.clear();
        this.builtins.forEach(([signature, binding]) => this.keybindings.set(signature, binding));
        this.reindexSequences();
        this.resetPendingSequence();
        this.disarmPassThrough();
    }
}

// Export a singleton instance
export const keybindings = new KeybindingRegistry();
