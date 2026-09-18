import {describe, it, expect} from 'vitest';
import {__Pascal__Handler} from '@exo/plugins/__NAME__/richlink.handler';

describe('__Pascal__Handler', () => {
    it('handles its site only', () => {
        const handler = new __Pascal__Handler();
        expect(handler.canHandle(new URL('https://example.com/x'))).toBe(true);
        expect(handler.canHandle(new URL('https://other.example/'))).toBe(false);
    });
});
