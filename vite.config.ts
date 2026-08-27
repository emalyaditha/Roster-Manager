import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/data/**', '**/server/**'] },
    },
    build: {
      cssCodeSplit: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            // Heavy external deps — each gets its own chunk so initial JS is smaller
            firebase: ['firebase/app', 'firebase/auth'],
            motion: ['motion'],
            xlsx: ['xlsx'],
            vendor: ['react', 'react-dom', 'lucide-react', '@floating-ui/react'],
          },
        },
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'motion', 'lucide-react'],
      exclude: ['xlsx'],
    },
  };
});
