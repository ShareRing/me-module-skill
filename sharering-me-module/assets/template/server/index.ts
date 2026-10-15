/**
 * The module's backend: serves the built module, a DYNAMIC manifest.json, a client error log and a
 * fee lookup. Plain node:http, no framework; `node server/index.ts` runs it (Node >= 23.6 strips
 * the TypeScript). Add your own /api routes in api() - and node:sqlite if you need a database.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
// public/ is copied into dist/ by the build. In development the backend serves files straight from
// public/ when they aren't in dist/, so server-rendered pages (fonts, images, video) work unbuilt.
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT ?? __PORT__);
/** Set in production. Unset: taken from each request's Host (quick tunnels change hostname). */
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN?.replace(/\/$/, '') || null;
const LCD = process.env.SHARELEDGER_LCD ?? 'https://lcd.explorer.shareri.ng';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const raw = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(status, { 'content-type': raw ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(raw ? body : JSON.stringify(body));
}

/** One line of plain text for the console: no newlines (a beacon could otherwise forge log lines). */
const oneLine = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, max);

async function readJson(req: IncomingMessage, limit = 64 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'too large');
    chunks.push(c as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'bad json'); }
}

function origin(req: IncomingMessage) {
  if (PUBLIC_ORIGIN) return PUBLIC_ORIGIN;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${PORT}`;
  const local = /^(localhost|127\.|192\.168\.|10\.)/.test(host);
  return `${(req.headers['x-forwarded-proto'] as string) || (local ? 'http' : 'https')}://${host}`;
}

async function api(req: IncomingMessage, res: ServerResponse, path: string, url: URL) {
  if (path === '/api/health') return send(res, 200, { ok: true });

  // Client error beacon: the only way to see a crash inside the app's WebView.
  if (path === '/api/log' && req.method === 'POST') {
    const b = await readJson(req, 8 * 1024);
    console.log(`[client] ${oneLine(b.kind, 20)} ${Number(b.w) | 0}x${Number(b.h) | 0} ${oneLine(b.message, 2000)} | ${oneLine(b.ua, 200)}`);
    return send(res, 204, '');
  }

  // What a ShareLedger write will cost this address (the LCD sends no CORS headers, so we proxy).
  if (path === '/api/fees') {
    const address = url.searchParams.get('address') ?? '';
    if (!/^shareledger1[0-9a-z]{38,58}$/.test(address)) throw new HttpError(400, 'address required');
    const get = (p: string) => fetch(`${LCD}${p}`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json() as Promise<Record<string, any>>).catch(() => null);
    const [check, bal] = await Promise.all([
      get(`/shareledger/gentlemint/checkFees?address=${address}&actions=bank_send`),
      get(`/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=nshr`),
    ]);
    const actionFee = String(check?.convertedFee?.amount ?? '6420000000');
    const gas = '1200000000'; // ~120k gas at 10000nshr: generous for one MsgSend
    const balance = String(bal?.balance?.amount ?? '0');
    return send(res, 200, { actionFee, gas, balance, sufficient: BigInt(balance) >= BigInt(actionFee) + BigInt(gas) });
  }

  throw new HttpError(404, 'no such endpoint');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt; charset=utf-8',
};

function serveStatic(req: IncomingMessage, res: ServerResponse, path: string) {
  if (path === '/manifest.json') {
    // The app loads start_url LITERALLY, so it must be the absolute https root of the host the phone
    // actually reached ("/" silently fails to load). Filling it per request keeps tunnels working.
    const src = existsSync(join(DIST, 'manifest.json')) ? join(DIST, 'manifest.json') : join(PUBLIC, 'manifest.json');
    const mf = JSON.parse(readFileSync(src, 'utf8'));
    mf.start_url = `${origin(req)}/`;
    return send(res, 200, JSON.stringify(mf, null, 2), { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  }
  // `+ sep` matters: without it, "/..%2fdist-old/x" would resolve into a sibling folder named dist*.
  const rel = path === '/' ? 'index.html' : path;
  let file = normalize(join(DIST, rel));
  if (!file.startsWith(DIST + sep) || !existsSync(file) || !statSync(file).isFile()) {
    file = normalize(join(PUBLIC, rel));
    if (path === '/' || !file.startsWith(PUBLIC + sep) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'not found');
  }
  const size = statSync(file).size;
  const headers: Record<string, string> = {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
  };
  // The ledger anchor page signs for the wallet: nobody may frame it.
  if (/anchor\.html$/.test(path)) headers['x-frame-options'] = 'DENY';
  // Video needs byte ranges (iOS won't play it without them).
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      return res.end();
    }
    const buf = readFileSync(file).subarray(start, end + 1);
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(buf.length) });
    return res.end(buf);
  }
  res.writeHead(200, { ...headers, 'content-length': String(size) });
  res.end(readFileSync(file));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  // A malformed escape (e.g. "/%E0%A4%A") makes decodeURIComponent throw: answer 400, don't crash.
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'bad path');
  }
  try {
    if (path.startsWith('/api/')) return await api(req, res, path, url);
    // Access log for the two requests that matter when debugging a phone: the app fetching the
    // manifest (User-Agent okhttp/...) and the WebView loading the page (... wv) AppleWebKit ...).
    if (path === '/' || path === '/manifest.json') console.log(`[hit] ${path} ${req.headers['user-agent']?.slice(0, 160) ?? ''}`);
    return serveStatic(req, res, path);
  } catch (e) {
    if (res.headersSent) return;
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: 'server error' });
  }
}).listen(PORT, () => console.log(`__MODULE_NAME__ on http://localhost:${PORT}`));
