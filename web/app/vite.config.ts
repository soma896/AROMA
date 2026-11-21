import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// The development extension's id, pinned by its manifest `key`
// (web/extension/dev-key/). Read at build time so the page can message it.
function devExtensionId(): string {
  try {
    return readFileSync(new URL('../extension/dev-key/extension-id.txt', import.meta.url), 'utf8').trim();
  } catch {
    return '';
  }
}

// Custom proxy plugin using Node fetch (undici) to avoid http-proxy's 16KB header overflow
function youtubeProxyPlugin(): Plugin {
  return {
    name: 'youtube-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const isMusic = req.url?.startsWith('/__yt_music__');
        const isWww = req.url?.startsWith('/__yt_www__');
        if (!isMusic && !isWww) return next();

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
          res.setHeader('Access-Control-Allow-Headers', '*');
          return res.end();
        }

        try {
          const originHost = isMusic ? 'https://music.youtube.com' : 'https://www.youtube.com';
          const subPath = req.url!.replace(isMusic ? /^\/__yt_music__/ : /^\/__yt_www__/, '');
          const targetUrl = new URL(subPath, originHost).toString();

          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (['host', 'connection', 'content-length', 'cookie'].includes(k.toLowerCase())) continue;
            if (typeof v === 'string') headers.set(k, v);
            else if (Array.isArray(v)) v.forEach((val) => headers.append(k, val));
          }
          headers.set('Origin', originHost);
          headers.set('Referer', `${originHost}/`);
          headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

          let body: Buffer | undefined;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            if (chunks.length) body = Buffer.concat(chunks);
          }

          const response = await fetch(targetUrl, {
            method: req.method,
            headers,
            body,
            redirect: 'follow',
          });

          res.statusCode = response.status;
          response.headers.forEach((val, key) => {
            const lower = key.toLowerCase();
            if (lower !== 'content-encoding' && lower !== 'content-length' && lower !== 'transfer-encoding') {
              res.setHeader(key, val);
            }
          });
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
          res.setHeader('Access-Control-Allow-Headers', '*');

          const buf = Buffer.from(await response.arrayBuffer());
          res.end(buf);
        } catch (err: any) {
          console.error('[youtube-proxy error]', err);
          res.statusCode = 502;
          res.end(err.message);
        }
      });
    },
  };
}

// The party server's address stays out of the repo: .env.local here, a
// Cloudflare Pages variable in production. Without it Listen Together can't
// make a party, so a production build stops instead of shipping that.
function requirePartyServer(mode: string): void {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_');
  if (!env.VITE_PARTY_SERVER_URL?.trim()) {
    throw new Error('VITE_PARTY_SERVER_URL is not set (app/.env.local, or the Cloudflare Pages environment).');
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build') requirePartyServer(mode);
  return {
    plugins: [react(), tailwindcss(), youtubeProxyPlugin()],
    define: {
      DEV_EXTENSION_ID: JSON.stringify(devExtensionId()),
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)).replace(/\\/g, '/') },
    },
    // AutoMix's analysis worker (playback/automix): essentia.js's 2021-era
    // Emscripten glue breaks under dep pre-bundling, and the worker is a module.
    optimizeDeps: { exclude: ['essentia.js'] },
    worker: { format: 'es' },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
