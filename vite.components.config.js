// Vite config for base-components library build
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/components/index.js',
      name: 'BaseComponents',
      formats: ['iife'],
      fileName: () => 'base-components.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
  },
});
