import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {collectBuildStamp, mountedPlugins, pluginTier, withoutGitEnv} from '@exo/lib/build-stamp';

let tmp: string;

beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exo-stamp-')));
});

afterEach(() => {
    fs.rmSync(tmp, {recursive: true, force: true});
});

describe('pluginTier', () => {
    const roots = {df: '/fw/plugins', ldf: '/home/me/.local/share/chrome-exoskeleton/plugins'};

    it('names the root a plugin directory is under', () => {
        expect(pluginTier('/fw/plugins/richlink', roots)).toBe('df');
        expect(pluginTier(`${roots.ldf}/private`, roots)).toBe('ldf');
        expect(pluginTier('/elsewhere/thing', roots)).toBe('extra');
    });

    it('does not take a sibling with the root as a prefix for the root', () => {
        expect(pluginTier('/fw/plugins-old/richlink', roots)).toBe('extra');
    });
});

describe('mountedPlugins', () => {
    it('lists each live mount with its tier, sorted, and skips files and dangling mounts', () => {
        const df = path.join(tmp, 'fw/plugins');
        const ldf = path.join(tmp, 'ldf/plugins');
        const farm = path.join(tmp, 'fw/src/plugins');
        for (const dir of [`${df}/zeta`, `${ldf}/alpha`, `${tmp}/extra/mid`, farm]) {
            fs.mkdirSync(dir, {recursive: true});
        }
        fs.symlinkSync(`${df}/zeta`, `${farm}/zeta`);
        fs.symlinkSync(`${ldf}/alpha`, `${farm}/alpha`);
        fs.symlinkSync(`${tmp}/extra/mid`, `${farm}/mid`);
        fs.symlinkSync(`${df}/gone`, `${farm}/gone`);
        fs.writeFileSync(`${farm}/index.tsx`, '');

        expect(mountedPlugins(farm, {df, ldf})).toEqual([
            {name: 'alpha', tier: 'ldf'},
            {name: 'mid', tier: 'extra'},
            {name: 'zeta', tier: 'df'},
        ]);
    });

    it('is empty without a farm', () => {
        expect(mountedPlugins(path.join(tmp, 'none'), {df: tmp, ldf: tmp})).toEqual([]);
    });
});

describe('withoutGitEnv', () => {
    it("drops git's variables and keeps the rest", () => {
        expect(
            withoutGitEnv({GIT_DIR: '/x/.git', GIT_INDEX_FILE: 'i', HOME: '/h', PATH: '/p'}),
        ).toEqual({
            HOME: '/h',
            PATH: '/p',
        });
    });
});

describe('collectBuildStamp', () => {
    const now = new Date('2026-11-13T12:00:00.000Z');
    const git = (dir: string, ...args: string[]) =>
        execFileSync('git', ['-C', dir, ...args], {
            encoding: 'utf8',
            env: withoutGitEnv(process.env),
        }).trim();
    // A repository at dir with one commit of a.txt; returns its sha.
    const repoWithCommit = (dir: string, content: string) => {
        fs.mkdirSync(dir, {recursive: true});
        git(dir, 'init', '-q');
        fs.writeFileSync(path.join(dir, 'a.txt'), content);
        git(dir, 'add', 'a.txt');
        const identity = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];
        git(dir, '-c', 'core.hooksPath=/dev/null', ...identity, 'commit', '-qm', content);
        return git(dir, 'rev-parse', 'HEAD');
    };

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('records HEAD and whether tracked files differ from it', () => {
        const fw = path.join(tmp, 'fw');
        const sha = repoWithCommit(fw, 'one');
        const roots = {df: path.join(fw, 'plugins'), ldf: path.join(tmp, 'ldf')};

        expect(collectBuildStamp(fw, roots, now)).toEqual({
            builtAt: '2026-11-13T12:00:00.000Z',
            sha,
            dirty: false,
            plugins: [],
        });
        fs.writeFileSync(path.join(fw, 'a.txt'), 'two');
        expect(collectBuildStamp(fw, roots, now).dirty).toBe(true);
    });

    it("reads the framework's repository, not a hook's GIT_DIR", () => {
        const fw = path.join(tmp, 'fw');
        const sha = repoWithCommit(fw, 'framework');
        const other = path.join(tmp, 'other');
        repoWithCommit(other, 'other');
        vi.stubEnv('GIT_DIR', path.join(other, '.git'));

        expect(collectBuildStamp(fw, {df: tmp, ldf: tmp}, now).sha).toBe(sha);
    });

    it('records a null sha outside a git checkout', () => {
        const stamp = collectBuildStamp(tmp, {df: tmp, ldf: tmp}, now);
        expect(stamp).toMatchObject({sha: null, dirty: false});
    });
});
