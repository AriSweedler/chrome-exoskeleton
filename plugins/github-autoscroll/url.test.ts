import {describe, it, expect, afterEach, vi} from 'vitest';
import {
    goToChangedFiles,
    goToConversation,
    isGitHubHost,
    isGitHubPRChangesPage,
    isGitHubPRPage,
    parseGitHubPRUrl,
} from '@exo/plugins/github-autoscroll/url';

describe('isGitHubHost', () => {
    it('accepts github.com and www.github.com, case-insensitively', () => {
        expect(isGitHubHost('https://github.com/o/r')).toBe(true);
        expect(isGitHubHost('https://www.github.com/o/r')).toBe(true);
        expect(isGitHubHost('https://GitHub.com/o/r')).toBe(true);
    });

    it('rejects other hosts, lookalikes and garbage', () => {
        expect(isGitHubHost('https://gitlab.com/o/r')).toBe(false);
        expect(isGitHubHost('https://github.com.evil.example/o/r')).toBe(false);
        expect(isGitHubHost('not a url')).toBe(false);
    });
});

describe('parseGitHubPRUrl', () => {
    it('splits owner, repo, number and tab', () => {
        expect(parseGitHubPRUrl('https://github.com/owner/repo/pull/123/changes')).toEqual({
            owner: 'owner',
            repo: 'repo',
            prNumber: '123',
            tab: 'changes',
        });
    });

    it('has no tab on the Conversation root, with or without a trailing slash', () => {
        expect(parseGitHubPRUrl('https://github.com/owner/repo/pull/123')?.tab).toBeUndefined();
        expect(parseGitHubPRUrl('https://github.com/owner/repo/pull/123/')?.tab).toBeUndefined();
    });

    it('ignores query and fragment', () => {
        const pr = parseGitHubPRUrl('https://github.com/o/r/pull/7/changes?w=1#diff-abc');
        expect(pr).toMatchObject({prNumber: '7', tab: 'changes'});
    });

    it('is null off pull requests', () => {
        expect(parseGitHubPRUrl('https://github.com/owner/repo')).toBeNull();
        expect(parseGitHubPRUrl('https://github.com/owner/repo/pulls')).toBeNull();
        expect(parseGitHubPRUrl('https://github.com/owner/repo/pull/abc')).toBeNull();
        expect(parseGitHubPRUrl('https://gitlab.com/owner/repo/pull/1')).toBeNull();
    });
});

describe('isGitHubPRPage / isGitHubPRChangesPage', () => {
    it('any PR tab is a PR page; only /changes is the changes page', () => {
        const root = 'https://github.com/o/r/pull/1';
        expect(isGitHubPRPage(root)).toBe(true);
        expect(isGitHubPRPage(`${root}/commits`)).toBe(true);
        expect(isGitHubPRPage(`${root}/changes`)).toBe(true);
        expect(isGitHubPRChangesPage(root)).toBe(false);
        expect(isGitHubPRChangesPage(`${root}/files`)).toBe(false);
        expect(isGitHubPRChangesPage(`${root}/changes`)).toBe(true);
        expect(isGitHubPRChangesPage(`https://www.github.com/o/r/pull/1/changes?x#y`)).toBe(true);
    });

    it('is false for non-PR and non-GitHub URLs', () => {
        expect(isGitHubPRPage('https://github.com/o/r/issues/1')).toBe(false);
        expect(isGitHubPRChangesPage('https://example.com/o/r/pull/1/changes')).toBe(false);
    });
});

describe('PR tab navigation', () => {
    const at = (href: string) => vi.stubGlobal('location', {href});

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('goToChangedFiles goes from any other tab to /changes', () => {
        at('https://github.com/o/r/pull/5');
        goToChangedFiles();
        expect(window.location.href).toBe('/o/r/pull/5/changes');

        at('https://github.com/o/r/pull/5/commits');
        goToChangedFiles();
        expect(window.location.href).toBe('/o/r/pull/5/changes');
    });

    it('goToConversation goes from any sub-tab to the PR root', () => {
        at('https://github.com/o/r/pull/5/changes');
        goToConversation();
        expect(window.location.href).toBe('/o/r/pull/5');
    });

    it('neither navigates when already there or off a PR page', () => {
        at('https://github.com/o/r/pull/5/changes');
        goToChangedFiles();
        expect(window.location.href).toBe('https://github.com/o/r/pull/5/changes');

        at('https://github.com/o/r/pull/5');
        goToConversation();
        expect(window.location.href).toBe('https://github.com/o/r/pull/5');

        at('https://github.com/o/r/issues/5');
        goToChangedFiles();
        goToConversation();
        expect(window.location.href).toBe('https://github.com/o/r/issues/5');
    });
});
