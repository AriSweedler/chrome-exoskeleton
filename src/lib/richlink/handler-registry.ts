import {Handler, type LinkFormat} from '@exo/lib/richlink/base';
import {cleanUrl} from '@exo/lib/richlink/clean-url';
import {safeUrl} from '@exo/lib/url';

export class HandlerRegistry {
    private static baseHandlers: Handler[] = [];
    private static specializedHandlers: Handler[] = [];

    static register(handler: Handler): void {
        if (handler.isFallback) {
            this.baseHandlers.push(handler);
        } else {
            this.specializedHandlers.push(handler);
        }
    }

    static hasSpecializedHandler(url: string): boolean {
        const parsed = safeUrl(url);
        return parsed !== null && this.specializedHandlers.some((h) => h.canHandle(parsed));
    }

    /** Every registered handler, fallbacks last. For tests and CLIs. */
    static getAllForTesting(): readonly Handler[] {
        return [...this.specializedHandlers, ...this.baseHandlers];
    }

    static getAllFormats(url: string): LinkFormat[] {
        const parsed = safeUrl(url);
        if (!parsed) return [];
        const cleaned = cleanUrl(url);
        const specialized = this.specializedHandlers.filter((h) => h.canHandle(parsed));
        const combined = [...specialized, ...this.baseHandlers];
        return combined
            .flatMap((h) => h.getFormats({url: cleaned}))
            .sort((a, b) => a.priority - b.priority);
    }
}
