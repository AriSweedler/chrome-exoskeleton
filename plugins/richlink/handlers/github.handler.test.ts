import {describe, it, expect, beforeEach, vi} from 'vitest';
import {GitHubHandler} from '@exo/plugins/richlink/handlers/github.handler';

describe('GitHubHandler', () => {
    let handler: GitHubHandler;

    beforeEach(() => {
        handler = new GitHubHandler();
    });

    it('should handle GitHub PR URLs and sub-pages', () => {
        expect(handler.canHandle(new URL('https://github.com/user/repo/pull/123'))).toBe(true);
        expect(handler.canHandle(new URL('https://github.com/user/repo/pull/456/files'))).toBe(
            true,
        );
        expect(handler.canHandle(new URL('https://github.com/user/repo/pull/789/commits'))).toBe(
            true,
        );
        expect(handler.canHandle(new URL('https://github.com/user/repo/pull/789/checks'))).toBe(
            true,
        );
        expect(handler.canHandle(new URL('https://github.com/user/repo/pull/789/changes'))).toBe(
            true,
        );
        expect(
            handler.canHandle(new URL('https://github.com/user/repo/pull/123?tab=overview')),
        ).toBe(true);
        expect(
            handler.canHandle(new URL('https://github.com/user/repo/pull/123#issuecomment-999')),
        ).toBe(true);
        expect(handler.canHandle(new URL('https://github.com/user/repo'))).toBe(false);
        expect(handler.canHandle(new URL('https://github.com/user/repo/issues/123'))).toBe(false);
        expect(handler.canHandle(new URL('https://example.com'))).toBe(false);
    });

    it('should not be a fallback handler', () => {
        expect(handler.isFallback).toBe(false);
    });

    it('should return format with priority 10 and label "GitHub PR"', () => {
        const format = handler.getFormats({url: 'https://github.com/user/repo/pull/123'})[0];
        expect(format.priority).toBe(10);
        expect(format.label).toBe('GitHub PR');
    });

    it('should extract PR title from GitHub page', async () => {
        // Mock GitHub PR page DOM with modern selector
        const mockTitle = document.createElement('span');
        mockTitle.className = 'markdown-title';
        mockTitle.textContent = 'Fix bug in authentication';
        document.body.appendChild(mockTitle);

        vi.stubGlobal('window', {
            location: {
                href: 'https://github.com/user/repo/pull/123',
            },
        });

        const format = handler.getFormats({url: 'https://github.com/user/repo/pull/123'})[0];
        expect(format.html).toBe(
            '<a href="https://github.com/user/repo/pull/123">Fix bug in authentication (#123)</a>',
        );
        expect(format.text).toBe(
            'Fix bug in authentication (#123) (https://github.com/user/repo/pull/123)',
        );

        document.body.removeChild(mockTitle);
    });

    it('should handle missing PR title', async () => {
        vi.stubGlobal('window', {
            location: {
                href: 'https://github.com/user/repo/pull/456',
            },
        });

        const format = handler.getFormats({url: 'https://github.com/user/repo/pull/456'})[0];
        expect(format.html).toBe('<a href="https://github.com/user/repo/pull/456">GitHub PR</a>');
    });

    it('should strip sub-pages like /files from the link URL', async () => {
        // Mock GitHub PR files page DOM with modern selector
        const mockTitle = document.createElement('span');
        mockTitle.className = 'markdown-title';
        mockTitle.textContent = 'feat(escalation_agent): Add thread context to agent prompts';
        document.body.appendChild(mockTitle);

        vi.stubGlobal('window', {
            location: {
                href: 'https://github.com/anthropics/escalation/pull/200045/files',
            },
        });

        const format = handler.getFormats({
            url: 'https://github.com/anthropics/escalation/pull/200045/files',
        })[0];
        expect(format.html).toBe(
            '<a href="https://github.com/anthropics/escalation/pull/200045">feat(escalation_agent): Add thread context to agent prompts (#200045)</a>',
        );
        expect(format.text).toBe(
            'feat(escalation_agent): Add thread context to agent prompts (#200045) (https://github.com/anthropics/escalation/pull/200045)',
        );

        document.body.removeChild(mockTitle);
    });

    it('should extract the PR number from comment permalink URLs with a fragment', () => {
        const format = handler.getFormats({
            url: 'https://github.com/user/repo/pull/123#issuecomment-999',
        })[0];
        expect(format.html).toBe('<a href="https://github.com/user/repo/pull/123">GitHub PR</a>');
    });

    it('should keep the canonical URL intact when the query contains a slash', () => {
        const format = handler.getFormats({
            url: 'https://github.com/user/repo/pull/123?base=ariSweedler/fix',
        })[0];
        expect(format.html).toBe('<a href="https://github.com/user/repo/pull/123">GitHub PR</a>');
        expect(format.text).toBe('GitHub PR (https://github.com/user/repo/pull/123)');
    });

    it('should escape HTML in the PR title', () => {
        const mockTitle = document.createElement('span');
        mockTitle.className = 'markdown-title';
        mockTitle.textContent = 'Handle <input> events & "edge" cases';
        document.body.appendChild(mockTitle);

        const format = handler.getFormats({url: 'https://github.com/user/repo/pull/123'})[0];
        expect(format.html).toBe(
            '<a href="https://github.com/user/repo/pull/123">Handle &lt;input&gt; events &amp; &quot;edge&quot; cases (#123)</a>',
        );
        expect(format.text).toBe(
            'Handle <input> events & "edge" cases (#123) (https://github.com/user/repo/pull/123)',
        );

        document.body.removeChild(mockTitle);
    });
});
