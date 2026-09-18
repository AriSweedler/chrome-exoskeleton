import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

// Plugins are mounted at src/plugins/<name> by `bin/exo link`. Each mounted
// plugin gets its own import fence (see the end of this file): it may import
// the framework's lib and theme, and itself, and nothing else. `eslint .`
// does not descend into symlinked directories, so `exo check` passes the
// mounted plugins explicitly: `eslint . src/plugins/*/`.
const here = path.dirname(fileURLToPath(import.meta.url));
const farm = path.join(here, 'src/plugins');
const pluginNames = fs.existsSync(farm)
    ? fs
          .readdirSync(farm, {withFileTypes: true})
          .filter((entry) => entry.isSymbolicLink() || entry.isDirectory())
          .map((entry) => entry.name)
    : [];

export default [
    js.configs.recommended,
    {
        // plugins/ (this repo's own plugin sources) is linted through its
        // src/plugins mount only, so nothing is linted twice.
        ignores: [
            'dist*/**',
            'node_modules/**',
            '*.config.js',
            '*.config.ts',
            '.worktrees/**',
            'e2e/**',
            '**/e2e/**',
            'plugins/**',
            'templates/**',
        ],
    },
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
                ecmaFeatures: {jsx: true},
            },
            globals: {
                chrome: 'readonly',
                browser: 'readonly',
                document: 'readonly',
                window: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                navigator: 'readonly',
                fetch: 'readonly',
                Blob: 'readonly',
                ClipboardItem: 'readonly',
                HTMLElement: 'readonly',
                HTMLAnchorElement: 'readonly',
                HTMLButtonElement: 'readonly',
                HTMLInputElement: 'readonly',
                Element: 'readonly',
                Document: 'readonly',
                KeyboardEventInit: 'readonly',
                MouseEvent: 'readonly',
                AnimationEvent: 'readonly',
                Event: 'readonly',
                EventListener: 'readonly',
                KeyboardEvent: 'readonly',
                MutationObserver: 'readonly',
                ScrollBehavior: 'readonly',
                global: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                ClipboardEvent: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                btoa: 'readonly',
                atob: 'readonly',
                process: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': typescript,
            react: react,
            'react-hooks': reactHooks,
        },
        rules: {
            ...typescript.configs.recommended.rules,
            ...react.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
            ],
            'react/react-in-jsx-scope': 'off',
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['./*', '../*'],
                            message: 'Use the @exo/ alias instead of relative imports.',
                        },
                    ],
                },
            ],
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
    // Standalone-library sandboxes. These files are meant to be open-sourced
    // as separate packages: no app code, no other @exo library — imports
    // within the library and external peers only. These overrides replace the
    // repo-wide relative-import ban for their files.
    {
        // Single-file libraries: no imports of any project code at all.
        files: ['src/lib/dom.ts', 'src/lib/keybindings.tsx'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@exo/*', './*', '../*'],
                            message:
                                'This file is a standalone single-file library — it must not import app code or sibling libraries.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['src/lib/toast-notification/**'],
        ignores: ['**/*.test.*'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@exo/*', '../*'],
                            message:
                                'This library is standalone — it must not import app code or sibling libraries. Only relative imports within the library directory are allowed.',
                        },
                    ],
                },
            ],
        },
    },
    // The plugin fence, one block per mounted plugin.
    ...pluginNames.map((name) => ({
        files: [`src/plugins/${name}/**/*.{ts,tsx}`],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['./*', '../*'],
                            message: 'Use the @exo/ alias instead of relative imports.',
                        },
                        {
                            group: ['@exo/plugins/*', `!@exo/plugins/${name}`],
                            message: `A plugin imports @exo/lib/*, @exo/theme/* and itself (@exo/plugins/${name}/*) only.`,
                        },
                        {
                            group: ['@exo/popup/*', '@exo/index', '@exo/service-worker'],
                            message: 'Framework entry points and popup internals are not plugin API.',
                        },
                    ],
                },
            ],
        },
    })),
    prettier,
];
