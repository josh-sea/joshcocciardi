import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// @shared is the pure TypeScript in ../functions/src/shared: the same types,
// schedule math, plan splitting, and reminder wording the Cloud Functions use,
// so the preview a owner sees is exactly what their customer gets.
const shared = fileURLToPath(new URL('../functions/src/shared', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': shared } },
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Firebase is most of the weight; a separate chunk caches across releases.
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/@firebase') || id.includes('node_modules/firebase') ? 'firebase' : id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
