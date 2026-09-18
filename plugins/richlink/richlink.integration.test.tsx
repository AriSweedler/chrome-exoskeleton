import {describe, it, expect, beforeEach, vi} from 'vitest';
import {HandlerRegistry} from '@exo/plugins/richlink/handlers';

describe('Rich Link Integration', () => {
    beforeEach(() => {
        // Mock DOM
        vi.stubGlobal('document', {
            title: 'Test Page',
            querySelector: vi.fn(),
        });
        vi.stubGlobal('window', {
            location: {
                href: 'https://github.com/user/repo/pull/123',
            },
        });
    });

    it('should load all handlers', () => {
        // GitHub handler matches PR URLs specifically
        expect(HandlerRegistry.hasSpecializedHandler('https://github.com/user/repo/pull/123')).toBe(
            true,
        );
        expect(HandlerRegistry.hasSpecializedHandler('https://example.com')).toBe(false);
    });

    it('should return formats in priority order', () => {
        const formats = HandlerRegistry.getAllFormats('https://github.com/user/repo/pull/123');
        expect(formats.length).toBeGreaterThan(0);

        // GitHub PR should be first (priority 10)
        expect(formats[0].label).toBe('GitHub PR');

        // Verify priority order: each handler's priority should be <= the next
        const labels = formats.map((f) => f.label);
        expect(labels).toContain('Page Title');
        expect(labels).toContain('Raw URL');
        expect(labels.indexOf('Page Title')).toBeLessThan(labels.indexOf('Raw URL'));
    });

    it('should fallback to base handlers on unsupported sites', () => {
        const formats = HandlerRegistry.getAllFormats('https://example.com');

        // Should only have base handlers
        expect(formats).toHaveLength(2);
        expect(formats[0].label).toBe('Page Title');
        expect(formats[1].label).toBe('Raw URL');
    });
});
