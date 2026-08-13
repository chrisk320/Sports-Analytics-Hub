import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // react-refresh/only-export-components flags a file that exports anything
    // besides components, because it costs hot-reload granularity. In these two
    // places the mixed export is the intended design, not an oversight:
    //
    //   components/ui/*  vendored shadcn primitives, which ship exporting their
    //                    variant helpers (buttonVariants) as public API. These
    //                    are regenerated, not hand-edited.
    //   context/*        a provider and its consumer hook belong in one file;
    //                    splitting useSport() away from SportProvider to please
    //                    a hot-reload heuristic makes the code worse.
    //
    // Scoped off here rather than left failing, so `npm run lint` is a signal
    // CI can gate on instead of three errors everyone learns to ignore.
    files: ['src/components/ui/**/*.jsx', 'src/context/**/*.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
