import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.tsx'],
        // Plugin sources are reached ONLY through the src/plugins link farm;
        // plugins/ (this repo's own plugins) is excluded so nothing runs twice.
        // e2e specs are Playwright's, wherever they live.
        exclude: [
            'node_modules/**',
            'dist*/**',
            'e2e/**',
            '**/e2e/**',
            'plugins/**',
            'templates/**',
            '.worktrees/**',
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                '**/*.test.{ts,tsx}',
                '**/*.d.ts',
                'src/test/**',
                // Snapshot loaders and CLI harnesses are exercised by hand, not by the unit suite
                '**/example-dom.ts',
                '**/cli/**',
            ],
        },
    },
    resolve: {
        alias: {
            '@exo': '/src',
        },
        preserveSymlinks: true,
    },
});
