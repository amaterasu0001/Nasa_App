import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Tiny dev/preview relay so Pulse (:5174) and the Cockpit (:5173) can talk across origins.
 * BroadcastChannel/localStorage only work within ONE origin, so they cannot link two different ports.
 *   GET  /__avia/stream   -> Server-Sent Events: every published message is pushed to all listeners
 *   POST /__avia/publish  -> body is a JSON SyncMessage (see src/lib/sync.ts)
 * CORS is open (*) because this is a local demo relay. Replace with the real BFF/WebSocket in production.
 */
function aviaRelay(): Plugin {
  const clients = new Set<any>();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };
  const handler = (req: any, res: any, next: () => void) => {
    if (!req.url?.startsWith('/__avia/')) return next();
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.url === '/__avia/stream') {
      res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.url === '/__avia/publish' && req.method === 'POST') {
      let body = '';
      req.on('data', (c: Buffer) => (body += c));
      req.on('end', () => {
        for (const c of clients) c.write(`data: ${body.replace(/\n/g, '')}\n\n`);
        res.writeHead(204, cors);
        res.end();
      });
      return;
    }
    next();
  };
  return {
    name: 'avia-relay',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  };
}

// In dev, /api/* is proxied to the BFF (default :4000), which serves the /api/v1 contract and persists every reading.
export default defineConfig({
  plugins: [react(), aviaRelay()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: true } },
  },
  preview: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: true } },
  },
});
