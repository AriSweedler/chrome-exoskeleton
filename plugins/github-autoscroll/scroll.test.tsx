import {describe, it, expect, vi, beforeEach} from 'vitest';
import {
    scrollElementCenter,
    scrollElementTop,
    scrollToPageBottom,
    scrollToPageTop,
} from '@exo/plugins/github-autoscroll/scroll';

describe('scroll utilities', () => {
    let scrollBySpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        scrollBySpy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    });

    function makeElement(top: number, height: number): HTMLElement {
        const el = document.createElement('div');
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
            top,
            bottom: top + height,
            left: 0,
            right: 100,
            width: 100,
            height,
            x: 0,
            y: top,
            toJSON: () => {},
        });
        return el;
    }

    describe('scrollElementCenter', () => {
        it('scrolls element center to the target offset', () => {
            const el = makeElement(500, 100);
            scrollElementCenter(el, {offsetTop: 100});

            // Element center is at 500 + 50 = 550, target is 100, delta = 450
            expect(scrollBySpy).toHaveBeenCalledWith({top: 450, behavior: 'smooth'});
        });

        it('uses default offsetTop of 100', () => {
            const el = makeElement(200, 40);
            scrollElementCenter(el);

            // Center at 200 + 20 = 220, target 100, delta = 120
            expect(scrollBySpy).toHaveBeenCalledWith({top: 120, behavior: 'smooth'});
        });
    });

    describe('scrollToPageTop / scrollToPageBottom', () => {
        it('scrolls the window to the top', () => {
            const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
            scrollToPageTop();
            expect(scrollToSpy).toHaveBeenCalledWith({top: 0, behavior: 'smooth'});
        });

        it('scrolls the window to the full document height', () => {
            const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
            vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(4321);
            scrollToPageBottom();
            expect(scrollToSpy).toHaveBeenCalledWith({top: 4321, behavior: 'smooth'});
        });
    });

    describe('scrollElementTop', () => {
        it('scrolls element top to the target offset', () => {
            const el = makeElement(300, 80);
            scrollElementTop(el, {offsetTop: 0});

            // Top at 300, target 0, delta = 300
            expect(scrollBySpy).toHaveBeenCalledWith({top: 300, behavior: 'smooth'});
        });

        it('uses default offsetTop of 100', () => {
            const el = makeElement(300, 80);
            scrollElementTop(el);

            // Top at 300, target 100, delta = 200
            expect(scrollBySpy).toHaveBeenCalledWith({top: 200, behavior: 'smooth'});
        });
    });
});
