import nextConfig from 'eslint-config-next';

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...nextConfig,
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/db', '@/db/*', '**/db', '**/db/*'],
              message: 'Pages and components must never import db directly. Call functions in src/server/ instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/server/ledger/**', 'src/db/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/db/schema',
              importNames: ['stockMovements'],
              message: 'Only src/server/ledger/ may interact directly with stockMovements.',
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
