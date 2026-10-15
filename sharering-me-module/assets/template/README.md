# __MODULE_NAME__

A ShareRing **Me Module**: a web app that runs inside the ShareRing Me app's WebView and talks to it
through [`@sharering/me-module-sdk`](https://www.npmjs.com/package/@sharering/me-module-sdk).

__DESCRIPTION__

## Develop

```bash
npm install
npm run dev:server   # backend on :__PORT__ (manifest, /api/log, /api/fees, your API)
npm run dev          # Vite on :5173 with the SDK's mock bridge; proxies /api to the backend
```

In a browser the bridge is mocked from the SDK's event catalog (see `src/main.tsx`). To talk to a
real app over the dev server, run with `VITE_REAL_BRIDGE=1`.

**App-only.** Outside ShareRing Me the module shows only the Get ShareRing Me landing
(`src/screens/GetApp.tsx`) with App Store and Google Play links. Preview it at
`http://localhost:5173/#/get-app`, or see the real thing with `npm run build && npm run server` in a
desktop browser. The gate is the front door, not security: the JS bundle is public, so any API that
touches user data must check who is calling on the server.

## Test on a phone

1. Host it over HTTPS at the root of its own domain: `docker compose up -d --build` (fixed domain,
   see `compose.yaml`) or `./scripts/serve-tunnel.sh` (quick tunnel, changing URL).
2. In ShareRing Me: **Settings → Developer Tool → Add Custom dApps**, paste the root URL.
3. After ANY manifest change: bump `version`, then delete the custom dApp and add it again (the app
   caches the manifest and does not reliably re-fetch it).
4. Watch the backend log: `[hit] /manifest.json okhttp/...` = the app fetched the manifest;
   `[hit] / ... wv)` = the WebView loaded the page; `[client] ...` = errors from the phone.

## Checks

```bash
npm run typecheck
npm run layout       # every route at 11 sizes incl. the Fold 7 inner screen; nothing may overflow
AFTER_CLICK='.actions .btn-primary' npm run layout   # again after each screen's main action
SCROLL=1 OUT=shots npm run shots                      # screenshots, walking the scrolling pane
npm run icons        # re-render public/icon-{106,192,512}.png
```

On a phone there are no devtools: the You screen lists every bridge call this session (from the
traced transport in `src/main.tsx` and `src/lib/trace.ts`), and crashes reach the server log as
`[client] ...` lines.

## Layout

- `src/lib/bridge.ts` - identity discovery (and `rediscover()`), preferences in WebView localStorage, copy/share/open-link, with the bridge rules.
- `src/lib/trace.ts` - records every bridge message (type, payload, reply, round trip) for an on-phone log.
- `src/lib/mock.ts` - development-only replies for the mock bridge, with a real key pair; never shipped.
- `src/lib/router.ts` - hash routes, the Android back-button guard, sheets that close on back (`pushOverlay`), and scroll memory.
- `src/lib/ledger.ts` + `anchor.html` / `src/anchor.ts` + `src/lib/merkle.ts` (if present) - writing to ShareLedger with `broadcastInApp()` (the V1 anchor page is a legacy fallback), batching with Merkle roots, and
  reading/verifying transactions from the public RPC.
- `src/ui/house.*` - ShareRing's "cinema" house style: travelling scene colours, glow, glyph grid, reveals.
- `server/index.ts` - static host, dynamic `manifest.json` (absolute `start_url`), client log, fee lookup.

## Before submitting to the developer portal

- `public/manifest.json`: real `start_url` (absolute https root), `version` bumped, icons are PNG.
- Keep `webview_version: "WEB_VIEW_V2"` and the legacy keys (`offline_mode`, `zip_name`, `checksum`,
  `isMaintenance`, `enable_secure_screen`): the portal warns about them, the app needs them.
- Submitting a version equal to the live one is a hard error.
