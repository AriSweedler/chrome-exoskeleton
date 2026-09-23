import {safeUrl} from '@exo/lib/url';

/** The parts of a github.com pull request URL this plugin routes on. */
export interface GitHubPR {
    owner: string;
    repo: string;
    prNumber: string;
    /** The sub-tab after the number ('changes', 'commits', ...); undefined on the Conversation tab. */
    tab: string | undefined;
}

/** github.com or www.github.com. */
export function isGitHubHost(url: string): boolean {
    const hostname = safeUrl(url)?.hostname.toLowerCase();
    return hostname === 'github.com' || hostname === 'www.github.com';
}

/**
 * Parse `https://github.com/<owner>/<repo>/pull/<number>[/<tab>]` (query and
 * fragment ignored). Null for anything else, including non-GitHub hosts.
 */
export function parseGitHubPRUrl(url: string): GitHubPR | null {
    const parsed = safeUrl(url);
    if (!parsed || !isGitHubHost(url)) return null;

    const parts = parsed.pathname.split('/').filter((part) => part !== '');
    if (parts.length < 4 || parts[2] !== 'pull' || !/^\d+$/.test(parts[3])) return null;

    return {owner: parts[0], repo: parts[1], prNumber: parts[3], tab: parts[4]};
}

/** Any tab of a pull request, the Conversation root included. */
export function isGitHubPRPage(url: string): boolean {
    return parseGitHubPRUrl(url) !== null;
}

/** The "Files changed" tab of a pull request. */
export function isGitHubPRChangesPage(url: string): boolean {
    return parseGitHubPRUrl(url)?.tab === 'changes';
}

/**
 * Navigate to a tab of the current pull request. The Conversation tab is the
 * PR root, so pass '' for it. No-op off PR pages or when already there.
 */
function navigateToPRTab(targetTab: '' | 'changes'): void {
    const pr = parseGitHubPRUrl(window.location.href);
    if (!pr || (pr.tab ?? '') === targetTab) return;
    const base = `/${pr.owner}/${pr.repo}/pull/${pr.prNumber}`;
    window.location.href = targetTab ? `${base}/${targetTab}` : base;
}

export function goToConversation(): void {
    navigateToPRTab('');
}

export function goToChangedFiles(): void {
    navigateToPRTab('changes');
}
