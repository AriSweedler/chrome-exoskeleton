import {describe, expect, it} from 'vitest';
import {cleanUrl} from '@exo/lib/richlink/clean-url';

describe('cleanUrl', () => {
    // --- Core stripping behavior ---

    it('strips utm_* parameters', () => {
        const url =
            'https://example.com/post?utm_source=newsletter&utm_medium=email&utm_campaign=spring';
        expect(cleanUrl(url)).toBe('https://example.com/post');
    });

    it('strips ck_subscriber_id', () => {
        const url =
            'https://arturdryomov.dev/posts/amazon-s3-paper-cuts/?ck_subscriber_id=3059874859';
        expect(cleanUrl(url)).toBe('https://arturdryomov.dev/posts/amazon-s3-paper-cuts/');
    });

    it('strips fbclid', () => {
        const url = 'https://example.com/page?fbclid=abc123';
        expect(cleanUrl(url)).toBe('https://example.com/page');
    });

    it('strips HubSpot params', () => {
        const url = 'https://example.com/page?_hsenc=abc&_hsmi=123&real=yes';
        expect(cleanUrl(url)).toBe('https://example.com/page?real=yes');
    });

    it('strips gclid and msclkid', () => {
        const url = 'https://example.com/blog/?gclid=abc&msclkid=def';
        expect(cleanUrl(url)).toBe('https://example.com/blog/');
    });

    // --- The motivating example ---

    it('cleans the exact URL from the issue description', () => {
        const url =
            'https://arturdryomov.dev/posts/amazon-s3-paper-cuts/?ck_subscriber_id=3059874859&utm_source=convertkit&utm_medium=email&utm_campaign=[Last%20Week%20in%20AWS]%20Issue%20%23463:%20Beanstalk%20AI:%20The%20Resurrection%20Nobody%20Asked%20For%20-%2021048004';
        expect(cleanUrl(url)).toBe('https://arturdryomov.dev/posts/amazon-s3-paper-cuts/');
    });

    // --- Preserves legitimate params ---

    it('preserves non-tracking query parameters', () => {
        const url = 'https://example.com/search?q=hello&page=2&utm_source=twitter';
        expect(cleanUrl(url)).toBe('https://example.com/search?q=hello&page=2');
    });

    it('preserves fragment', () => {
        const url = 'https://example.com/page?utm_source=x#section-2';
        expect(cleanUrl(url)).toBe('https://example.com/page#section-2');
    });

    // --- No-op cases: returns original string unchanged ---

    it('returns original string unchanged when no tracking params present', () => {
        const url = 'https://example.com/page?id=42&sort=name';
        expect(cleanUrl(url)).toBe(url);
    });

    it('returns original string unchanged when URL has no query params at all', () => {
        const url = 'https://example.com/some/path';
        expect(cleanUrl(url)).toBe(url);
    });

    it('returns original string for invalid URLs', () => {
        expect(cleanUrl('not-a-url')).toBe('not-a-url');
    });

    it('returns original string unchanged to avoid re-encoding artifacts', () => {
        // URL has encoded characters but no tracking params — must return the exact input string,
        // not a re-encoded version from URL.toString().
        const url = 'https://example.com/search?q=hello%20world&tag=c%2B%2B';
        expect(cleanUrl(url)).toBe(url);
    });

    // --- Multiple tracking params at once ---

    it('strips multiple tracking params from different categories at once', () => {
        const url =
            'https://arturdryomov.dev/posts/amazon-s3-paper-cuts/?ck_subscriber_id=123&utm_source=convertkit&utm_medium=email&utm_campaign=Issue';
        expect(cleanUrl(url)).toBe('https://arturdryomov.dev/posts/amazon-s3-paper-cuts/');
    });
});
