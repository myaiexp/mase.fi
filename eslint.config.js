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
        localStorage: 'readonly',
        location: 'readonly',
        matchMedia: 'readonly',
        IntersectionObserver: 'readonly',
        AbortController: 'readonly',
        MutationObserver: 'readonly',
        DOMException: 'readonly',
        Event: 'readonly',
      },
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
