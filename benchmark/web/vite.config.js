import { defineConfig } from 'vite';

// Relative base so the build also works inside the Capacitor WebView.
// three.js alone is ~600 kB, so raise the chunk warning limit.
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 1000 } });
