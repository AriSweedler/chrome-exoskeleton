/**
 * Loader factory for a plugin's saved real-DOM snapshots.
 *
 * Snapshots live in <plugin>/examples/*.html — gitignored, so each
 * machine saves its own (open the real page, copy its DOM, then
 * `pbpaste > <plugin>/examples/<name>.html`). Used by a plugin's
 * examples.test.ts (real-DOM tests that skip loudly when snapshots are
 * absent) and inspection CLIs. Test/CLI tooling only — never bundled.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ExampleDomLoader {
    /** Resolve a bare filename against examples/; paths pass through. */
    resolveExamplePath(input: string): string;
    /** Bare filenames of every saved snapshot on this machine. */
    listExamples(): string[];
    /** Read a snapshot, or null when it isn't saved locally. */
    loadExampleHtml(name: string): string | null;
    /** One-line instruction for saving a missing snapshot. */
    missingExampleHint(name: string): string;
}

export function createExampleDomLoader(options: {
    /** Absolute path of the plugin's examples/ directory. */
    examplesDir: string;
    /** The same directory, repo-relative — used in save instructions. */
    repoRelativeDir: string;
    /** What to open before copying the DOM (e.g. "the matching deploy view"). */
    sourceDescription: string;
}): ExampleDomLoader {
    const {examplesDir, repoRelativeDir, sourceDescription} = options;

    function resolveExamplePath(input: string): string {
        if (!input.includes('/') && !input.includes('\\')) {
            return path.join(examplesDir, input);
        }
        return path.resolve(input);
    }

    return {
        resolveExamplePath,

        listExamples(): string[] {
            if (!fs.existsSync(examplesDir)) return [];
            return fs.readdirSync(examplesDir).filter((f) => f.endsWith('.html'));
        },

        loadExampleHtml(name: string): string | null {
            const p = resolveExamplePath(name);
            return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
        },

        missingExampleHint(name: string): string {
            return (
                `Missing DOM snapshot: ${resolveExamplePath(name)} — ` +
                `open ${sourceDescription}, copy its DOM (devtools: copy outerHTML), ` +
                `and save it there (e.g. pbpaste > ${path.join(repoRelativeDir, name)})`
            );
        },
    };
}
