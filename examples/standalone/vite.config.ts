import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Relative asset URLs work both at /lyricue/ on Pages and on a custom domain.
  base: './',
  build: { outDir: fileURLToPath(new URL('../../demo-dist', import.meta.url)), emptyOutDir: true },
});
