export class Tabs {
    /**
     * Check if content scripts can be injected into a page with the given URL
     * Returns false for Chrome internal pages (chrome://, chrome-extension://, about:, edge://)
     */
    static canInjectContent(url: string | undefined): boolean {
        if (!url || url.trim() === '') {
            return false;
        }

        // Chrome internal pages where content scripts cannot run
        const restrictedPrefixes = ['chrome://', 'chrome-extension://', 'about:', 'edge://'];

        return !restrictedPrefixes.some((prefix) => url.startsWith(prefix));
    }
}
