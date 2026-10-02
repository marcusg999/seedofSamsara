import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'dist/**',
    'node_modules/**',
    'test-results/**',
    'playwright-report/**',
    '.gate/**',
    // Research sources are fetched public-domain text, not project code.
    'research/**',
  ]),
  {
    // Type-aware linting applies to the TypeScript the game and gate are built
    // from. This config file itself is plain JS and is linted without a program.
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // CLAUDE.md § Stack: no `any` without a comment explaining why. The rule
      // stays an error; a justified use carries an eslint-disable line whose
      // comment is the explanation.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // three.js disposal and WebGL calls are side-effecting by nature.
      '@typescript-eslint/no-confusing-void-expression': 'off',
      // three.js callbacks hand over arguments we do not all need; a leading
      // underscore marks one as deliberately ignored.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
]);
