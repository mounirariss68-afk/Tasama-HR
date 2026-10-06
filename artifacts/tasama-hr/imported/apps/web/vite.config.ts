import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// In development the API runs on its own port (npm run dev:server, port 5000);
// in production the server serves this build itself, so /api is same-origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: '0.0.0.0', proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 5000}` } },
  resolve: { dedupe: ['react', 'react-dom'] },
  build: { outDir: path.resolve(import.meta.dirname, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 2500 },
});
