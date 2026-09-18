import {describe, it, expect} from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';

/**
 * The plugin contract, checked against every mounted plugin:
 *   - the directory name is a lowercase slug;
 *   - it has a page module (page.ts / page.tsx) and/or a popup tab (tab.tsx);
 *   - it has at least one test file;
 *   - a tab.tsx registers a TabRegistry entry whose id is the directory name.
 * The import fence (only @exo/lib, @exo/theme and the plugin itself) is
 * eslint's job; see eslint.config.js.
 */

const FARM = path.dirname(fileURLToPath(import.meta.url));
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function mountedPlugins(): string[] {
    return fs
        .readdirSync(FARM, {withFileTypes: true})
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => entry.name)
        .filter((name) => fs.statSync(path.join(FARM, name)).isDirectory())
        .sort();
}

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else out.push(full);
    }
    return out;
}

describe('plugin contract', () => {
    it('every mounted plugin has an entry point, a test, a slug name and a matching tab id', () => {
        const problems: string[] = [];
        for (const name of mountedPlugins()) {
            const dir = path.join(FARM, name);
            if (!NAME_PATTERN.test(name)) {
                problems.push(`${name}: directory name must match ${NAME_PATTERN}`);
            }
            const hasPage =
                fs.existsSync(path.join(dir, 'page.ts')) ||
                fs.existsSync(path.join(dir, 'page.tsx'));
            const hasTab = fs.existsSync(path.join(dir, 'tab.tsx'));
            if (!hasPage && !hasTab) {
                problems.push(`${name}: needs page.ts (or page.tsx) and/or tab.tsx`);
            }
            if (!walk(dir).some((file) => /\.test\.tsx?$/.test(file))) {
                problems.push(`${name}: needs at least one *.test.ts(x) file`);
            }
            if (hasTab) {
                const source = fs.readFileSync(path.join(dir, 'tab.tsx'), 'utf-8');
                if (!source.includes('TabRegistry.register(')) {
                    problems.push(`${name}: tab.tsx must call TabRegistry.register(...)`);
                }
                if (!new RegExp(`id:\\s*['"]${name}['"]`).test(source)) {
                    problems.push(`${name}: tab.tsx must register id '${name}'`);
                }
            }
        }
        expect(problems).toEqual([]);
    });
});
