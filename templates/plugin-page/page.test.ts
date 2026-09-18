import {describe, it, expect} from 'vitest';
import {isTargetPage} from '@exo/plugins/__NAME__/page';

describe('__NAME__', () => {
    it('recognizes its site', () => {
        expect(isTargetPage('https://example.com/anything')).toBe(true);
        expect(isTargetPage('https://other.example/')).toBe(false);
    });
});
