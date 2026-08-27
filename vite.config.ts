import tailwindcss from '@tailwindcss/vite';
import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  // Android WebView loads this project through file:///android_asset/.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // Android 7 frequently ships with Chrome 51-era WebView. Generate an ES5
    // fallback bundle and its required polyfills in addition to the modern build.
    legacy({
      targets: ['Chrome >= 51', 'Android >= 7'],
      modernPolyfills: false,
      renderLegacyChunks: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
}));
