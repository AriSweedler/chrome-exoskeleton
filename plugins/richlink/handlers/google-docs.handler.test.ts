import {describe, it, expect, beforeEach, vi} from 'vitest';
import {GoogleDocsHandler} from '@exo/plugins/richlink/handlers/google-docs.handler';

describe('GoogleDocsHandler', () => {
    let handler: GoogleDocsHandler;

    beforeEach(() => {
        handler = new GoogleDocsHandler();
    });

    it('should handle Google Docs URLs', () => {
        expect(handler.canHandle(new URL('https://docs.google.com/document/d/abc123/edit'))).toBe(
            true,
        );
        expect(handler.canHandle(new URL('https://docs.google.com/spreadsheets/d/xyz456'))).toBe(
            true,
        );
        expect(handler.canHandle(new URL('https://docs.google.com/presentation/d/def789'))).toBe(
            true,
        );
        expect(handler.canHandle(new URL('https://example.com'))).toBe(false);
    });

    it('should not be a fallback handler', () => {
        expect(handler.isFallback).toBe(false);
    });

    it('should return format with priority 20 and label "Google Doc"', () => {
        const format = handler.getFormats({
            url: 'https://docs.google.com/document/d/abc123/edit',
        })[0];
        expect(format.priority).toBe(20);
        expect(format.label).toBe('Google Doc');
    });

    it('should extract document title from Google Docs page', async () => {
        // Mock Google Docs page DOM
        const mockTitle = document.createElement('input');
        mockTitle.className = 'docs-title-input';
        mockTitle.value = 'Project Requirements Document';
        document.body.appendChild(mockTitle);

        vi.stubGlobal('window', {
            location: {
                href: 'https://docs.google.com/document/d/abc123/edit',
            },
        });

        const format = handler.getFormats({
            url: 'https://docs.google.com/document/d/abc123/edit',
        })[0];
        expect(format.html).toBe(
            '<a href="https://docs.google.com/document/d/abc123/edit">Project Requirements Document</a>',
        );
        expect(format.text).toBe(
            'Project Requirements Document (https://docs.google.com/document/d/abc123/edit)',
        );

        document.body.removeChild(mockTitle);
    });

    it('should handle missing document title', async () => {
        vi.stubGlobal('window', {
            location: {
                href: 'https://docs.google.com/document/d/abc123/edit',
            },
        });

        const format = handler.getFormats({
            url: 'https://docs.google.com/document/d/abc123/edit',
        })[0];
        expect(format.html).toBe(
            '<a href="https://docs.google.com/document/d/abc123/edit">Google Doc</a>',
        );
    });

    it('should handle alternative title selector', async () => {
        // Some Google Docs pages use a different selector
        const mockTitle = document.createElement('span');
        mockTitle.setAttribute('data-tooltip', 'Rename');
        mockTitle.textContent = 'Meeting Notes';
        document.body.appendChild(mockTitle);

        vi.stubGlobal('window', {
            location: {
                href: 'https://docs.google.com/document/d/xyz789/edit',
            },
        });

        const format = handler.getFormats({
            url: 'https://docs.google.com/document/d/xyz789/edit',
        })[0];
        expect(format.html).toBe(
            '<a href="https://docs.google.com/document/d/xyz789/edit">Meeting Notes</a>',
        );

        document.body.removeChild(mockTitle);
    });
});
