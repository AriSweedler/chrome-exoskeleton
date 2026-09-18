import {theme} from './theme';

/**
 * Toast content renderer — the "styling" half of the toast, kept separate from
 * the toast lifecycle ("sending") in index.tsx.
 *
 * Renders a small, safe subset of Markdown to plain DOM (no React, so it works
 * reliably inside a content script). Supported syntax:
 *   - inline code:  `code`    -> styled <code> chip
 *   - bold:         **bold**  -> <strong>
 *   - italic:       *italic*  -> <em>
 *   - line breaks:  \n        -> <br>
 *
 * Anything else (including an unterminated `` ` ``, ``*``, or ``**``) renders as
 * literal text, so malformed input degrades gracefully rather than throwing.
 */
export function renderMarkdown(markdown: string): HTMLElement {
    const root = document.createElement('span');
    markdown.split('\n').forEach((line, index) => {
        if (index > 0) {
            root.appendChild(document.createElement('br'));
        }
        appendInline(root, line);
    });
    return root;
}

/**
 * Builders for the supported inline syntax, so callers never hand-write (and
 * escape) the markers themselves. e.g. `` `exo ${code(key)}` ``.
 */
export const code = (text: string): string => `\`${text}\``;
export const bold = (text: string): string => `**${text}**`;
export const italic = (text: string): string => `*${text}*`;

// One inline token: `code`, **bold**, or *italic*. Everything else is text.
// **bold** is listed before *italic* so the double-star form wins.
const INLINE_TOKEN = /`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*/g;

function appendInline(parent: HTMLElement, text: string): void {
    let cursor = 0;
    for (const match of text.matchAll(INLINE_TOKEN)) {
        const start = match.index;
        if (start === undefined) {
            continue;
        }
        if (start > cursor) {
            parent.appendChild(document.createTextNode(text.slice(cursor, start)));
        }
        parent.appendChild(renderToken(match[0]));
        cursor = start + match[0].length;
    }
    if (cursor < text.length) {
        parent.appendChild(document.createTextNode(text.slice(cursor)));
    }
}

function renderToken(token: string): HTMLElement {
    if (token.startsWith('`')) {
        return makeCode(token.slice(1, -1));
    }
    if (token.startsWith('**')) {
        return makeInline('strong', token.slice(2, -2));
    }
    return makeInline('em', token.slice(1, -1));
}

function makeCode(content: string): HTMLElement {
    const el = document.createElement('code');
    el.textContent = content;
    el.style.background = theme.toast.code.background;
    el.style.padding = theme.toast.code.padding;
    el.style.borderRadius = theme.toast.code.borderRadius;
    el.style.fontFamily = theme.toast.code.fontFamily;
    return el;
}

function makeInline(tag: 'strong' | 'em', content: string): HTMLElement {
    const el = document.createElement(tag);
    el.textContent = content;
    return el;
}
