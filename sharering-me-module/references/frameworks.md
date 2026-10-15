# Stack options

A Me Module is **a web app at the root of an HTTPS host**, loaded by ShareRing Me's WebView (a
Chromium WebView on Android, WKWebView on iOS). Anything that produces a static SPA plus an optional
backend works. What's fixed is the bridge (`@sharering/me-module-sdk`, ES modules) and the hosting
rules in `publishing.md`.

## Contents
1. Default: React + Vite + TypeScript (the template)
2. Vue 3
3. Vanilla TS / no framework
4. Next.js, Svelte, Angular, others
5. Backends in other languages
6. Online vs offline (zip) modules
7. Porting an existing web app

## 1. Default: React + Vite + TypeScript (the template)

This is what the Builder's official scaffold uses and what the template extends. Use it unless the
user has a reason not to.
- React 19, Vite 7, TypeScript 5.9 in `erasableSyntaxOnly` mode, so the same `.ts` files run in Node
  23.6 or later with no build step (`src/lib/*.ts` can be imported by `server/`).
- No router or state library: a hash router (`router.ts`) and `useSyncExternalStore` stores. Add
  libraries only when a screen genuinely needs them.
- `vite.config.ts`: `base: '/'`, the `/api` proxy to the local backend (`changeOrigin: false`, so
  the dynamic manifest sees the real Host), and a second rollup input for `anchor.html`.

## 2. Vue 3

Scaffold with the template to get the manifest, server, icons, anchor page, tests and house CSS.
Then swap the React layer:

```bash
npm rm react react-dom @types/react @types/react-dom @vitejs/plugin-react
npm i vue && npm i -D @vitejs/plugin-vue vue-tsc
```

```ts
// src/main.ts
import { createApp } from 'vue';
import { createMeModule } from '@sharering/me-module-sdk/vue';
import App from './App.vue';
createApp(App).use(createMeModule()).mount('#app');
```

- Use `useReadyState()`, `useAppInfo()` and `useBridgeQuery('WALLET_BALANCE')`, which return refs, or
  keep the template's `bridge.ts` logic and replace its `useSyncExternalStore` with a `reactive()`
  store.
- `house.tsx` → a `Backdrop.vue`, plus `journey()`/`reveal()` called in `onMounted`. Those two
  functions are framework-free.
- Keep the dev-only `configureBridge({ transport: createMockTransport(...) })` in `main.ts`.

## 3. Vanilla TS / no framework

Good for tiny modules (a single card, a scanner, a game on a `<canvas>`). Keep Vite for bundling
and the SDK import, use the plain wrappers (`await commonAppInfo()`), and render with template
literals or the DOM API. The house CSS, `journey()` and `reveal()` work without React. Games: keep
the simulation deterministic (fixed 60 Hz ticks, integer PRNG) so a server can replay an input log
and trust only its own score.

## 4. Next.js, Svelte, Angular, others

- **Next.js:** `output: 'export'` (static), no `basePath`, and client components only for anything
  touching the bridge (`'use client'`, called in `useEffect`; the SDK needs `window`). Prefer hash
  routes or `trailingSlash: true` with real files. There's no server runtime in the WebView: API
  routes need a separate host or a Node server alongside. Serve `manifest.json` dynamically, or
  hard-code the absolute `start_url`.
- **SvelteKit:** `adapter-static` with `fallback: 'index.html'`, `ssr = false` for bridge pages.
- **Angular:** a standard SPA build. Wrap the SDK in an injectable service; call it in
  `ngOnInit`/`afterNextRender`, not in constructors during SSR.
- **Flutter web, other WASM stacks:** possible (it's just a web page), but the SDK is JS. You need a
  small JS interop shim, and the bundle size hurts start-up. Not recommended.

Whatever the stack, the rules in `bridge.md` apply unchanged: a real round trip to decide in-app, a
dev-only mock guard, bare-string payloads, long PIN timeouts.

## 5. Backends in other languages

The template's `server/index.ts` is plain `node:http` (no framework). Add routes in `api()`; use
`node:sqlite` for storage. Any language works if it:
- Serves `dist/` at `/` with `no-cache` on `index.html` and `manifest.json`, and immutable hashed
  `/assets/*`.
- Serves `/manifest.json` with `start_url` = the absolute https origin of the request
  (`X-Forwarded-Proto` / `X-Forwarded-Host`).
- Accepts `POST /api/log` and prints it (your only view of crashes on a phone).
- Proxies any LCD calls you need (the LCD has no CORS; the RPC does).

Python/FastAPI, Go/net/http, Bun and Deno are all fine. Put them in the same `Dockerfile`.

## 6. Online vs offline (zip) modules

`operation_mode: "online"` (a hosted URL) is what's field-tested and what the template produces.
The platform also has an offline mode where the app loads a zip bundle (hence the `zip_name` and
`checksum` keys, and why hash routing is recommended). Offline is fixed at registration and hasn't
been verified on devices here. Only pursue it if the user explicitly needs a no-network module, and
tell them it's untested.

## 7. Porting an existing web app

1. Scaffold into a fresh directory with `--no-ledger` unless the app writes to the chain.
2. Copy over the app's screens. Keep the template's `index.html` splash, `main.tsx` (mock guard,
   beacon), `lib/bridge.ts`, `lib/router.ts`, `app.css` shell and `server/`.
3. Replace any login or KYC form with `discover()` identity (the user is already verified). Replace
   "sign in with wallet" with `walletSignArbitraryMessage`.
4. Convert path routes to hash routes (or make the server serve `index.html` for every path).
5. Make every screen pass `npm run layout`, and re-skin it with the house tokens.
