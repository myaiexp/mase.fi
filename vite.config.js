// Vite build config: homepage + the standalone 404 error page as MPA entries
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        notfound: resolve(import.meta.dirname, '404.html'),
      },
    },
  },
});
