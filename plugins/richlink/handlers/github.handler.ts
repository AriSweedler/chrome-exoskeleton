import {Handler, type FormatContext} from '@exo/lib/richlink/base';
import {queryFirstText} from '@exo/lib/dom';

export class GitHubHandler extends Handler {
    readonly label: string = 'GitHub PR';
    readonly priority: number = 10;

    // Path segment index for the PR number in /org/repo/pull/{number}
    protected static readonly PR_NUMBER_INDEX = 4;

    /** Extract the PR number from a GitHub PR URL, or undefined if not found. */
    protected parsePrNumber(url: string): string | undefined {
        const raw = new URL(url).pathname.split('/')[GitHubHandler.PR_NUMBER_INDEX];
        return raw && /^\d+$/.test(raw) ? raw : undefined;
    }

    canHandle(url: URL): boolean {
        if (url.hostname !== 'github.com') return false;

        // Expected: /org/repo/pull/number[/subpath]
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length < 4) return false;

        return parts[2] === 'pull' && !!this.parsePrNumber(url.href);
    }

    /** Strip sub-pages (/files, /changes, /commits, /checks, etc.), query, and fragment from GitHub PR URLs. */
    protected override getUrl({url}: FormatContext): string {
        const canonical = new URL(url);
        // Keep: /org/repo/pull/number (path segments 0–4)
        canonical.pathname = canonical.pathname.split('/').slice(0, 5).join('/');
        canonical.search = '';
        canonical.hash = '';
        return canonical.toString();
    }

    extractLinkText({url}: FormatContext): string {
        // Extract PR title from page - try multiple selectors for different GitHub layouts
        const title = queryFirstText(['.markdown-title', '.gh-header-title', '.js-issue-title']);
        if (!title) {
            return 'GitHub PR';
        }

        const prNumber = this.parsePrNumber(url);
        return prNumber ? `${title} (#${prNumber})` : title;
    }
}
