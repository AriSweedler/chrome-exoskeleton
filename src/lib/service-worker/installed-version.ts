import type {BuildStamp, PluginStamp} from '@exo/lib/build-stamp';

// Tell the machine which build Chrome is running. An extension cannot write
// files, so the worker sends the record to a native messaging host
// (native-host/installed-version-host.mjs), which overwrites
// ~/.local/state/chrome-exoskeleton/installed-version with it. The host is
// installed outside this repo: its manifest must name this host and allow
// this extension's origin. Without it the send fails and nothing else does.

export const NATIVE_HOST = 'com.sweedler.chrome_exoskeleton';

// What started this worker: Chrome's onStartup, or onInstalled's reason
// (install, update, chrome_update, shared_module_update).
export type RecordReason = 'startup' | `${chrome.runtime.OnInstalledReason}`;

export interface InstalledVersion {
    type: 'installed-version';
    reason: RecordReason;
    extensionId: string;
    version: string;
    sha: string | null;
    dirty: boolean | null;
    builtAt: string | null;
    plugins: PluginStamp[] | null;
    chromeVersion: string | null;
}

// The build's stamp, or null when dist/ has none (a build older than the
// stamp's sha and plugins fields reports those as null).
async function readStamp(): Promise<Partial<BuildStamp> | null> {
    try {
        const response = await fetch(chrome.runtime.getURL('build-stamp.json'), {
            cache: 'no-store',
        });
        if (!response.ok) return null;
        const data: unknown = await response.json();
        return typeof data === 'object' && data !== null ? (data as Partial<BuildStamp>) : null;
    } catch {
        return null;
    }
}

interface UADataBrand {
    brand: string;
    version: string;
}

interface UAData {
    getHighEntropyValues(hints: string[]): Promise<{fullVersionList?: UADataBrand[]}>;
}

// Chrome's full version (e.g. 142.0.7444.59), from the client hints. The user
// agent string is no help: Chrome reduces it to <major>.0.0.0.
export async function chromeVersion(): Promise<string | null> {
    const uaData = (navigator as {userAgentData?: UAData}).userAgentData;
    if (!uaData) return null;
    try {
        const {fullVersionList = []} = await uaData.getHighEntropyValues(['fullVersionList']);
        const named = (brand: string) => fullVersionList.find((entry) => entry.brand === brand);
        return (named('Google Chrome') ?? named('Chromium'))?.version ?? null;
    } catch {
        return null;
    }
}

export async function installedVersion(reason: RecordReason): Promise<InstalledVersion> {
    const [stamp, runningChrome] = await Promise.all([readStamp(), chromeVersion()]);
    return {
        type: 'installed-version',
        reason,
        extensionId: chrome.runtime.id,
        version: chrome.runtime.getManifest().version,
        sha: typeof stamp?.sha === 'string' ? stamp.sha : null,
        dirty: typeof stamp?.dirty === 'boolean' ? stamp.dirty : null,
        builtAt: typeof stamp?.builtAt === 'string' ? stamp.builtAt : null,
        plugins: Array.isArray(stamp?.plugins) ? stamp.plugins : null,
        chromeVersion: runningChrome,
    };
}

// Send the record to the host. True when the host wrote it. Never throws:
// a machine without the host still runs the extension.
export async function recordInstalledVersion(reason: RecordReason): Promise<boolean> {
    const record = await installedVersion(reason);
    try {
        const reply: unknown = await chrome.runtime.sendNativeMessage(NATIVE_HOST, record);
        const ok = typeof reply === 'object' && reply !== null && (reply as {ok?: unknown}).ok;
        if (ok !== true) {
            console.warn('chrome exoskeleton: the native host did not record the version', reply);
            return false;
        }
        return true;
    } catch (error) {
        console.warn(
            `chrome exoskeleton: no native host ${NATIVE_HOST} to record the version`,
            error,
        );
        return false;
    }
}
