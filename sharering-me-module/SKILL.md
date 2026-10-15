---
name: sharering-me-module
description: Build ShareRing Me Modules (web apps that run inside the ShareRing Me app's WebView and use @sharering/me-module-sdk). Covers scaffolding a new module, bridge events (wallet, vault/identity, storage, navigation, crypto, wallet passes), writing to and verifying on ShareLedger, layouts for phones and foldables, ShareRing's "cinema" house style, hosting and testing as a custom dApp, and submitting to the developer portal. Use it whenever the user mentions a Me Module, MeModule, ShareRing Me dApp or mini-app, @sharering/me-module-sdk, a manifest.json for ShareRing, a custom dApp, the ShareRing developer portal, or wants to build something that uses a ShareRing verified identity or wallet in the app. Also use it when the user asks to fix, port, restyle or debug an existing Me Module, even if they don't say "Me Module".
---

# Building ShareRing Me Modules

A Me Module is a web app served from the root of its own HTTPS host. ShareRing Me loads it in a
WebView and exposes the user's ID-verified identity, vault, wallet and device through a message
bridge (`@sharering/me-module-sdk`). Every user is already a **verified human**, so build
features that use that: bot-free votes and leaderboards, one-per-person claims, age gates, trusted
profiles, proofs on ShareLedger.

Most of what makes a module work on a real phone isn't in the official docs. It was learned on
devices and is baked into this skill's template and references. Start from the template rather
than from scratch, because each file carries a fix for something that failed on a handset.

## Workflow

### 1. Understand the module (briefly)

Get just enough to build something impressive:
- What it does and for whom.
- Which ShareRing powers it needs: identity, wallet, chain writes, LINK workflows (identity
  checks, KYC, consented details), wallet passes.
- Its name.
- Whether it has a backend.

If the user gave a one-liner, make sensible choices and state them; don't interrogate. Decide
early whether it **writes to ShareLedger**. That decides whether to keep the ledger kit.

### 2. Scaffold

```bash
node <skill-dir>/scripts/new-module.mjs --dir <path> --name "<Module Name>" \
  --short-description "<= 80 chars" --headline "<first part>|<accent phrase>" \
  [--domain host.example.com] [--no-ledger] --install [--icons]
```

- `<skill-dir>` is the directory this SKILL.md is in.
- `--domain` defaults to `<slug>.example.com`: pass your module's real host.
- The backend port defaults to the first free port from 8791.
- `--no-ledger` drops the chain-write kit.
- `--icons` renders labelled icons after install. The default icons are a generic glyph.
- The script warns when the name exceeds 30 characters, the short_name 12, or the
  short_description 80.

The result:
- React 19 + Vite + TypeScript.
- A dev-only mock bridge.
- Identity discovery, and an app-only gate: browsers get a "Get ShareRing Me" landing page.
- A hash router with an Android back guard.
- A client error beacon.
- A dynamic `manifest.json` server.
- The house style.
- A layout sweep test.
- Docker/compose.
- A quick-tunnel script.
- If the ledger kit is kept: the ShareLedger write/read kit and a Merkle helper.

To use another stack (Vue, vanilla, Next.js, a non-Node backend), scaffold anyway for the
manifest, server, icons and tests, then read `references/frameworks.md`.

### 3. Build the screens

- Screens live in `src/screens/`, and tabs in `TABS` in `src/App.tsx`.
- Bridge access goes through `src/lib/bridge.ts`: extend `Identity` and `discover()` rather than
  calling the SDK from components. Every message is recorded by the traced transport
  (`src/lib/trace.ts`), and the You screen lists them: keep that, it's your devtools on a phone.
- Navigate with `go()`/`back()` from `src/lib/router.ts`. Give every sheet or dialog a history entry
  with `pushOverlay()`, so the Android back button closes it instead of the screen.
- Replace the starter copy and cards with the module's real value. Give it one **hero moment**:
  something that *shows* the value, like a live mock, a stamp landing or a proof turning green.

Read the reference that matches the work:

| Doing this | Read |
|---|---|
| Any bridge call (identity, storage, share, sign, vault query, passes) | `references/bridge.md`; exact shapes in `references/sdk-catalogue.md` |
| An identity check, KYC, age check or consented details through ShareRing LINK | `references/bridge.md` §3 (LINK workflows); the server side in `references/backend.md` §2 |
| Recording anything on chain, fees, verification pages, Merkle batching | `references/ledger.md` |
| Layout, foldables, safe areas, styling, motion, copy | `references/ui.md` |
| Server routes, sessions, ownership, share pages, webhooks | `references/backend.md` |
| A stack other than React, porting an existing app | `references/frameworks.md` |

### 4. Rules to follow even if you read nothing else

These break silently on a phone while working perfectly in a browser. The reason matters,
because it tells you what to do in cases the list doesn't cover.

1. **Decide in-app vs browser with a real round trip** (`commonAppInfo({timeoutMs: 7000})`), never
   by checking `window.ReactNativeWebView`. The app injects that object after the page starts. For
   the same reason, the mock transport is guarded by `import.meta.env.DEV` only.
2. **App-only.** A module works only inside ShareRing Me. When the bridge doesn't answer, show the
   template's Get ShareRing Me landing (`src/screens/GetApp.tsx`: store buttons ordered for the
   visitor's platform) and nothing else. No guest mode, and no module features, data or API calls
   in a browser. Keep the gate in `App.tsx` when you add screens. The splash holds until the round
   trip decides; a user-agent hint may show the landing sooner, but a bridge answer always wins.
   The gate is the front door, not security: enforce anything sensitive on the server
   (`references/backend.md` §3).
3. **Bare-string payloads** for `commonReadAsyncStorage('key')`, `commonSetStatusBarStyle`,
   `commonOpenBrowser`, `navigateOpenLink` and `walletSignArbitraryMessage`. An object is silently
   accepted and returns nothing on the device.
4. **Timeouts:** 4–8 s for lookups, 60–120 s for anything PIN- or consent-gated, where a human is
   answering. A declined prompt is a soft failure with a "Try again".
5. **Accounts:** try `walletCurrentAccount` first, then fall back to `walletMainAccount`. Parse
   responses defensively. Addresses start `shareledger1`.
6. **Chain writes:** `broadcastInApp()` in `src/lib/ledger.ts`: a MsgSend to self from the main
   account with the data in the memo, and the fee shown first. It calls
   `walletSignAndBroadcastTransaction` with the request **wrapped** in `{ payload: … }` (the app
   reads `payload.payload`; the flat SDK shape fails). Never `navigateTo({ to: 'WEB_VIEW' })`:
   ShareRing Me v3 has no such route, so nothing opens and no PIN appears.
7. **Layout:** never size from `innerHeight`. `height: 100%` and flex. The page never scrolls; only
   panes do. It must fit 360×640 through the Fold 7 inner screen (749×832) and landscape.
8. **Manifest:** `start_url` is the absolute `https://host/` root (served dynamically). Keep
   `webview_version: "WEB_VIEW_V2"` and the legacy keys. PNG icons. Bump `version` on every
   release.
9. **No native share event:** share with `navigateOpenLink` to wa.me, t.me or x.com intent URLs,
   and the clipboard.
10. **Never** ask for, accept, store or log a private key or mnemonic.
11. **LINK checks stay in the module.** Run a ShareRing LINK workflow with
    `runLinkWorkflow(workflowId)` (`vaultExecQuery({ workflowId })` with a 15–20 minute timeout).
    The app shows the check over the module and hands back when it's done. Handing the
    `sharering://link2/workflow/…` deep link to `navigateOpenLink` takes the person out of the
    module; keep that only as a fallback button. The returned values are a "finished" signal, not
    evidence.
12. **Preferences live in WebView `localStorage`.** Don't write through
    `COMMON_WRITE_ASYNC_STORAGE`: on current app builds one bridge storage write breaks the module's
    host on that phone, which then shows "Coming Soon" and never loads (`references/testing.md`).

### 5. Verify before saying it's done

```bash
npm run typecheck && npm run build
npm run dev:server & npm run dev &      # then:
ROUTES=/,/you,/get-app,<your routes> OUT=shots npm run layout
AFTER_CLICK='<main action selector>' ROUTES=<your routes> npm run layout   # after a result lands
SCROLL=1 ROUTES=<your routes> OUT=shots npm run shots                      # walk the scrolling pane
```

- The layout sweep must print `all screens fit`, both times.
- Open the 390×844 and 749×832 screenshots and look at them: fitting isn't the same as looking
  right.
- Exercise the main flow once with the mock bridge. Build and run the server without the mock,
  open it in a desktop browser, and check that it lands on the Get ShareRing Me page with no errors
  and no module screens behind it.
- See `references/testing.md` for flow tests and the phone-debugging table.

### 6. Host and hand over

Pick the hosting route with `references/publishing.md`:
- Docker with the template's `compose.yaml` behind your own HTTPS reverse proxy (Traefik labels
  included).
- `./scripts/serve-tunnel.sh` for a quick test.
- Any HTTPS host.

Then tell the user:
- The URL and the manifest URL.
- **Which network** it targets. It's ShareLedger mainnet unless you changed RPC/LCD, so it opens in
  the production ShareRing Me app.
- The custom dApp steps: Settings → Developer Tool → Add Custom dApps. Delete and re-add the entry
  after every manifest change.
- What to watch in the server log.
- The release checklist items still open before a portal submission.

## When modifying an existing module

Read its `manifest.json`, its bridge wrapper and its layout CSS first, and check them against
rules 1–8. Most "works in the browser, broken in the app" reports are one of them. See the symptom
table in `references/testing.md`.

## Keeping the skill current

`references/sdk-catalogue.md` is generated from the installed SDK. After an SDK upgrade, run
`node <skill-dir>/scripts/dump-events.mjs <module-dir> > <skill-dir>/references/sdk-catalogue.md`.
The field notes in the other references reflect SDK 0.1.x on Android (Galaxy Z Fold 7) as of
September 2026; iOS is less tested.
