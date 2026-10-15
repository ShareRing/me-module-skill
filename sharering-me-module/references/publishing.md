# Manifest, hosting, testing on a phone, and submitting

## Contents
1. The manifest that works on a device
2. Hosting rules
3. Hosting options (Docker behind a reverse proxy, quick tunnel, anywhere else)
4. Testing on a phone as a custom dApp
5. Submitting in the developer portal
6. Release checklist

## 1. The manifest that works on a device

The phone and the portal validator disagree. Write the manifest for the phone and accept the
portal's two non-blocking warnings (`manifest.legacy_keys`, `manifest.unknown_keys`). The
template's `public/manifest.json` is already correct:

```json
{
  "name": "My Module", "short_name": "MyModule",
  "short_description": "One line.", "description": "Longer blurb.",
  "display": "standalone",
  "start_url": "https://my-module.example.com/",
  "version": "1.0.0",
  "operation_mode": "online",
  "webview_version": "WEB_VIEW_V2",
  "offline_mode": false, "zip_name": "", "checksum": "", "isMaintenance": false, "enable_secure_screen": false,
  "theme_color": "#050a20", "background_color": "#050a20",
  "icons": [ {"src":"./icon-106.png","sizes":"106x106","type":"image/png"},
             {"src":"./icon-192.png","sizes":"192x192","type":"image/png"},
             {"src":"./icon-512.png","sizes":"512x512","type":"image/png"} ]
}
```

- **`start_url` is the absolute `https://host/` root.** The app loads it literally. With `"/"`
  the module never loads and the phone makes no request at all. No `/index.html`, no query, no
  fragment. The template's server fills `start_url` per request from the Host header, so the same
  build works on any hostname.
- **Keep `webview_version: "WEB_VIEW_V2"`.** Without it the app uses the legacy V1 WebView, which
  silently denies every `WALLET_*`, `VAULT_*` and `CRYPTO_*` event.
- **Keep the legacy keys** (`offline_mode: false`, `zip_name`, `checksum`, `isMaintenance`,
  `enable_secure_screen`). Without them, a module opened once and then, on every relaunch, made no
  network request at all (the app seemed to treat it as offline).
- **The deploy site's manifest check warns about these keys. Leave them in.** It reports
  `manifest.legacy_keys` ("offline_mode is superseded by operation_mode … zip_name by
  offline_package.url … isMaintenance by status") and `manifest.unknown_keys` (`webview_version`,
  `checksum`, `enable_secure_screen`). The check follows a newer schema than the app. ShareRing Me's
  loader (checked 14 Oct 2026) reads `isMaintenance`, `offline_mode` and `zip_name` from the live manifest and `checksum` for the
  zip, and reads none of `operation_mode`, `status` or `offline_package`. Both warnings are "not
  blocking". Look again only when the app changes.
- Limits: `name` 30 characters (the listing truncates), `short_name` 12, `short_description` 80.
  The scaffold script warns.
- `operation_mode` stays `online`. It's fixed at registration; changing it means registering a new
  module.
- Icons are PNG, JPEG or WebP at 106, 192 and 512. **Never SVG** (the registry refuses it). The
  registry copies icons at submission, so a new icon needs a new version.
  - `npm run icons` renders them in the house style from `scripts/make-icons.mjs`: edit `GLYPH`
    there; set `ICON_LABEL=""` for a glyph-only tile.
- **Bump `version` on every release.** Submitting a version equal to the live one is a hard error,
  and the app caches against it.

## 2. Hosting rules

- The module must be served at the **root of its own host** over HTTPS. Subpaths are not
  supported: the app derives the module's identity and its storage bucket from the host.
- `index.html` and `manifest.json` both sit at that root. Serve `index.html` and `manifest.json`
  with `no-cache`, and `/assets/*` (hashed) as immutable. The template's server does both.
