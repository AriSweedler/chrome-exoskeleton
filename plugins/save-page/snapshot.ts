/** How much of the title survives into the filename. */
export const SLUG_MAX = 20;

/** The slug when the title has nothing filename-safe in it. */
export const FALLBACK_SLUG = 'webpage';

/**
 * The extension's own DOM (toasts, the help overlay) is never part of the
 * page the reader meant to save.
 */
const EXTENSION_DOM = '[id^="exo-"]';

/**
 * A tab title as a filename stem: lowercase ASCII words joined by '-', no
 * leading or trailing '-', at most `max` characters.
 */
export function slugify(title: string, max = SLUG_MAX): string {
    const slug = title
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, max)
        .replace(/-+$/, '');
    return slug || FALLBACK_SLUG;
}

/** `<slug>.<epoch seconds>.html` */
export function snapshotFilename(title: string, epochSeconds: number): string {
    return `${slugify(title)}.${epochSeconds}.html`;
}

/**
 * What lands on the clipboard: a Claude Code prompt whose @-mention is the
 * file the browser just saved to its download directory.
 */
export function claudePrompt(filename: string): string {
    return `Find the webpage @~/Downloads/${filename}`;
}

/**
 * The live DOM as an HTML document: its doctype, a provenance comment naming
 * the URL and the moment, then the markup minus the extension's own elements.
 */
export function serializeDocument(doc: Document, url: string, savedAt: Date): string {
    const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : '<!DOCTYPE html>';
    const provenance = `<!-- saved by chrome-exoskeleton from ${url} at ${savedAt.toISOString()} -->`;
    const root = doc.documentElement.cloneNode(true) as HTMLElement;
    root.querySelectorAll(EXTENSION_DOM).forEach((node) => node.remove());
    return `${doctype}\n${provenance}\n${root.outerHTML}\n`;
}
