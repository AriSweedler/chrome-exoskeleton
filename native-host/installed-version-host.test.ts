import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Buffer} from 'node:buffer';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

// The host as Chrome runs it: a child process, one framed message on stdin,
// stdin left open, one framed reply on stdout.

const HOST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'installed-version-host.mjs');
const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/';

function frame(body: Buffer): Buffer {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    return Buffer.concat([header, body]);
}

interface Run {
    code: number | null;
    reply: {ok: boolean; path?: string; error?: string};
}

function runHost(home: string, input: Buffer, env: Record<string, string> = {}): Promise<Run> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [HOST, ORIGIN], {
            env: {PATH: process.env.PATH ?? '', HOME: home, ...env},
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const out: Buffer[] = [];
        child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
        child.on('error', reject);
        child.on('close', (code) => {
            const raw = Buffer.concat(out);
            const length = raw.readUInt32LE(0);
            expect(raw.length).toBe(4 + length);
            resolve({code, reply: JSON.parse(raw.subarray(4).toString('utf8'))});
            child.stdin.destroy();
        });
        // Chrome does not close stdin after the message: the host must not wait for EOF.
        child.stdin.write(input);
    });
}

const record = (sha: string) => ({
    type: 'installed-version',
    reason: 'startup',
    extensionId: 'abcdefghijklmnopabcdefghijklmnop',
    version: '0.4.0',
    sha,
    dirty: false,
    builtAt: '2026-11-13T00:00:00.000Z',
    plugins: [{name: 'richlink', tier: 'df'}],
    chromeVersion: '142.0.7444.59',
});

const json = (value: unknown) => frame(Buffer.from(JSON.stringify(value), 'utf8'));

describe('installed-version-host', () => {
    let home: string;
    let target: string;

    beforeEach(() => {
        home = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-host-'));
        target = path.join(home, '.local/state/chrome-exoskeleton/installed-version');
    });

    afterEach(() => {
        fs.rmSync(home, {recursive: true, force: true});
    });

    it('writes the record with the caller origin and replies ok', async () => {
        const {code, reply} = await runHost(home, json(record('a'.repeat(40))));
        expect(code).toBe(0);
        expect(reply).toEqual({ok: true, path: target});
        const written = JSON.parse(fs.readFileSync(target, 'utf8'));
        expect(written).toMatchObject({...record('a'.repeat(40)), origin: ORIGIN});
        expect(Number.isNaN(Date.parse(written.recordedAt))).toBe(false);
    });

    it('replaces the file on every run, leaving no temp file', async () => {
        await runHost(home, json(record('a'.repeat(40))));
        const first = fs.statSync(target).size;
        await runHost(home, json(record('b'.repeat(40))));
        expect(JSON.parse(fs.readFileSync(target, 'utf8')).sha).toBe('b'.repeat(40));
        expect(fs.statSync(target).size).toBe(first);
        expect(fs.readdirSync(path.dirname(target))).toEqual(['installed-version']);
    });

    it('honours XDG_STATE_HOME', async () => {
        const stateHome = path.join(home, 'state');
        const {reply} = await runHost(home, json(record('c'.repeat(40))), {
            XDG_STATE_HOME: stateHome,
        });
        expect(reply.path).toBe(path.join(stateHome, 'chrome-exoskeleton/installed-version'));
        expect(fs.existsSync(reply.path as string)).toBe(true);
    });

    it.each([
        ['invalid JSON', frame(Buffer.from('{not json', 'utf8'))],
        ['a JSON array', json([1, 2])],
        ['another message type', json({type: 'hello'})],
    ])('refuses %s and keeps the old record', async (_label, body) => {
        await runHost(home, json(record('a'.repeat(40))));
        const before = fs.readFileSync(target, 'utf8');
        const {code, reply} = await runHost(home, body);
        expect(code).toBe(1);
        expect(reply.ok).toBe(false);
        expect(fs.readFileSync(target, 'utf8')).toBe(before);
    });

    it('refuses a message over the size cap without waiting for its body', async () => {
        const header = Buffer.alloc(4);
        header.writeUInt32LE(1024 * 1024, 0);
        const {code, reply} = await runHost(home, header);
        expect(code).toBe(1);
        expect(reply).toEqual({ok: false, error: 'message too large: 1048576 bytes'});
        expect(fs.existsSync(target)).toBe(false);
    });
});
