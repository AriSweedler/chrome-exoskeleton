/** The first element matching any of `selectors`, tried in order. */
export function queryFirst(
    selectors: readonly string[],
    root: Document | Element = document,
): Element | null {
    for (const selector of selectors) {
        const el = root.querySelector(selector);
        if (el) return el;
    }
    return null;
}

/**
 * The first non-empty trimmed text among `selectors`, tried in order.
 * A match whose text is empty or whitespace falls through to the next
 * selector rather than winning with ''.
 */
export function queryFirstText(
    selectors: readonly string[],
    root: Document | Element = document,
): string | null {
    for (const selector of selectors) {
        const text = root.querySelector(selector)?.textContent?.trim();
        if (text) return text;
    }
    return null;
}
