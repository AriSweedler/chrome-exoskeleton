import {describe, it, expect} from 'vitest';
import {safeUrl} from '@exo/lib/url';

describe('safeUrl', () => {
    it('parses a valid URL', () => {
        expect(safeUrl('https://example.com/path?a=1')?.hostname).toBe('example.com');
    });

    it('returns null for garbage', () => {
        expect(safeUrl('not-a-url')).toBeNull();
    });

    it('returns null for the empty string', () => {
        expect(safeUrl('')).toBeNull();
    });
});
