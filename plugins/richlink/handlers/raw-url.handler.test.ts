import {describe, it, expect, beforeEach, vi} from 'vitest';
import {RawUrlHandler} from '@exo/plugins/richlink/handlers/raw-url.handler';

describe('RawUrlHandler', () => {
    let handler: RawUrlHandler;

    beforeEach(() => {
        handler = new RawUrlHandler();
        vi.stubGlobal('window', {
            location: {
                href: 'https://example.com/page?query=test#anchor',
            },
        });
    });

    it('should handle any URL', () => {
        expect(handler.canHandle(new URL('https://example.com'))).toBe(true);
        expect(handler.canHandle(new URL('https://github.com'))).toBe(true);
    });

    it('should be a fallback handler', () => {
        expect(handler.isFallback).toBe(true);
    });

    it('should return raw URL for both html and text', async () => {
        const html = handler.getFormats({url: 'https://example.com/page?query=test#anchor'})[0]
            .html;
        expect(html).toBe('https://example.com/page?query=test#anchor');

        const text = handler.getFormats({url: 'https://example.com/page?query=test#anchor'})[0]
            .text;
        expect(text).toBe('https://example.com/page?query=test#anchor');
    });

    it('should escape HTML entities in the html field but not the text field', () => {
        const url = 'https://example.com/page?a=1&copy=2';
        const format = handler.getFormats({url})[0];
        expect(format.html).toBe('https://example.com/page?a=1&amp;copy=2');
        expect(format.text).toBe(url);
    });
});
