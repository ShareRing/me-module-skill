# Testing and debugging

## In a browser (fast loop)

```bash
npm run dev:server &     # backend on the scaffold's port, with /api/log and the dynamic manifest
npm run dev              # http://localhost:5173 with the mock bridge
```

- **Mock bridge:** in `import.meta.env.DEV`, `main.tsx` configures `createMockTransport` with
  believable responses (a real-looking `shareledger1…` address, a balance, a document, dark mode).
  Add a mock reply for every event your screens use, including the failure paths: set a response
  to throw, or simulate a declined PIN, and check that the UI degrades gently.
- `VITE_REAL_BRIDGE=1 npm run dev` disables the mock (for testing through a tunnel on a phone).
- **The app-only gate:** `npm run build && npm run server`, then open `localhost:<port>` in a desktop
  browser. No mock runs, so it must land straight on the Get ShareRing Me page with no errors and
  no module screen or API call behind it. With a phone user agent that isn't obviously a browser
  (DevTools device mode, Android with `; wv)`), the splash holds for about 7 s first. In `npm run dev`,
  preview the landing at `/#/get-app`.

## Automated checks (run before calling anything done)

```bash
npm run typecheck                       # tsc --noEmit
npm run build                           # vite build (index + anchor)
npm run layout                          # needs `npm run dev`; every route x 11 sizes, exits 1 on overflow
ROUTES=/,/you,/new OUT=shots npm run layout   # add your routes; screenshots to ./shots
```

The layout sweep catches page-level scroll, a `.main` pane that scrolls sideways, and anything wider
than the viewport. It ignores the decorative layers (`.srh-*`, `.halo`) and the splash. Layouts often
break only after an action (a result lands, a second button appears), so run it again with
`AFTER_CLICK='<selector of the main action>'`. **Look at the 390×844 and 749×832 screenshots
yourself**: the sweep proves things fit, not that they look good. `npm run shots` (`SCROLL=1`) walks
the scrolling pane one screen at a time, because a full-page capture only ever shows the first screen.

For flows (sign-in, create, anchor), write a small Playwright script in `test/` that clicks
through with the mock bridge and fails on `pageerror`. Use `page.getByRole(...).first()` when a
label appears twice (e.g. hero button plus nav).

## Several builders (people or agents) at once

- Lazy-load each screen and wrap it in an error boundary (the template's `ScreenBoundary`), so one
  broken file doesn't take every screen down. Vite's error overlay and full reloads still disrupt
  screenshot runs: in screenshot scripts, block the HMR socket or wait for a clean page.
- Everyone's browser runs come from one IP: per-IP rate limits (session minting, say) run out.
  Raise them, or skip them for localhost in development.
- `node --watch` can miss a file replaced by `sed -i` (a new inode): touch the file or restart.
- Stop the dev servers your test runs started. Left running, they hold ports for hours, and Vite's
  `host: true` serves them to the whole LAN. Stop them by pid or port: never `pkill -f <pattern>` from
  a command line that contains the pattern (it kills your own shell).

## On a phone

There are no devtools in the app's WebView. The server is your eyes:
- `[hit] /manifest.json okhttp/…` means the app fetched the manifest.
- `[hit] / …wv) AppleWebKit…` means the WebView loaded the page.
- `[client] boot 390x844 …` means JS ran (with the real viewport).
- `[client] error …` / `[client] rejection …` are crashes, with stack traces.
- The ShareRing Me **test build** (`network.sharering.shareringmetest`) writes its React Native console to logcat, so `adb logcat | grep ReactNativeJS` shows what the app did when the server saw nothing (module opens, `processUri`, attestation).

If nothing arrives after adding the custom dApp, the app is using a cached manifest: delete the
entry and add it again (`publishing.md` §4). Headless Chromium doesn't reproduce app caching or
WebView timing, so only a device answers "does it load in the app".

Common device-only failures:

| Symptom | Cause |
|---|---|
| Module never loads, no `[hit] /` | `start_url` not absolute https; cached manifest; legacy keys removed |
| Blank screen, `boot` arrives | Sizing from `innerHeight` at start-up; an early exception (check `[client] error`) |
| Wallet or vault calls always fail | `webview_version` missing (V1 denies them), or a `ReactNativeWebView` check that mocked itself |
| Stored prefs vanish | New hostname = new storage bucket; or a storage key sent wrapped in an object |
| PIN prompt appears, then "timeout" | Timeout under 60 s on a PIN-gated call |
| Canvas crash on some devices | rAF timestamps can trail `performance.now()`: clamp deltas and radii to ≥ 0 |
| Opens once, then "Coming Soon" on every open with no server hit; logcat shows `processUri error TypeError: undefined is not a function` | App bug (webapps bundle 1.1.4, Oct 2026): `commonWriteAsyncStorage` stores an object under the hostname key, and the WebView localStorage restore does `.map` on it. Until fixed, a module that writes prefs through the bridge breaks its host on that phone. Test on a fresh hostname, or keep prefs in WebView `localStorage` |
