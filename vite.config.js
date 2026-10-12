import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    // Keep runtime dependencies separately cacheable from the scene and content.
    rolldownOptions: {
      output: { manualChunks: (id) => id.includes('node_modules') ? 'three' : undefined },
    },
  },
});
