import {describe, it, expect} from 'vitest';
import {renderMarkdown, code, bold, italic} from '@exo/lib/toast-notification/markdown';

describe('renderMarkdown', () => {
    it('renders plain text with no markup', () => {
        const el = renderMarkdown('hello world');
        expect(el.textContent).toBe('hello world');
        expect(el.querySelector('code')).toBeNull();
        expect(el.querySelector('strong')).toBeNull();
    });

    it('renders an inline code span as a <code> chip', () => {
        const el = renderMarkdown('press `F` now');
        const code = el.querySelector('code');
        expect(code?.textContent).toBe('F');
        expect(code?.style.fontFamily).toContain('Mono');
        // Surrounding text is preserved.
        expect(el.textContent).toBe('press F now');
    });

    it('renders bold (**) as <strong>', () => {
        const el = renderMarkdown('a **bold** word');
        expect(el.querySelector('strong')?.textContent).toBe('bold');
        expect(el.textContent).toBe('a bold word');
    });

    it('renders italic (*) as <em>', () => {
        const el = renderMarkdown('an *italic* word');
        expect(el.querySelector('em')?.textContent).toBe('italic');
        expect(el.querySelector('strong')).toBeNull();
        expect(el.textContent).toBe('an italic word');
    });

    it('prefers ** bold over * italic', () => {
        const el = renderMarkdown('**bold** not *italic*');
        expect(el.querySelector('strong')?.textContent).toBe('bold');
        expect(el.querySelector('em')?.textContent).toBe('italic');
    });

    it('renders newlines as <br>', () => {
        const el = renderMarkdown('line one\nline two');
        expect(el.querySelectorAll('br')).toHaveLength(1);
        expect(el.textContent).toBe('line oneline two');
    });

    it('renders multiple inline tokens on one line', () => {
        const el = renderMarkdown('`a` then **b** then `c`');
        expect(el.querySelectorAll('code')).toHaveLength(2);
        expect(el.querySelectorAll('strong')).toHaveLength(1);
        expect(el.textContent).toBe('a then b then c');
    });

    it('renders the keystroke toast shape (code chip + description line)', () => {
        const el = renderMarkdown('exo keystroke `F`\nGo to Files changed tab');
        expect(el.querySelector('code')?.textContent).toBe('F');
        expect(el.querySelectorAll('br')).toHaveLength(1);
        expect(el.textContent).toBe('exo keystroke FGo to Files changed tab');
    });

    it('treats an unterminated backtick as literal text', () => {
        const el = renderMarkdown('a `lonely backtick');
        expect(el.querySelector('code')).toBeNull();
        expect(el.textContent).toBe('a `lonely backtick');
    });

    it('returns an empty container for an empty string', () => {
        const el = renderMarkdown('');
        expect(el.textContent).toBe('');
        expect(el.children).toHaveLength(0);
    });
});

describe('markdown builders', () => {
    it('wrap text in the right markers', () => {
        expect(code('F')).toBe('`F`');
        expect(bold('hi')).toBe('**hi**');
        expect(italic('hi')).toBe('*hi*');
    });

    it('compose with renderMarkdown so callers never write markers by hand', () => {
        const el = renderMarkdown(`exo keystroke ${code('F')}`);
        expect(el.querySelector('code')?.textContent).toBe('F');
        expect(el.textContent).toBe('exo keystroke F');
    });
});
