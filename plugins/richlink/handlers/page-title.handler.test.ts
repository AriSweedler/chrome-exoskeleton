import {describe, it, expect, beforeEach, vi} from 'vitest';
import {PageTitleHandler} from '@exo/plugins/richlink/handlers/page-title.handler';

describe('PageTitleHandler', () => {
    let handler: PageTitleHandler;

    beforeEach(() => {
        handler = new PageTitleHandler();
        // Mock document
        vi.stubGlobal('document', {
            title: 'Test Page Title',
        });
        vi.stubGlobal('window', {
            location: {
                href: 'https://example.com/page',
            },
        });
    });

    it('should handle any URL', () => {
        expect(handler.canHandle(new URL('https://example.com'))).toBe(true);
        expect(handler.canHandle(new URL('https://github.com'))).toBe(true);
        expect(handler.canHandle(new URL('chrome://extensions'))).toBe(true);
    });

    it('should be a fallback handler', () => {
        expect(handler.isFallback).toBe(true);
    });

    it('should extract page title from document', async () => {
        const html = handler.getFormats({url: 'https://example.com/page'})[0].html;
        expect(html).toBe('<a href="https://example.com/page">Test Page Title</a>');

        const text = handler.getFormats({url: 'https://example.com/page'})[0].text;
        expect(text).toBe('Test Page Title (https://example.com/page)');
    });

    it('should handle missing title', async () => {
        vi.stubGlobal('document', {title: ''});

        const html = handler.getFormats({url: 'https://example.com/page'})[0].html;
        expect(html).toBe('<a href="https://example.com/page">Untitled</a>');
    });
});
