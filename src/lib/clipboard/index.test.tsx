import {describe, it, expect, beforeEach, vi} from 'vitest';
import {Clipboard} from '@exo/lib/clipboard';

describe('Clipboard', () => {
    beforeEach(() => {
        // Mock ClipboardItem
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).ClipboardItem = class ClipboardItem {
            constructor(public data: Record<string, Blob>) {}
        };

        // Mock navigator.clipboard
        Object.assign(navigator, {
            clipboard: {
                write: vi.fn(),
                writeText: vi.fn(),
            },
        });
    });

    describe('write', () => {
        it('should write text to clipboard', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (navigator.clipboard.writeText as any).mockResolvedValue(undefined);

            await Clipboard.write('Hello World');

            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello World');
        });

        it('should write both text and HTML to clipboard', async () => {
            const clipboardItems: ClipboardItem[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (navigator.clipboard.write as any).mockImplementation((items: ClipboardItem[]) => {
                clipboardItems.push(...items);
                return Promise.resolve();
            });

            await Clipboard.write('Hello', '<p>Hello</p>');

            expect(navigator.clipboard.write).toHaveBeenCalled();
            expect(clipboardItems).toHaveLength(1);
        });

        it('should fall back to execCommand when clipboard API fails', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (navigator.clipboard.writeText as any).mockRejectedValue(
                new Error('Clipboard access denied'),
            );

            // Mock execCommand so fallback works
            document.execCommand = vi.fn().mockReturnValue(true);

            await Clipboard.write('test');

            expect(document.execCommand).toHaveBeenCalledWith('copy');
        });
    });
});
