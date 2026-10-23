import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: { entry: { index: 'src/index.ts', core: 'src/core.ts', register: 'src/register.ts' }, formats: ['es'] },
    sourcemap: true,
  },
});
