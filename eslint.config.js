import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        CSS: 'readonly',
        fetch: 'readonly',
        clearTimeout: 'readonly',
        setTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
      },
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
