import {defineConfig} from 'vite';

/** Minimal Vite config for CLI scripts (vite-node). Omits the crxjs plugin. */
export default defineConfig({
    resolve: {
        alias: {
            '@exo': '/src',
        },
        preserveSymlinks: true,
    },
});
