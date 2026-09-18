/**
 * Parse a URL, mapping failure to null — the one home for the
 * try/catch-around-new-URL ceremony.
 */
export function safeUrl(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}
