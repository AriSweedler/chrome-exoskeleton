import {describe, it, expect} from 'vitest';
import {
    SLUG_MAX,
    FALLBACK_SLUG,
    slugify,
    snapshotFilename,
    claudePrompt,
    serializeDocument,
} from '@exo/plugins/save-page/snapshot';

describe('slugify', () => {
    it('lowercases and joins words with dashes', () => {
        expect(slugify('Hello World')).toBe('hello-world');
    });

    it('collapses punctuation runs and trims the ends', () => {
        expect(slugify('  (1) Foo — bar: baz!  ')).toBe('1-foo-bar-baz');
    });

    it('strips diacritics instead of dropping the letter', () => {
        expect(slugify('Café Déjà')).toBe('cafe-deja');
    });

    it(`cuts at ${SLUG_MAX} characters without a dangling dash`, () => {
        const slug = slugify('Pull Request #1234 · owner/repo · GitHub');
        expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
        expect(slug).toBe('pull-request-1234-ow');
        expect(slugify('abcdefghijklmnopqrs tuv')).toBe('abcdefghijklmnopqrs');
    });

    it('falls back when nothing survives', () => {
        expect(slugify('')).toBe(FALLBACK_SLUG);
        expect(slugify('日本語')).toBe(FALLBACK_SLUG);
        expect(slugify('---')).toBe(FALLBACK_SLUG);
    });
});

describe('snapshotFilename', () => {
    it('is slug.epoch.html', () => {
        expect(snapshotFilename('My Page', 1700000000)).toBe('my-page.1700000000.html');
    });
});

describe('claudePrompt', () => {
    it('mentions the file under ~/Downloads', () => {
        expect(claudePrompt('my-page.1700000000.html')).toBe(
            'Find the webpage @~/Downloads/my-page.1700000000.html',
        );
    });
});

describe('serializeDocument', () => {
    const savedAt = new Date('2026-11-04T12:00:00.000Z');

    it('keeps the doctype, names the source, and serializes the DOM', () => {
        const doc = new window.DOMParser().parseFromString(
            '<!DOCTYPE html><html><head><title>T</title></head><body><h1>Hi</h1></body></html>',
            'text/html',
        );
        const html = serializeDocument(doc, 'https://example.com/a?b=1', savedAt);
        expect(html.startsWith('<!DOCTYPE html>\n')).toBe(true);
        expect(html).toContain(
            '<!-- saved by chrome-exoskeleton from https://example.com/a?b=1 at 2026-11-04T12:00:00.000Z -->',
        );
        expect(html).toContain('<h1>Hi</h1>');
        expect(html.endsWith('</html>\n')).toBe(true);
    });

    it('invents a doctype for a document without one', () => {
        const doc = new window.DOMParser().parseFromString('<p>x</p>', 'text/html');
        expect(serializeDocument(doc, 'https://example.com/', savedAt)).toMatch(/^<!DOCTYPE html>/);
    });

    it("leaves out the extension's own elements and does not touch the live DOM", () => {
        const doc = new window.DOMParser().parseFromString(
            '<!DOCTYPE html><html><body><p>page</p><div id="exo-notification-container">toast</div><div id="exo-help-overlay">help</div></body></html>',
            'text/html',
        );
        const html = serializeDocument(doc, 'https://example.com/', savedAt);
        expect(html).toContain('<p>page</p>');
        expect(html).not.toContain('exo-notification-container');
        expect(html).not.toContain('exo-help-overlay');
        expect(doc.getElementById('exo-notification-container')).not.toBeNull();
    });
});
