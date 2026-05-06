import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for the application
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: true,
  }
});
