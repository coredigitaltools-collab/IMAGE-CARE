module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    // Warn on fast-refresh violations in source; off in test files via override
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Warn on any in source; loosened in test files via override
    '@typescript-eslint/no-explicit-any': 'warn',
    // Warn on unused vars (allow leading underscore to suppress)
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // Test files: relax rules that are impractical for test helpers and mocks
      files: ['src/__tests__/**/*.ts', 'src/__tests__/**/*.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'react-refresh/only-export-components': 'off',
      },
    },
    {
      // Context/hooks/utils files that export non-components alongside components
      files: [
        'src/context/*.tsx',
        'src/components/ui/index.tsx',
        'src/app/router.tsx',
      ],
      rules: {
        'react-refresh/only-export-components': 'off',
      },
    },
  ],
};
