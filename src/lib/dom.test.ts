import {describe, it, expect, beforeEach} from 'vitest';
import {queryFirst, queryFirstText} from '@exo/lib/dom';

describe('dom helpers', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('queryFirst', () => {
        it('returns the element of the first matching selector', () => {
            document.body.innerHTML = '<div class="b">second</div><div class="a">first</div>';
            expect(queryFirst(['.a', '.b'])?.textContent).toBe('first');
        });

        it('falls through selectors that match nothing', () => {
            document.body.innerHTML = '<div class="b">second</div>';
            expect(queryFirst(['.a', '.b'])?.textContent).toBe('second');
        });

        it('returns null when nothing matches', () => {
            expect(queryFirst(['.a', '.b'])).toBeNull();
        });

        it('scopes the search to the given root', () => {
            document.body.innerHTML = '<div class="a">outside</div><section></section>';
            const section = document.querySelector('section')!;
            expect(queryFirst(['.a'], section)).toBeNull();
        });
    });

    describe('queryFirstText', () => {
        it('returns the first non-empty trimmed text', () => {
            document.body.innerHTML = '<div class="a">  padded  </div>';
            expect(queryFirstText(['.a'])).toBe('padded');
        });

        it('falls through matches whose text is empty or whitespace', () => {
            document.body.innerHTML = '<div class="a">   </div><div class="b">real</div>';
            expect(queryFirstText(['.a', '.b'])).toBe('real');
        });

        it('returns null when no selector yields text', () => {
            document.body.innerHTML = '<div class="a"></div>';
            expect(queryFirstText(['.a', '.b'])).toBeNull();
        });

        it('scopes the search to the given root', () => {
            document.body.innerHTML =
                '<a class="a">outside</a><section><a class="a">inside</a></section>';
            expect(queryFirstText(['.a'], document.querySelector('section')!)).toBe('inside');
        });
    });
});
