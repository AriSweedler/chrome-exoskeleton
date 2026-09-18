/**
 * Snapshot resolution for the richlink CLIs: a bare filename resolves against
 * every mounted plugin's examples/ directories (a plugin may keep more than
 * one, e.g. handlers/<site>/examples/). Paths pass through.
 */

import * as fs from 'fs';
import * as path from 'path';
import {fileURLToPath} from 'url';

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const FARM = path.join(FRAMEWORK_ROOT, 'src/plugins');

/** An absolute path to a saved snapshot. */
export type ExampleHtmlFilePath = string & {readonly __brand: 'ExampleHtmlFilePath'};

function examplesDirsUnder(dir: string, depth: number, out: string[]): void {
    if (depth < 0 || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (!fs.statSync(full).isDirectory()) continue;
        if (entry.name === 'examples') out.push(full);
        else examplesDirsUnder(full, depth - 1, out);
    }
}

/** Every examples/ directory of every mounted plugin, shallowest first. */
export function exampleDirs(): string[] {
    const out: string[] = [];
    examplesDirsUnder(FARM, 3, out);
    return out;
}

export const ExampleHtmlFile = {
    /** Resolve a bare filename (searched in every examples/ dir) or a path. */
    resolve(input: string): ExampleHtmlFilePath {
        if (!input.includes('/') && !input.includes('\\')) {
            for (const dir of exampleDirs()) {
                const candidate = path.join(dir, input);
                if (fs.existsSync(candidate)) return candidate as ExampleHtmlFilePath;
            }
        }
        return path.resolve(input) as ExampleHtmlFilePath;
    },

    /** Every saved snapshot on this machine, as "<plugin>: <file>" lines. */
    list(): string[] {
        return exampleDirs().flatMap((dir) =>
            fs
                .readdirSync(dir)
                .filter((f) => f.endsWith('.html'))
                .map((f) => `${path.relative(FARM, dir)}: ${f}`),
        );
    },

    exists(filePath: ExampleHtmlFilePath): boolean {
        return fs.existsSync(filePath);
    },

    read(filePath: ExampleHtmlFilePath): string {
        return fs.readFileSync(filePath, 'utf-8');
    },
};