- TLS usually ends at a proxy, so respect `X-Forwarded-Proto` and `X-Forwarded-Host` (the
  template's `origin()` does), or set `PUBLIC_ORIGIN` in production.

## 3. Hosting options

**Docker behind a reverse proxy.** The template's `compose.yaml` publishes the app on a loopback,
random host port and carries Traefik labels for `__DOMAIN__`, so a Traefik instance that terminates
HTTPS routes the module's host to it. With another proxy (Caddy, nginx), drop the labels and route the
host to the published port.

```bash
docker compose up -d --build
curl -sI https://<your-host>/manifest.json   # expect 200
```

The template's compose file also loads an optional `.env` (`env_file` with `required: false`, so a
missing file never stops `up`), keeps `/data` on a named volume (node:sqlite and uploads survive
rebuilds), and the image runs as the unprivileged `node` user with a healthcheck. Smoke-test a new
image before it goes live: `docker run --rm -d -p 127.0.0.1:18080:<port> <image>`, then curl
`/api/health` and `/manifest.json`.

**Cloudflare quick tunnel.** Fastest for a first phone test:
```bash
./scripts/serve-tunnel.sh    # builds, starts the server, prints https://<random>.trycloudflare.com
```
The hostname changes whenever the tunnel restarts, and with it the storage bucket and the cached
manifest. Restart the *server* freely: the script keeps the tunnel alive through pid files. Use
`--new-tunnel` to force a new one. Never `pkill -f <pattern>` from a command line that contains
the pattern, because it kills your own shell.

**Anywhere else.** Any host that runs `node server/index.ts` (Node 23.6 or later) behind HTTPS on
its own hostname: Fly, Render, a VPS, Cloud Run. A purely static module can serve `dist/` from any
static host, but you then lose the dynamic `start_url`, the `/api/log` beacon and the fee proxy.
Hard-code `start_url` and keep a tiny log endpoint somewhere.

**Always tell the user** the public URL, the manifest URL (`<url>/manifest.json`), and **which
network** the module targets (mainnet vs testnet), so they open it in the matching ShareRing Me
build.

## 4. Testing on a phone as a custom dApp

In ShareRing Me: **Settings → Developer Tool → Add Custom dApps**, then enter the host URL.

- The app **caches the manifest when the entry is added** and doesn't reliably re-fetch it, even
  after a version bump. After any manifest change, **delete the custom dApp and add it again**.
- Watch the server's access log (`[hit]` lines):
  - `GET /manifest.json` with `User-Agent: okhttp/4.x` means the app read the manifest.
  - `GET /` with `…; wv) AppleWebKit…` means the WebView loaded the page.
  - Neither means the app isn't even trying your server: it's a cached manifest, not your code.
- `[client] boot 749x832 …` from `/api/log` confirms the JS ran, with the real viewport. Crashes
  and unhandled rejections arrive as `[client] error …`.
- Custom dApps are independent of the portal: a Draft or pending module can be tested this way.
- A second hostname (another quick tunnel) is a clean test: no cached manifest, empty storage.

## 5. Submitting in the developer portal

Portal: `https://dapps.sharetoken.io/build`. The public developer guide is at
`docs.shareri.ng/me-modules/developer-guide.html`.

- The module is keyed by **domain**. Each submission re-reads the live `manifest.json` (the portal
  fetches with `User-Agent: MeModulesDevelopmentPortal/1.0`).
- States: Draft, then Pending (review), then "in no app" until approved and activated.
- Warnings (`legacy_keys`, `unknown_keys`) don't block. Errors do.

## 6. Release checklist

- [ ] `version` bumped in `public/manifest.json`
- [ ] `npm run typecheck && npm run build` pass
- [ ] `npm run layout` passes (every screen fits at every size)
- [ ] Icons render and aren't SVG. The name fits 30, short_name 12, short_description 80
- [ ] `AFTER_CLICK='<main action>' npm run layout` passes too (layouts that break only after a result)
- [ ] Deployed, and `curl https://<host>/manifest.json` shows the absolute https `start_url`
- [ ] Custom dApp deleted and re-added on the phone, and `[hit]` + `[client] boot` seen in the log
- [ ] The user is told the URL, the network, and what to do next
