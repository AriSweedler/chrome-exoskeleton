import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// What every build writes to <outDir>/build-stamp.json. The service worker
// polls builtAt to reload itself (auto-reload.ts) and reports the rest as
// the installed version (installed-version.ts). Build-side only: it runs in
// vite.config.ts under node, and the extension imports its types alone.

export type PluginTier = 'df' | 'ldf' | 'extra';

export interface PluginStamp {
    name: string;
    tier: PluginTier;
}

export interface BuildStamp {
    builtAt: string;
    // null when the framework is not a git checkout (a source tarball).
    sha: string | null;
    // True when tracked files differed from sha at build time.
    dirty: boolean;
    plugins: PluginStamp[];
}

export interface PluginRoots {
    df: string;
    ldf: string;
}

// The tier a mounted plugin's real directory belongs to, by the root it is under.
export function pluginTier(realDir: string, roots: PluginRoots): PluginTier {
    const under = (root: string) => realDir.startsWith(path.resolve(root) + path.sep);
    if (under(roots.df)) return 'df';
    if (under(roots.ldf)) return 'ldf';
    return 'extra';
}

// The plugins mounted in the farm (src/plugins), sorted by name. A mount is a
// symlink; the farm's own files and a dangling mount are skipped, since
// neither reaches the bundle.
export function mountedPlugins(farm: string, roots: PluginRoots): PluginStamp[] {
    if (!fs.existsSync(farm)) return [];
    const resolved = {df: realpathOr(roots.df), ldf: realpathOr(roots.ldf)};
    return fs
        .readdirSync(farm, {withFileTypes: true})
        .filter((entry) => entry.isSymbolicLink())
        .flatMap((entry) => {
            const real = realpathOr(path.join(farm, entry.name));
            if (!fs.existsSync(real)) return [];
            return [{name: entry.name, tier: pluginTier(real, resolved)}];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

function realpathOr(p: string): string {
    try {
        return fs.realpathSync(p);
    } catch {
        return path.resolve(p);
    }
}

type Env = Record<string, string | undefined>;

// The environment minus git's own variables. A build or test run from a git
// hook inherits GIT_DIR and GIT_INDEX_FILE, which would point git -C at the
// hook's repository instead of fw.
export function withoutGitEnv(env: Env): Env {
    return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));
}

function git(fw: string, ...args: string[]): string | null {
    try {
        return execFileSync('git', ['-C', fw, ...args], {
            encoding: 'utf8',
            env: withoutGitEnv(process.env),
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return null;
    }
}

// The stamp for a build of the framework at fw, at time now.
export function collectBuildStamp(fw: string, roots: PluginRoots, now: Date): BuildStamp {
    const sha = git(fw, 'rev-parse', 'HEAD');
    const status = sha === null ? null : git(fw, 'status', '--porcelain', '--untracked-files=no');
    return {
        builtAt: now.toISOString(),
        sha,
        dirty: status !== null && status !== '',
        plugins: mountedPlugins(path.join(fw, 'src/plugins'), roots),
    };
}
