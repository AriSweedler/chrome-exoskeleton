import fs from 'node:fs';
import path from 'node:path';
import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {crx} from '@crxjs/vite-plugin';
import manifest from './manifest.json';

/**
 * Write <outDir>/build-stamp.json after every build (watch rebuilds included).
 * A loaded unpacked extension reads its own files from disk, so the service
 * worker can poll this stamp and reload itself when a new build lands — see
 * src/lib/service-worker/auto-reload.ts.
 *
 * Under `vite build --watch` (exo dev) the output directory is never emptied:
 * Chrome may be reading it for the previous build's reload when the next
 * save starts, and a directory without a manifest at that moment parks the
 * extension as disabled. Instead, hashed assets no build refers to any more
 * are pruned once the new bundle is on disk — the stamp goes last.
 */
function buildStamp(): Plugin {
    let outDir = 'dist';
    let emitted = new Set<string>();
    return {
        name: 'exo-build-stamp',
        apply: 'build',
        config(userConfig) {
            if (userConfig.build?.watch) return {build: {emptyOutDir: false}};
        },
        configResolved(config) {
            outDir = config.build.outDir;
        },
        writeBundle(_options, bundle) {
            emitted = new Set(Object.keys(bundle));
        },
        closeBundle() {
            const assets = path.join(outDir, 'assets');
            if (fs.existsSync(assets)) {
                for (const file of fs.readdirSync(assets)) {
                    if (!emitted.has(`assets/${file}`)) fs.rmSync(path.join(assets, file));
                }
            }
            const stamp = {builtAt: new Date().toISOString()};
            fs.writeFileSync(path.join(outDir, 'build-stamp.json'), JSON.stringify(stamp));
        },
    };
}

// Plugins are mounted into src/plugins/<name> as symlinks by `bin/exo link`.
// preserveSymlinks keeps every plugin file at that one path, so the @exo alias,
// import.meta.glob discovery and HMR all see the symlink path, never the realpath.
export default defineConfig({
    plugins: [react(), crx({manifest}), buildStamp()],
    resolve: {
        alias: {
            '@exo': '/src',
        },
        preserveSymlinks: true,
    },
    build: {
        // `exo build --personal` builds without the local-tier plugins into dist-personal/.
        outDir: process.env.EXO_DIST ?? 'dist',
    },
});
