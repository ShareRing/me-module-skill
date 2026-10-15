import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The backend (server/index.ts) answers these in development: run `npm run dev:server` beside `npm run dev`.
const BACKEND = `http://localhost:${process.env.PORT ?? __PORT__}`;
const proxied = ['/api'];

export default defineConfig({
  // Absolute asset paths: the module is always served from the root of its own domain (online mode),
  // and absolute paths keep working if you add server-rendered pages at nested paths later.
  base: '/',
  plugins: [react()],
  build: {
    target: 'es2022',
    // The module, plus the V1 anchor page used to write to ShareLedger (see src/lib/ledger.ts).
    rollupOptions: { input: { index: 'index.html', anchor: 'anchor.html' } },
  },
  server: {
    host: true,
    // Keep the Host header so anything the backend builds from it points back at the dev server.
    proxy: Object.fromEntries(proxied.map((p) => [p, { target: BACKEND, changeOrigin: false }])),
  },
});
