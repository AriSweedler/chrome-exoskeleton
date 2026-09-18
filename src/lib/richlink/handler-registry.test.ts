import {describe, it, expect, beforeEach} from 'vitest';
import {HandlerRegistry} from '@exo/lib/richlink/handler-registry';
import {Handler} from '@exo/lib/richlink/base';

class SpecializedHandler extends Handler {
    readonly label = 'Specialized';
    readonly priority = 10;

    canHandle(url: URL): boolean {
        return url.hostname === 'specialized.com';
    }
}

class FallbackHandler extends Handler {
    readonly label = 'Fallback';
    readonly priority = 100;
    override readonly isFallback = true;

    canHandle(): boolean {
        return true;
    }
}

describe('HandlerRegistry', () => {
    beforeEach(() => {
        HandlerRegistry['baseHandlers'] = [];
        HandlerRegistry['specializedHandlers'] = [];
    });

    it('should register specialized handlers', () => {
        HandlerRegistry.register(new SpecializedHandler());

        const formats = HandlerRegistry.getAllFormats('https://specialized.com/page');
        expect(formats).toHaveLength(1);
        expect(formats[0].label).toBe('Specialized');
    });

    it('should register fallback handlers', () => {
        HandlerRegistry.register(new FallbackHandler());

        const formats = HandlerRegistry.getAllFormats('https://example.com');
        expect(formats).toHaveLength(1);
        expect(formats[0].label).toBe('Fallback');
    });

    it('should return formats in priority order', () => {
        HandlerRegistry.register(new SpecializedHandler());
        HandlerRegistry.register(new FallbackHandler());

        const formats = HandlerRegistry.getAllFormats('https://specialized.com/page');
        expect(formats).toHaveLength(2);
        expect(formats[0].label).toBe('Specialized');
        expect(formats[1].label).toBe('Fallback');
    });

    it('should detect specialized handlers', () => {
        HandlerRegistry.register(new SpecializedHandler());
        HandlerRegistry.register(new FallbackHandler());

        expect(HandlerRegistry.hasSpecializedHandler('https://specialized.com/page')).toBe(true);
        expect(HandlerRegistry.hasSpecializedHandler('https://example.com')).toBe(false);
    });
});
