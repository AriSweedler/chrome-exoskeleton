import {describe, it, expect, beforeEach} from 'vitest';
import {GitHubPrNumberHandler} from '@exo/plugins/richlink/handlers/github-pr-number.handler';

describe('GitHubPrNumberHandler', () => {
    let handler: GitHubPrNumberHandler;

    beforeEach(() => {
        handler = new GitHubPrNumberHandler();
    });

    it('inherits canHandle from GitHubHandler', () => {
        expect(handler.canHandle(new URL('https://github.com/user/repo/pull/42'))).toBe(true);
        expect(handler.canHandle(new URL('https://github.com/user/repo'))).toBe(false);
    });

    it('returns format with label "GitHub PR #" and priority 300', () => {
        const format = handler.getFormats({url: 'https://github.com/user/repo/pull/42'})[0];
        expect(format.label).toBe('GitHub PR #');
        expect(format.priority).toBe(300);
    });

    it('returns #number as text', () => {
        const format = handler.getFormats({url: 'https://github.com/user/repo/pull/42'})[0];
        expect(format.text).toBe('#42');
    });

    it('wraps #number in an anchor tag for html', () => {
        const format = handler.getFormats({url: 'https://github.com/user/repo/pull/42'})[0];
        expect(format.html).toBe('<a href="https://github.com/user/repo/pull/42">#42</a>');
    });

    it('strips subpages from the link URL', () => {
        const format = handler.getFormats({
            url: 'https://github.com/user/repo/pull/99/files',
        })[0];
        expect(format.html).toBe('<a href="https://github.com/user/repo/pull/99">#99</a>');
    });

    it('extracts the PR number from comment permalink URLs with a fragment', () => {
        const format = handler.getFormats({
            url: 'https://github.com/user/repo/pull/42#issuecomment-999',
        })[0];
        expect(format.text).toBe('#42');
        expect(format.html).toBe('<a href="https://github.com/user/repo/pull/42">#42</a>');
    });
});
