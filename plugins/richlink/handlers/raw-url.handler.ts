import {escapeHtml, Handler, type FormatContext, type LinkFormat} from '@exo/lib/richlink/base';

export class RawUrlHandler extends Handler {
    readonly label = 'Raw URL';
    readonly priority = 200;
    override readonly isFallback = true;

    canHandle(_url: URL): boolean {
        return true; // Handles all URLs as fallback
    }

    extractLinkText({url}: FormatContext): string {
        return url;
    }

    /** Override: raw URL has no anchor tag wrapping. */
    override getFormats(ctx: FormatContext): LinkFormat[] {
        return [
            {
                label: this.label,
                priority: this.priority,
                isFallback: true,
                title: ctx.url,
                html: escapeHtml(ctx.url),
                text: ctx.url,
            },
        ];
    }
}
