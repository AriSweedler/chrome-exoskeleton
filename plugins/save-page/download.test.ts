import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {downloadHtml} from '@exo/plugins/save-page/download';

describe('downloadHtml', () => {
    const clicked: HTMLAnchorElement[] = [];

    beforeEach(() => {
        vi.useFakeTimers();
        clicked.length = 0;
        vi.stubGlobal('URL', {
            ...URL,
            createObjectURL: vi.fn(() => 'blob:https://example.com/fake'),
            revokeObjectURL: vi.fn(),
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            clicked.push(this);
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('clicks an attached anchor named for the file, then cleans up', () => {
        downloadHtml('my-page.1.html', '<p>x</p>');

        expect(clicked).toHaveLength(1);
        const anchor = clicked[0];
        expect(anchor.download).toBe('my-page.1.html');
        expect(anchor.href).toBe('blob:https://example.com/fake');
        expect(anchor.isConnected).toBe(false);

        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        vi.runAllTimers();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://example.com/fake');
    });

    it('wraps the html in a text/html blob', () => {
        downloadHtml('a.html', '<p>x</p>');
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(blob.type).toBe('text/html');
        expect(blob.size).toBe('<p>x</p>'.length);
    });
});
