import {describe, it, expect, beforeEach} from 'vitest';
import {Handler, escapeHtml, linkFormat} from '@exo/lib/richlink/base';

class TestHandler extends Handler {
    readonly label = 'Test Handler';
    readonly priority = 10;

    canHandle(url: URL): boolean {
        return url.hostname === 'test.com';
    }
}

describe('Handler', () => {
    beforeEach(() => {
        document.title = 'Test Page';
    });

    it('getFormats uses label, priority, extractLinkText, and url', () => {
        const handler = new TestHandler();
        const url = 'https://test.com/page';
        const format = handler.getFormats({url})[0];
        expect(format).toEqual({
            label: 'Test Handler',
            priority: 10,
            title: 'Test Page',
            html: `<a href="${url}">Test Page</a>`,
            text: `Test Page (${url})`,
        });
    });

    it('isFallback defaults to false', () => {
        expect(new TestHandler().isFallback).toBe(false);
    });

    it('canHandle checks URL', () => {
        const handler = new TestHandler();
        expect(handler.canHandle(new URL('https://test.com/page'))).toBe(true);
        expect(handler.canHandle(new URL('https://other.com/page'))).toBe(false);
    });
});

describe('escapeHtml', () => {
    it('escapes &, <, >, ", and \'', () => {
        expect(escapeHtml(`Handle <input> events & "edge" cases 'quoted'`)).toBe(
            'Handle &lt;input&gt; events &amp; &quot;edge&quot; cases &#39;quoted&#39;',
        );
    });

    it('leaves benign strings untouched', () => {
        expect(escapeHtml('Plain title 123')).toBe('Plain title 123');
    });
});

describe('linkFormat', () => {
    it('escapes the title in the html field but not the text field', () => {
        const title = 'Handle <input> events & "edge" cases';
        const url = 'https://test.com/page';
        const format = linkFormat('Label', 1, title, url);
        expect(format.html).toBe(
            `<a href="${url}">Handle &lt;input&gt; events &amp; &quot;edge&quot; cases</a>`,
        );
        expect(format.text).toBe(`${title} (${url})`);
    });

    it('escapes the url in the href attribute', () => {
        const url = 'https://test.com/page?a=1&copy=2';
        const format = linkFormat('Label', 1, 'Title', url);
        expect(format.html).toBe(`<a href="https://test.com/page?a=1&amp;copy=2">Title</a>`);
        expect(format.text).toBe(`Title (${url})`);
    });
});
