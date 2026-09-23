import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {
    diffBody,
    fileByAnchor,
    fileContaining,
    foldButton,
    getFiles,
    headerStickyOffset,
    isAutoHidden,
    isCollapsed,
    isInsideFile,
    isViewed,
    setCollapsed,
    setViewed,
    viewedButton,
} from '@exo/plugins/github-autoscroll/files';
import {
    anchorFor,
    installGitHubBehavior,
    renderFilesList,
    type FixtureFile,
} from '@exo/plugins/github-autoscroll/test-dom';

function install(files: FixtureFile[]): void {
    document.body.innerHTML = renderFilesList(files);
}

describe('getFiles', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('models every region in document order with a clean path and its anchor', () => {
        install([{path: 'src/a.ts'}, {path: 'docs/README.md', viewed: true}, {path: 'z/last.go'}]);
        const files = getFiles();
        expect(files.map((f) => f.path)).toEqual(['src/a.ts', 'docs/README.md', 'z/last.go']);
        expect(files.map((f) => f.anchor)).toEqual([
            anchorFor('src/a.ts'),
            anchorFor('docs/README.md'),
            anchorFor('z/last.go'),
        ]);
        for (const file of files) {
            expect(file.path).not.toContain('‎');
            expect(file.region.id).toBe(file.anchor);
            expect(file.region.contains(file.header)).toBe(true);
        }
    });

    it('falls back to the expand-all control for the path when the heading link is missing', () => {
        install([{path: 'src/a.ts'}]);
        document.querySelector('h3 a')?.remove();
        expect(getFiles().map((f) => f.path)).toEqual(['src/a.ts']);
    });

    it('ignores regions without a file header (other regions on the page) and pages without files', () => {
        document.body.innerHTML = '<div role="region" id="diff-not-a-file">side panel</div>';
        expect(getFiles()).toEqual([]);
        document.body.innerHTML = '<main>nothing here</main>';
        expect(getFiles()).toEqual([]);
    });

    it('fileByAnchor and fileContaining resolve to the same model', () => {
        install([{path: 'src/a.ts'}, {path: 'src/b.ts'}]);
        const b = fileByAnchor(anchorFor('src/b.ts'));
        expect(b?.path).toBe('src/b.ts');
        expect(fileByAnchor('diff-nope')).toBeNull();
        expect(fileByAnchor(anchorFor('src/a.ts'))?.path).toBe('src/a.ts');

        const button = viewedButton(b!)!;
        expect(fileContaining(button.firstChild)?.anchor).toBe(b?.anchor);
        expect(fileContaining(document.body)).toBeNull();
        expect(fileContaining(null)).toBeNull();
        expect(isInsideFile(button)).toBe(true);
        expect(isInsideFile(document.body)).toBe(false);
    });
});

describe('viewed and folded state', () => {
    let uninstall: () => void;

    beforeEach(() => {
        install([
            {path: 'open/unviewed.ts'},
            {path: 'closed/viewed.ts', viewed: true},
            {path: 'closed/unviewed.ts', collapsed: true},
        ]);
        uninstall = installGitHubBehavior(document);
    });

    afterEach(() => {
        uninstall();
        document.body.innerHTML = '';
    });

    it('reads viewed from aria-pressed and folded from the header, independently', () => {
        const [open, viewedClosed, closed] = getFiles();
        expect(isViewed(open)).toBe(false);
        expect(isCollapsed(open)).toBe(false);
        expect(isViewed(viewedClosed)).toBe(true);
        expect(isCollapsed(viewedClosed)).toBe(true);
        expect(isViewed(closed)).toBe(false);
        expect(isCollapsed(closed)).toBe(true);
    });

    it('also recognises viewed by the button class alone', () => {
        const [open] = getFiles();
        const button = viewedButton(open)!;
        button.removeAttribute('aria-pressed');
        button.classList.add('MarkAsViewedButton-module__viewed__k8dzo');
        expect(isViewed(open)).toBe(true);
    });

    it('also recognises collapsed by the chevron alone', () => {
        const [open] = getFiles();
        open.header.querySelector('svg')!.className.baseVal = 'octicon octicon-chevron-right';
        expect(isCollapsed(open)).toBe(true);
    });

    it('setViewed clicks only when the state differs, and GitHub applies it', async () => {
        const [open] = getFiles();
        expect(setViewed(open, false)).toBe(false);
        expect(setViewed(open, true)).toBe(true);
        expect(isViewed(open)).toBe(false); // GitHub has not committed yet
        await new Promise((r) => setTimeout(r, 40));
        expect(isViewed(open)).toBe(true);
    });

    it('setCollapsed clicks the chevron; GitHub drops and restores the body', () => {
        const [open] = getFiles();
        expect(diffBody(open)).not.toBeNull();
        expect(setCollapsed(open, false)).toBe(false);
        expect(setCollapsed(open, true)).toBe(true);
        expect(isCollapsed(open)).toBe(true);
        expect(diffBody(open)).toBeNull();
        expect(setCollapsed(open, false)).toBe(true);
        expect(isCollapsed(open)).toBe(false);
        expect(diffBody(open)).not.toBeNull();
    });

    it('reports a missing fold control instead of clicking something else', () => {
        const [open] = getFiles();
        foldButton(open)!.remove();
        expect(foldButton(open)).toBeNull();
        expect(setCollapsed(open, true)).toBe(false);
    });
});

describe('isAutoHidden', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('is true for generated and deleted placeholders, false for diffs, large diffs and collapsed files', () => {
        install([
            {path: 'a.ts', body: 'diff'},
            {path: 'gen.json', body: 'generated'},
            {path: 'gone.yaml', body: 'deleted'},
            {path: 'big.lock', body: 'large'},
            {path: 'was-gen.json', body: 'generated', collapsed: true},
        ]);
        expect(getFiles().map(isAutoHidden)).toEqual([false, true, true, false, false]);
    });
});

describe('headerStickyOffset', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it("reads GitHub's --header-sticky-offset, defaulting to 0", () => {
        install([{path: 'a.ts'}]);
        const [file] = getFiles();
        expect(headerStickyOffset(file)).toBe(0);
        const wrapper = file.region.querySelector<HTMLElement>('[data-diff-header-wrapper]')!;
        wrapper.style.setProperty('--header-sticky-offset', '48px');
        expect(headerStickyOffset(file)).toBe(48);
        wrapper.remove();
        expect(headerStickyOffset(file)).toBe(0);
    });
});
