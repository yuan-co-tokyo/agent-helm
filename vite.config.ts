import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'src/web', plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: {
    '/api': { target: 'http://127.0.0.1:8790', changeOrigin: true,
      configure(proxy) { proxy.on('proxyReq', (req, incoming) => {
        // Never manufacture an Origin for requests that did not have one.
        if (incoming.headers.origin === 'http://127.0.0.1:5173') req.setHeader('Origin', 'http://127.0.0.1:8790');
      }); }
    }
  } }
});
