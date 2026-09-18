import {defineConfig} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * One Playwright project per place plugins live. Specs under a plugin's own
 * e2e/ directory run from the plugin root's realpath (Playwright's testDir does
 * not follow symlinks) and import the shared harness via the @exo-e2e/* path
 * alias declared in that root's tsconfig.json.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local/share');

const roots: Array<[string, string]> = [
    ['df', path.join(here, 'plugins')],
    ['ldf', path.join(dataHome, 'chrome-exoskeleton/plugins')],
    ...(process.env.EXO_PLUGIN_DIRS ?? '')
        .split(':')
        .filter(Boolean)
        .map((dir, i) => [`extra${i}`, dir] as [string, string]),
];

const active = roots.filter(
    ([tier, dir]) =>
        fs.existsSync(dir) && !(tier === 'ldf' && process.env.EXO_IGNORE_DIR_LOCAL === 'true'),
);

export default defineConfig({
    timeout: 30_000,
    retries: 0,
    workers: 1, // extensions need a persistent context; no parallel isolation
    reporter: 'list',
    projects: [
        {name: 'framework', testDir: './e2e'},
        ...active.map(([tier, dir]) => ({
            name: `plugins-${tier}`,
            testDir: fs.realpathSync(dir),
            testMatch: '**/e2e/*.spec.ts',
            testIgnore: '**/node_modules/**',
        })),
    ],
});
