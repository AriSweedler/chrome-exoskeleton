export interface LinkFormat {
    label: string; // Button text in the popup format picker: "GitHub PR", "Page Title", "Raw URL"
    priority: number; // Lower numbers appear first in the format picker
    isFallback?: boolean; // True for fallback formats (e.g. Page Title, Raw URL); used by UI for styling
    title: string; // The human-readable link text: "Fix auth flow (#42)" — shown in the copy toast
    html: string; // HTML to copy: "<a href='...'>text</a>"
    text: string; // Plain text: "text (url)"
}

/**
 * Context passed to getFormats().
 *
 * Handlers run in two contexts: the page (content script) and the popup.
 * In the popup, `window.location.href` is the popup's chrome-extension://
 * URL — not the tab URL the user is looking at. This context object carries
 * the real tab URL so handlers never need to read window.location.
 */
export interface FormatContext {
    url: string;
}

/**
 * Base class for rich link handlers. Each handler knows how to produce
 * meaningful copy-paste formats for a particular class of URLs.
 *
 * A single handler can return multiple formats (e.g. a record page may offer
 * both a record link and a link to its table).
 *
 * A plugin contributes a handler by registering it from its page module:
 * `HandlerRegistry.register(new MyHandler())`. The richlink plugin
 * auto-discovers its own `handlers/*.handler.ts` the same way.
 */
/** Truncate a string to `max` chars, adding "..." if it was shortened. */
export function truncateWithEllipsis(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

/** Escape a string for safe interpolation into HTML markup or attribute values. */
export function escapeHtml(s: string): string {
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/**
 * Build "prefix: title" with total length capped at maxLen.
 * The title is truncated (not the prefix) when the combined string is too long.
 */
export function prefixedTitle(prefix: string, title: string, maxLen: number): string {
    const sep = ': ';
    const remaining = maxLen - prefix.length - sep.length;
    const truncated = remaining >= 4 ? truncateWithEllipsis(title, remaining) : title;
    return prefix + sep + truncated;
}

/** Build a standard LinkFormat: `<a href="url">title</a>` / `title (url)`. */
export function linkFormat(
    label: string,
    priority: number,
    title: string,
    url: string,
    isFallback?: boolean,
): LinkFormat {
    return {
        label,
        priority,
        ...(isFallback && {isFallback}),
        title,
        html: `<a href="${escapeHtml(url)}">${escapeHtml(title)}</a>`,
        text: `${title} (${url})`,
    };
}

export abstract class Handler {
    /** Return true if this handler knows how to produce links for the given URL. */
    abstract canHandle(url: URL): boolean;

    /** The button label shown in the format picker (e.g. "GitHub PR", "Google Doc"). */
    abstract readonly label: string;

    /** Lower numbers appear first in the format picker. */
    abstract readonly priority: number;

    /** Extract the display text for the link from the page DOM and/or URL. Defaults to document.title. */
    extractLinkText(_ctx: FormatContext): string {
        return document.title;
    }

    /** True for fallback handlers (e.g. Page Title, Raw URL) that match all URLs. */
    readonly isFallback: boolean = false;

    /** Override to canonicalize the URL (e.g. strip GitHub PR sub-pages). Defaults to ctx.url. */
    protected getUrl(ctx: FormatContext): string {
        return ctx.url;
    }

    /** Return one or more LinkFormats for the given URL. Override for multi-format handlers. */
    getFormats(ctx: FormatContext): LinkFormat[] {
        return [
            linkFormat(
                this.label,
                this.priority,
                this.extractLinkText(ctx),
                this.getUrl(ctx),
                this.isFallback,
            ),
        ];
    }
}
