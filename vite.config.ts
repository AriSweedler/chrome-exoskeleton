import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {crx} from '@crxjs/vite-plugin';
import manifest from './manifest.json';

// Plugins are mounted into src/plugins/<name> as symlinks by `bin/exo link`.
// preserveSymlinks keeps every plugin file at that one path, so the @exo alias,
// import.meta.glob discovery and HMR all see the symlink path, never the realpath.
export default defineConfig({
    plugins: [react(), crx({manifest})],
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
