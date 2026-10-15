# Talking to ShareRing Me: the bridge

The module is a web page in the app's WebView. Everything it can ask the app for goes through
`@sharering/me-module-sdk` as a typed wrapper per event: `COMMON_APP_INFO` becomes `commonAppInfo()`.
The full list, with request and response shapes, is in `sdk-catalogue.md` (generated from the
installed SDK; refresh it with `node scripts/dump-events.mjs <module-dir>`).

## Contents
1. Rules that matter on a real phone
2. What each category is good for
3. Recipes: identity, sign-in, LINK workflows (identity checks, consented data), DID, storage, sharing, wallet passes, in-app browser
4. What does NOT work
5. Framework bindings (React / Vue hooks)

## 1. Rules that matter on a real phone

Each of these cost somebody a debugging session on a handset, where there are no devtools.

- **Don't decide "am I in the app?" by checking `window.ReactNativeWebView` at start-up.** The app
  injects it after the page starts, so the check loses the race. Decide after a real round trip:
  `commonAppInfo({ timeoutMs: 7000 })`. If it answers you're in the app; if it throws you're in a
  browser, and the module shows only the Get ShareRing Me landing (modules are app-only). The React binding's `useIsHosted()` does the same thing. The mock guard uses
  `import.meta.env.DEV` for the same reason.
- **In a plain browser, the SDK takes about 5–7 seconds to conclude there's no app.** The splash
  covers the wait, and no module screen renders behind it. The template's `plainBrowserHint()`
  shows the landing at once for user agents that can't be the app's WebView (desktop browsers,
  Android without `; wv)`, iOS Safari). It only speeds up the "no" answer: if the bridge answers
  later, the module replaces the landing.
- **Same-type calls go one at a time.** The SDK queues per type, but don't fire ten
  `commonReadAsyncStorage` calls at once: batch keys in one call (it accepts an array). Different
  types may overlap.
- **Timeouts:**
  - Lookups: 4–8 s, because they answer fast or not at all.
  - PIN-gated or consent calls: 60–120 s, because a human is answering. Those calls are
    `WALLET_SIGN_*`, `CRYPTO_SIGN`, `CRYPTO_DECRYPT`, `VAULT_VCT_TOKEN_ID` and a legacy
    `VAULT_EXEC_QUERY*` (by `queryId`).
  - A LINK workflow (`VAULT_EXEC_QUERY` with `workflowId`): 15–20 minutes, because the person may
    be scanning an ID and taking a selfie.
  - The default is 60 s. Pass `{ timeoutMs }` as the last argument.
- **Treat a declined prompt as a soft failure.** It arrives as an error or a timeout. Show "Not
  signed. Try again", never a crash.
