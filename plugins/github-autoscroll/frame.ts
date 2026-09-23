/**
 * Run `callback` on the next animation frame — or on a 16 ms timer where
 * frames don't exist (jsdom). Returns a canceller.
 */
export function nextFrame(callback: () => void): () => void {
    if (typeof window.requestAnimationFrame === 'function') {
        const id = window.requestAnimationFrame(() => callback());
        return () => window.cancelAnimationFrame(id);
    }
    const id = window.setTimeout(callback, 16);
    return () => window.clearTimeout(id);
}
