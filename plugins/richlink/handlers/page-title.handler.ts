import {Handler} from '@exo/lib/richlink/base';

export class PageTitleHandler extends Handler {
    readonly label = 'Page Title';
    readonly priority = 100;
    override readonly isFallback = true;

    canHandle(_url: URL): boolean {
        return true; // Handles all URLs as fallback
    }

    extractLinkText(): string {
        return document.title || 'Untitled';
    }
}