- **Optional data is decoration.** Avatar, documents and balance: render first, fill them in later.
  Wrap each call in a `soft()` that returns null on failure (the template's `bridge.ts` does).
- **Parse defensively.** Response shapes vary between app builds:
  - Account fields can sit at the top level or under `account`, `result` or `data`.
  - A pubkey can be hex or base64.
  - `VAULT_AVATAR` can lack the `data:` prefix.
  - The DID can lack `did:shr:`.
- **Accounts:** try `walletCurrentAccount()` first and fall back to `walletMainAccount()`, because
  older builds only answer MAIN. Addresses are bech32 with the prefix `shareledger`. The catalogue's
  `shr1…` examples are truncated and invalid.
- **Bare-string payloads.** These take a string, not an object:
  - `commonReadAsyncStorage('key')`: an object is silently accepted and returns nothing, which
    works in the mock and comes back empty on the phone.
  - `commonSetStatusBarStyle('light')`.
  - `commonOpenBrowser(url)`.
  - `walletSignArbitraryMessage(msg)`.
  - `navigateOpenLink(url)`.
- **Storage is scoped to the domain.** A new host (a quick tunnel, say) means an empty bucket. Never
  send `dAppsDomainName`; the app injects it.
- **Keep preferences in WebView `localStorage`, not `COMMON_WRITE_ASYNC_STORAGE`.** On current app
  builds a bridge storage write breaks the module's host on that phone (`testing.md`, the "Coming
  Soon" row). The template's `readPref`/`writePref` use localStorage only.
- **Clipboard:** `COMMON_COPY_TO_CLIPBOARD` answers `null` on success. Treat a resolved call as
  copied; don't route it through a helper that turns `null` into failure, and fall back to
  `navigator.clipboard` only on an error (iOS blocks the web clipboard after an `await`).
- **Cached and coalesced answers.** The SDK answers `CACHEABLE` events (device info, the DID, the
  wallet-pass checks) from cache after the first call, and merges same-type `COALESCABLE` lookups
  that are in flight. To replay a lookup for real (a "run it again" button), call
  `getBridge().invalidate()` first (the template's `rediscover()`), and never start a second run
  while one is going: the two runs share answers and per-run timings come out wrong.
- **An SDK typing trap:** `decodeRequest`/`decodeResponse` typecheck as exports of the main entry
  but only exist at run time in `@sharering/me-module-sdk/protocol`. Import them from there.
- **Theme:** read `darkMode` from `commonAppInfo()`, not `prefers-color-scheme`, because the app's
  theme is its own setting. For a dark UI, call `commonSetStatusBarStyle('light')`.
- **Safe area:** use `env(safe-area-inset-*)`, and override `--sat` with
  `commonStatusBarDimensions().height`.

## 2. What each category is good for

| Category | Use it for |
|---|---|
| COMMON | Theme and language (`APP_INFO`); device, country and timezone (`DEVICE_INFO`); small per-domain key/value (`*_ASYNC_STORAGE`); the clipboard; an in-app browser that returns data (`OPEN_BROWSER`) |
| NAVIGATION | Leaving the module (`NAVIGATE_BACK`); opening another module or an app screen (`NAVIGATE_TO`); OS settings such as location permission (`OPEN_DEVICE_SETTINGS`); handing a URL to the OS for share links, maps or tel: (`OPEN_LINK`) |
| VAULT | "Is this a verified person": `VAULT_DOCUMENTS` returns only id, type and country, so it's a cheap signal. ShareRing LINK workflows run inside the module (`VAULT_EXEC_QUERY` with `workflowId`): KYC and identity checks, over-18, nationality, consented details. The DID (`VAULT_VCT_TOKEN_ID`). Email and avatar |
| WALLET | Address and balance, and signing a challenge (`SIGN_ARBITRARY_MESSAGE`) to prove the wallet to your backend. For **writing to the chain** see `ledger.md`: the direct sign events don't work from V2 |
| CRYPTO | Encrypt or decrypt with the user's key (for private notes kept on your server); sign or verify with an expiry (tickets, vouchers) |
| NFT | What the user holds (gating, badges) |
| GOOGLE_/APPLE_WALLET | Tickets, memberships and loyalty cards as wallet passes. Always check `*_CAN_ADD_PASSES` first; Google is false on iOS |

ShareRing's unique hook is that **every user is an ID-verified human**. Features that exploit this:
bot-free leaderboards and votes, one-per-person claims, age-gated access, trust badges, and
country-vs-country aggregates.

## 3. Recipes

**Identity on start-up.** `discover()` in the template's `src/lib/bridge.ts` does the whole
sequence:
1. App info, which decides in-app or the Get ShareRing Me landing, and sets the theme.
2. The status bar.
3. Device info and account (CURRENT, then MAIN).
4. Documents, avatar and balance in parallel.

It publishes an `Identity` store that components read with `useIdentity()`. Extend it rather than
calling the bridge from components.

**See every call (devtools for a phone).** `src/lib/trace.ts` wraps the SDK's transport, so the
module records each bridge message with its payload, its reply and the round trip. `main.tsx`
configures it for the real and the mock transport alike, and the template's You screen lists the
calls. Keep it: it's how you debug on a handset, and shown off (a "behind the scenes" sheet) it
makes a convincing demo of what the module asked for. Entries stay in memory on the phone; never
post them to the server (they hold the avatar, the email and the rest).

**Sign-in to your backend (prove the wallet).**
1. The server issues a nonce.
2. The module calls `walletSignArbitraryMessage(nonce, { timeoutMs: 120000 })`.
3. The module posts `{ address, publicKey, signature }`.

What the reply contains: `publicKey` is base64 of a 33-byte compressed secp256k1 key, and
`ripemd160(sha256(pub))` gives the address. `signature` is base64 of 64 bytes (r||s).

**The message-hash scheme is unknown.** It's not sha256, sha256d, ADR-036, keccak or
personal_sign. So until you've logged a real device's `{message, signature, publicKey}` and found
the scheme offline:
- Check that the pubkey hashes to the address.
- Tie server sessions to a device session token.
- Don't enforce signature verification.

Tie ownership of server records to that session, never to an address the client merely claims.

**ShareRing LINK workflows: identity checks and consented data, inside the module.** This is the
one call for anything that needs LINK: a KYC or identity check, an age or nationality check, or
consented personal details.

```ts
const out = await vaultExecQuery({ workflowId }, { timeoutMs: 20 * 60_000 });
```

- **What happens:** ShareRing Me runs that LINK workflow **over the module**, with its own consent,
  PIN, document and selfie screens. When the person finishes, the promise resolves and they're back
  on your screen. They never leave the module.
- **Don't** hand the workflow's deep link (`sharering://link2/workflow/<id>`) to `navigateOpenLink`.
  That works, but it takes the person out of the module into the app's own flow, and they have to
  find their way back. Keep the deep link only as a fallback button.
- **Where `workflowId` comes from:** a workflow published in the LINK dashboard
  (https://sharering.link), or created through the LINK API. Ask the user for it; never invent one.
- **What comes back:** a workflow answers with its outputs as nested objects, not the legacy
  `[{name, label, value}]` array. For example:
  - `personalInfo.attributes.{first_name, last_name, email}`
  - `identityDocument.{docType, attributes.{number, country, nationality, expiry_date}, photos[]}`
  - `ageVerification.value` (the date of birth)

  Parse defensively and accept the array shape too. This was confirmed live with published
  workflow ids in May 2026.
- **Timeout:** 15–20 minutes. Someone may be scanning an ID and taking a selfie, and the SDK's 60 s
  default will reject while the app is still on screen.
- **A declined consent and a workflow the app can't run fail the same way.** Offer "Try again" plus
  the deep-link fallback. Treat a timeout separately ("we stopped waiting").
- **Matching the run to your own case (KYC for a business).** Don't pass the workflow's own id. Ask
  LINK for a single-use id on your server with `GET /v1/workflows/:id/qr-info?dynamic=true` and pass
  its `dynamicId`. That's the same id the returned `deepLinkUrl` carries, and it becomes the run id,
  so LINK's webhook and delivery tie back to your case. The app accepting a dynamic id here is
  inferred from the deep link rather than documented. On the first device test, beacon the outcome
  to `/api/log` (field names only, never values).
- **Trust:** the values a page hands back can be forged by anyone who fakes the bridge. For
  compliance, use them only as a "finished, go and check" signal. The business relies on LINK's own
  delivery to its server (the workflow's Delivery HTTP node), or polls the run.
- **What an age check returns:** `ageVerification.value` is the date of birth. Don't tell people
  "the module never sees your birthday" unless the workflow is set up to return only a yes or no.
- **The legacy form:** `{ queryId, clientId, ownerAddress }` (with optional `sessionId`,
  `customValue`) is still accepted for queries made before workflows existed. Never mix it with
  `workflowId`; the SDK refuses the mixture. `ownerAddress` is the business's `shareledger1…`
  address, not the user's.
- `VAULT_EXEC_QUERY_SILENT` skips the consent sheet but is PIN-gated.

The template's `runLinkWorkflow(workflowId)` in `src/lib/bridge.ts` does all of the above and
returns `{ ok, data }` or `{ ok: false, reason: 'timeout' | 'declined' }`.

**DID.** Call `vaultVctTokenId({ timeoutMs: 60000 })` once and cache it. It prompts on the first call
per session. Prefix `did:shr:` if it's missing. Never derive the DID from the wallet key; it's a
different key.

**Preferences.** Use `readPref`/`writePref` in `bridge.ts`: app storage in the app, localStorage in a
browser. Keep values small and non-sensitive. Put bulk data (photos, drafts) in IndexedDB.

**Sharing.** There's no native share sheet event, and `navigator.share` may be missing. Use
`SHARE.whatsapp/telegram/x(url, text)`, which calls `navigateOpenLink`, plus
`commonCopyToClipboard({ content, showToastNotification: true })`. Share a public web URL that
renders an OG image and store links (`STORE_LINKS` in `bridge.ts`), so people without the app land
somewhere useful.

**Wallet passes.**
```ts
if (await googleWalletCanAddPasses()) await googleWalletAddPass(signedJwtOrSaveUrl);
```
The JWT is issued by your backend with your Google issuer account.

**In-app browser with a result.** `commonOpenBrowser(url)` resolves when the browser closes. To pass
data back, have the page redirect to `sharering://close?status=success&orderId=…`; the query string
becomes the response. Use it for hosted payment or OAuth pages.

**Another module or app screen.** `navigateTo({ to, params, mode })`. The SDK treats it as
fire-and-forget. What the app does:
- `mode: 'push'` with a URL in `to` opens it in a new V2 WebView (`WEB_VIEW_V2`) and appends
  `?data=<JSON of params>` (so `/`-terminated unless it ends in `.html`).
- Any other `to` is a React Navigation route name, pushed as is. `personal_information` and
  `gov_doc` are mapped to the profile and add-document screens.
- **An unknown route still answers success.** Nothing opens and nothing errors. `WEB_VIEW` (the old
  V1 screen) no longer exists in ShareRing Me v3; see `ledger.md` §1.

**Haptics and sound.** `navigator.vibrate` exists on Android. WebAudio works after a user gesture:
create or resume the AudioContext inside the tap handler.

## 4. What does NOT work (or isn't worth trying)

- PIN-gated events with the SDK's flat payload. For `WALLET_SIGN_TRANSACTION`,
  `WALLET_SIGN_AND_BROADCAST_TRANSACTION` and `CRYPTO_SIGN`, the app reads the request from
  `payload.payload` after the PIN, so send `{ payload: <request> }` (cast it). See `ledger.md` §1.
- `navigateTo({ to: 'WEB_VIEW' })` (the V1 anchor hop): the route is gone in ShareRing Me v3 and the
  call fails silently.
- CosmWasm execute, or custom-module messages (e.g. `shareledger.document`, which needs an issuer
  role), through the app's signer. Only standard bank messages. Put your data in the memo.
- Events the app has but the SDK doesn't type: `COMMON_SET_SECURE_SCREEN` (a no-op today),
  `VAULT_DVCT_TOKEN_ID`, `VAULT_DVCT_TOKEN`, `VAULT_SBT_TOKEN_ID` (returns `''`). Don't build on them.
- Camera or geolocation *through the bridge*: there are no such events. Use the web APIs
  (`getUserMedia`, `navigator.geolocation`); the WebView prompts for permission. If location is
  denied, offer `navigateOpenDeviceSettings('location')`.
- Push notifications, background work, a native share sheet: not available. Design around them.
- Opening devtools on the phone: impossible. Use the `/api/log` beacon (see `testing.md`).

## 5. Framework bindings

- **React:** `@sharering/me-module-sdk/react`
  - `<MeModuleProvider>`
  - `useIsHosted()`: true only after a real answer
  - `useAppInfo()`, `useDeviceInfo()` and `useStatusBarDimensions()` return `{data, error, loading}`
  - `useBridgeQuery(type, payload)`, `useBridgeCall(type)`, `useAsyncStorage()`

  The template uses plain wrappers plus its own `Identity` store, because it wants one ordered
  discovery sequence. Either is fine.
- **Vue:** `@sharering/me-module-sdk/vue`
  - `app.use(createMeModule())`
  - `useReadyState()`, `useAppInfo()` and `useBridgeQuery()` return refs
  - `useBridgeCall()`, `useAsyncStorage()`
- **Anything else:** the plain wrappers from `@sharering/me-module-sdk` are framework-free.
  `configureBridge({ transport: createMockTransport({ responses }) })` from `…/mock` is for
  development.
- Mock replies can be functions of the payload, `(payload, type) => reply`. Use them for the crypto
  and browser events so flows behave like the app, and keep a real key pair in the mock (the
  template's `src/lib/mock.ts`) so a server's key-to-address check passes in development. Load the
  mock replies with a dynamic `import()` behind `import.meta.env.DEV` so production drops them.
- Errors: `BridgeUnavailableError` (no app), `BridgeTimeoutError`, `BridgeResponseError` (the app
  said no), `BridgeValidationError` (bad payload, caught before sending).
