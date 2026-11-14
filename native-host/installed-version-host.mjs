// installed-version-host — the native messaging host the extension's service
// worker sends its installed version to (installed-version.ts). Chrome starts
// it once per message with the caller's origin as its argument and speaks
// the native messaging protocol on stdio: a 4-byte little-endian length, then
// that many bytes of UTF-8 JSON, each way.
//
// The message replaces ${XDG_STATE_HOME:-~/.local/state}/chrome-exoskeleton/installed-version
// whole: written to a temp file beside it, then renamed over it, so a reader
// sees the old record or the new one and the file never grows.
//
// Exit 0 after replying {ok: true, path}; exit 1 after replying {ok: false, error}.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {Buffer} from 'node:buffer';

// The record is a few hundred bytes. Anything far larger is not ours.
const MAX_MESSAGE_BYTES = 64 * 1024;

function statePath(env = process.env) {
    const stateHome = env.XDG_STATE_HOME || path.join(env.HOME || os.homedir(), '.local/state');
    return path.join(stateHome, 'chrome-exoskeleton', 'installed-version');
}

function frame(value) {
    const body = Buffer.from(JSON.stringify(value), 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    return Buffer.concat([header, body]);
}

// One framed message from stdin. Chrome keeps stdin open until the host
// exits, so the read stops at the declared length, never at EOF, and then
// destroys stdin: a paused open pipe would keep the process alive.
function readMessage(stdin) {
    return new Promise((resolve, reject) => {
        let buffered = Buffer.alloc(0);
        const onData = (chunk) => {
            buffered = Buffer.concat([buffered, chunk]);
            if (buffered.length < 4) return;
            const length = buffered.readUInt32LE(0);
            if (length > MAX_MESSAGE_BYTES)
                return finish(new Error(`message too large: ${length} bytes`));
            if (buffered.length < 4 + length) return;
            finish(null, buffered.subarray(4, 4 + length).toString('utf8'));
        };
        const onEnd = () => finish(new Error('stdin closed before a whole message arrived'));
        const finish = (error, text) => {
            stdin.off('data', onData);
            stdin.off('end', onEnd);
            stdin.destroy();
            if (error) reject(error);
            else resolve(text);
        };
        stdin.on('data', onData);
        stdin.on('end', onEnd);
    });
}

function writeRecord(record, target) {
    fs.mkdirSync(path.dirname(target), {recursive: true});
    const temp = `${target}.tmp-${process.pid}`;
    try {
        fs.writeFileSync(temp, `${JSON.stringify(record, null, 2)}\n`);
        fs.renameSync(temp, target);
    } catch (error) {
        fs.rmSync(temp, {force: true});
        throw error;
    }
}

async function main() {
    const origin = process.argv[2] ?? null;
    const target = statePath();
    try {
        const message = JSON.parse(await readMessage(process.stdin));
        if (typeof message !== 'object' || message === null || Array.isArray(message)) {
            throw new Error('the message is not a JSON object');
        }
        if (message.type !== 'installed-version') {
            throw new Error(`unknown message type: ${JSON.stringify(message.type)}`);
        }
        writeRecord({...message, origin, recordedAt: new Date().toISOString()}, target);
        process.stdout.write(frame({ok: true, path: target}));
    } catch (error) {
        process.stderr.write(`installed-version-host: ${error.message}\n`);
        process.stdout.write(frame({ok: false, error: error.message}));
        process.exitCode = 1;
    }
}

await main();
