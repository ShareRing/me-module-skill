# Backend patterns

The template's `server/index.ts` is a dependency-free `node:http` server:
- It serves `dist/` and the dynamic `manifest.json`.
- It has `/api/health`, the `/api/log` beacon and the `/api/fees` proxy.
- It prints an access log (`[hit]`).

Add routes inside `api()`. Node 23.6 or later runs `.ts` directly, so `server/` can import
`../src/lib/*.ts` (keep those files free of DOM and React imports if the server uses them).

## Contents
1. Storage
2. Who is this user? Sessions and ownership
3. Public pages people can share (OG images, verification)
4. Webhooks to partners
5. Security checklist

## 1. Storage

`node:sqlite` (built in) for anything relational, with a Docker volume at `/data`
(`DB_PATH=/data/app.db`). Files (photos, exports) go on the same volume, keyed by content hash.
Keep app-side storage (`COMMON_*_ASYNC_STORAGE`) for small preferences only.

## 2. Who is this user? Sessions and ownership

- **Session:** on first launch, have the server mint a random session token. Store it with
  `writePref` (app storage) and send it as a header. Server records are **owned by the session**.
- **Wallet:** a client-reported address is a *claim*. To bind a session to an address, have the
  server issue a nonce and the module call `walletSignArbitraryMessage(nonce)`, then check that
  `publicKey` hashes to the address (`bech32('shareledger', ripemd160(sha256(pubkey)))`). Full
  signature verification waits on the unconfirmed hash scheme (see `bridge.md`). Never grant
  ownership because a request *says* it's from address X.
- **Verified human:** `VAULT_DOCUMENTS` non-empty is a good client-side signal, not proof to a
  server. For server-enforced facts (age, nationality, a full KYC), run a ShareRing LINK workflow
  inside the module (`vaultExecQuery({ workflowId })`, `bridge.md` §3). Your server trusts LINK's
  delivery for that run (the workflow's Delivery HTTP node or `GET /v1/workflow-runs/:id`), never
  the values the page hands back. To know which of your records a run belongs to, have the server
  mint a single-use id (`GET /v1/workflows/:id/qr-info?dynamic=true` → `dynamicId`) and pass that
  as the `workflowId`. Ask the user for their LINK workflow ids and API access.
- **What "proven" is worth today:** only that the public key hashes to the address, for a fresh nonce
  signed behind the PIN. Anyone can make a key pair, so "one vote per wallet" can be scripted until the
  signature itself is verified. Say exactly that in the UI ("one vote per ShareRing Me wallet, approved
  with a PIN"), never "bot-proof". A cheap extra hurdle: require the address to exist on chain
  (`{LCD}/cosmos/auth/v1beta1/accounts/<address>`). Log `{message, signature, publicKey}` from real
  devices so the hash scheme can be worked out offline.
- **Country:** `COMMON_DEVICE_INFO.country` or Cloudflare's `CF-IPCountry` is for merchandising,
  never compliance (a VPN beats it).

## 3. The app-only gate, and public pages people can share

The module is app-only: in a browser, `App.tsx` renders the Get ShareRing Me landing and nothing
else. That gate is UX, not security. The bundle is public and anyone can fake the bridge in a
browser, so:
- Every `/api` route that reads or changes a user's data checks who is calling: a session from the
  wallet sign-in in `bridge.md` §3, never "the client said it was in the app".
- Don't put secrets, other users' data or admin switches in the bundle.
- Don't try to block browsers on the server by user agent. It's trivially spoofed, and it breaks
  the landing page and link previews.

Modules spread through links opened *outside* the app. The module URL itself lands on the Get
ShareRing Me page. For shareable things that must be readable without the app (a proof, a
certificate), add a separate server-rendered public page. Show only what's meant to be public, and
always carry the store links:
- `GET /v/:id` (or `/c/:id`) renders a server-side HTML page with `og:title`, `og:description`, an
  `og:image` (render a PNG at build time or on demand), the content, and **store links** to get
  ShareRing Me.
- For proofs, that page verifies in the browser against the public RPC (`ledger.md` §5), so it
  doesn't have to trust your server.
- An embeddable badge (`/embed/:id`, iframe-friendly and light-themed) lets partners show "Verified
  on ShareLedger" on their own site.
- Use hash routes inside the module and real paths for these public pages. The server decides by
  path.

## 4. Webhooks to partners

When other systems need your module's events (e.g. a partner site receiving captured photos):
- POST JSON `{ event, id, created_at, data }`, signed with HMAC-SHA256 over the raw body in an
  `x-sharering-signature: sha256=<hex>` header, using a per-partner secret.
- Retry with backoff; make deliveries idempotent by `id`.
- Put links to public proof pages in the payload, not large blobs.
- **Posting to your own team's chat** (a Slack or Mattermost incoming webhook): neutralise chat markup
  in anything a person typed, or a public form can `@channel` your team and dress up links. Replace
  `@` with `@` plus a zero-width space, `<` and `>` with `‹` and `›`, and backticks with quotes.
  Never block the response on the webhook.

## 5. Security checklist

- No secrets in the client bundle or the image. Use `.env` via `env_file`, which is gitignored.
- Validate every body. Size-limit uploads (`readJson(req, limit)`). Rate-limit writes per session.
- Serve user content with the right `content-type` and never as HTML from your origin (stored
  XSS; the same reason SVG icons are refused).
- `normalize()` static paths and check that they stay inside `dist/` (the template does).
- Never ask for, accept or log a private key or mnemonic. Signing always happens in the app, behind
  the PIN.
- Static files: check `file.startsWith(DIST + sep)`; without the separator `/..%2fdist-old/x`
  resolves into a sibling folder. Decode the path inside a try/catch: a malformed escape throws, and an
  uncaught throw takes the whole server down.
- Logs: strip newlines and control characters from anything a client sends before logging it, or a
  beacon can forge log lines (including the `[prove]` lines you research signatures from).
- Enums from a body: validate with `Object.hasOwn(MAP, value)`, not `value in MAP` (`__proto__` and
  `constructor` pass `in`).
- Rate limits count saves, not attempts: a loose per-IP limit on tries, the strict one just before
  storing. Otherwise a few typos lock a real person out.
- Store the minimum. No user agents or device models on sessions unless you use them, and if the
  module tells people something "stays on your phone", make it true on the server too.
- Public forms: don't put a `#fragment` in the form's `action`; the browser scrolls to it after load
  and undoes focus on the error summary.
- The ledger anchor page signs for the wallet: it escapes everything it writes into the page, ignores
  `postMessage` from other windows, and is served with `X-Frame-Options: DENY` (the template does all
  three; keep them).
- `.dockerignore` excludes `.env`: secrets never enter the build context; compose passes them at
  run time.
