/**
 * Format cycling: repeated Cmd+Shift+C presses walk through the available
 * formats while the copy toast is on screen.
 *
 * The toast IS the cycling window — its dismissal (countdown end, click,
 * replace, Backspace) clears the cycle state via clearCycleState, so what
 * the user sees (a live toast, pausable by hovering it) and when cycling
 * ends are one mechanism. There is no wall-clock timer.
 */

/** The copy toast's duration — and therefore the cycling window. */
export const CYCLE_WINDOW_MS = 3000;

// The format index the live toast is showing; null when no toast is up.
let cycleFormatIndex: number | null = null;

/** Get the next format index for cycling */
export function getNextFormatIndex(totalFormats: number): number {
    if (cycleFormatIndex === null) return 0;
    return (cycleFormatIndex + 1) % totalFormats;
}

/** Record the format index the just-shown toast is displaying */
export function cacheFormatIndex(formatIndex: number): void {
    cycleFormatIndex = formatIndex;
}

/** Are we currently cycling (a copy toast is still alive)? */
export function isCycling(): boolean {
    return cycleFormatIndex !== null;
}

/** End the cycling window — wired to the copy toast's onDismiss. */
export function clearCycleState(): void {
    cycleFormatIndex = null;
}
