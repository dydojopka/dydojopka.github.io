import { defineConfig } from 'vite';
import { businessCardPlugin } from './build/business-card-plugin.js';

export default defineConfig({
  base: '/',
  plugins: [businessCardPlugin()],
  build: {
    target: 'es2022',
    // Keep runtime dependencies separately cacheable from the scene and content.
    rolldownOptions: {
      output: { manualChunks: (id) => id.includes('/three/') ? 'three' : undefined },
    },
  },
});
