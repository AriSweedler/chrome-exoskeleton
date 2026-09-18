import {describe, it, expect} from 'vitest';
import {Tabs} from '@exo/lib/service-worker/tabs';

describe('Tabs', () => {
    describe('canInjectContent', () => {
        it('should return true for http URLs', () => {
            expect(Tabs.canInjectContent('http://example.com')).toBe(true);
            expect(Tabs.canInjectContent('http://google.com/search?q=test')).toBe(true);
        });

        it('should return true for https URLs', () => {
            expect(Tabs.canInjectContent('https://example.com')).toBe(true);
            expect(Tabs.canInjectContent('https://github.com/user/repo')).toBe(true);
        });

        it('should return false for chrome:// URLs', () => {
            expect(Tabs.canInjectContent('chrome://extensions')).toBe(false);
            expect(Tabs.canInjectContent('chrome://settings')).toBe(false);
            expect(Tabs.canInjectContent('chrome://newtab')).toBe(false);
        });

        it('should return false for chrome-extension:// URLs', () => {
            expect(Tabs.canInjectContent('chrome-extension://abc123/popup.html')).toBe(false);
        });

        it('should return false for about: URLs', () => {
            expect(Tabs.canInjectContent('about:blank')).toBe(false);
            expect(Tabs.canInjectContent('about:config')).toBe(false);
        });

        it('should return false for edge:// URLs', () => {
            expect(Tabs.canInjectContent('edge://settings')).toBe(false);
        });

        it('should return false for undefined URL', () => {
            expect(Tabs.canInjectContent(undefined)).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(Tabs.canInjectContent('')).toBe(false);
        });

        it('should return true for file:// URLs', () => {
            expect(Tabs.canInjectContent('file:///path/to/file.html')).toBe(true);
        });

        it('should return true for localhost URLs', () => {
            expect(Tabs.canInjectContent('http://localhost:3000')).toBe(true);
            expect(Tabs.canInjectContent('https://localhost:8080')).toBe(true);
        });
    });
});
