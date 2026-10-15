# UI: WebView layout, foldables, and the ShareRing house style

## Contents
1. Layout rules for the WebView
2. Phones, foldables, tablets, landscape
3. The house style ("cinema", as on sharering.network)
4. Using the template's kit
5. Copy: short, confident, not wordy
6. Performance

## 1. Layout rules for the WebView

- **Never size from JS `innerHeight` at start-up.** A WebView can report 0 before layout, and with
  `overflow: hidden` that's a blank screen. Use `html, body, #app { height: 100% }` and flex.
- **The page never scrolls; panes do.** The app shell is a flex column: one `.main` pane with
  `flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain`, plus a fixed nav. Long
  lists scroll inside themselves. `npm run layout` fails the build on any page-level scroll or
  sideways overflow.
- **Full-screen tools** (camera, map, game) fit exactly with no scroll. One region flexes with
  `min-height: 0`, and `max-height` media queries hide secondary details on short screens.
- **Safe areas:** the `--sat/--sab/--sal/--sar` CSS variables come from `env(safe-area-inset-*)`, and
  `discover()` overrides `--sat` from `COMMON_STATUS_BAR_DIMENSIONS`. Pad the top of the first
  scene and the bottom of the nav with them.
- **Tap targets:** 44–52 px minimum. Primary actions go in the thumb zone (bottom half) on phones.
- **Theme:** stay dark whatever ShareRing Me's own theme is (`FOLLOW_APP_THEME = false` in
  `bridge.ts`). Following a light app setting half-converts the cinema look, and on a phone the nav
  reads as a washed-out grey slab. Offer light only as an explicit user setting, once every screen
  has a designed light variant. Keep hero visuals (devices, proof cards) dark in both themes by
  setting their own text tokens.
- **Nav and rail:** cut the panel from the scene's own ground (`--nav-ground`, a darkened
  `--srk-bg`), not a translucent grey. Mark the current tab with an accent pill and, on the rail, a
  glowing edge bar. Inactive labels at about 62% white, never the tertiary grey.
- **Stores:** a `useSyncExternalStore` selector must return a stable value. `s.x ?? []` creates a
  new array each call and loops forever ("Maximum update depth exceeded"). Select the raw value and
  default outside: `useApp((s) => s.x) ?? EMPTY`.
- **Android back:** `armBackGuard()` (in `router.ts`) keeps the hardware back button from closing
  the module from a sub-screen. At the root it calls `navigateBack` to leave. Use `go()` and
  `back()` for navigation. Hash routes (`#/path`) need no server rewrites and keep offline mode
  possible.
  - Chromium fires `popstate` for the hash change `go()` makes. The router ignores that one
    (`selfNav`); without it the back stack drifts, `back()` replaces instead of stepping back, and
    the next hardware back press does nothing.
  - **Sheets and dialogs take a history entry** (`pushOverlay()`), so back closes the sheet rather
    than the screen, or the whole module at the root. Close them through history too
    (`history.back()`): flipping state alone leaves a stray entry behind.
  - **Scroll memory:** coming back to a screen should land where the person left it. The router
    saves `.main.scrollTop` per hash in `go()` and App restores it once the screen is tall enough.
- **Nothing may widen the pane.** Halos and glows that bleed past their box make `.main` scroll
  sideways (clip the screen root with `overflow-x: clip`). A result that adds a second button can
  push a grid column wider than a narrow pane: use `minmax(0, 1fr)` columns and let action rows wrap.
  The layout sweep checks the pane too, and `AFTER_CLICK` re-checks after each screen's main action.

## 2. Phones, foldables, tablets, landscape

Test sizes, all in `test/layout.mjs`:
- Phones: 360×640, 375×667, 390×844, 412×915, 430×932.
- Fold cover screen: 344×882.
- **Galaxy Z Fold 7 inner screen in the WebView: 749×832**. It's near-square; design for it, not just
  tall phones.
- 832×749, 884×1104 tablet, 1024×768, and 740×360 landscape phone.

One breakpoint does most of the work:

```css
@media (min-width: 600px) and (min-aspect-ratio: 5/6) {
  .app { flex-direction: row; }           /* bottom nav becomes a side rail */
  .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  /* two-pane: list + detail, viewfinder + controls, map + sheet */
}
```

On a foldable, use the extra width for a **second pane** (detail beside list, controls beside a
viewfinder), not for bigger margins. Use `clamp()` for display type so headlines scale between
40 px and 68 px.

## 3. The house style ("cinema", as on sharering.network)

ShareRing's current website (the products and solutions pages) is dark, cinematic and in motion.
Modules should feel like part of it:

- **Scenes, not pages.** Each section is a full-bleed scene with its own ground colour and accent.
  As the user scrolls, the ground and accent **lerp** between adjacent scenes (the "journey"). Each
  tab or route can also set its own scene.
- **Ground:** a fixed dark ground; two slow radial **glows** drifting on 67 s and 89 s loops; a faint
  **grid of line glyphs** (shield, check, card, person) with parallax.
- **Palette** (ground / accent pairs):
  - Brand default: `#050A20` / `#2CE5A7` (mint).
  - Blues: `#06142E` / `#6E9BFF`, and `#0A1330` / `#7FB2FF`. The Prove page runs `#071A38` / `#3D8BFF`,
    `#0A1F3F` / `#5C9DFF` and `#040F26`; ShareLedger adds `#050E1E` / `#5FD0FF`.
  - A **warm "problem" scene**: `#1C1020` / `#F0B366`. Use it when you name the pain before the
    solution.
  - Mint buttons carry dark ink `#02311F`. Text is `#EDF3FF`, with 72% and 52% alpha for secondary
    and tertiary.
- **Type:** Inter Tight. Display 600 weight, `letter-spacing: -0.03em`, `line-height: 1.02`, and
  `text-wrap: balance`. Eyebrows are 12.5 px uppercase with 0.16em tracking, in the accent colour.
  **One big line with an accent phrase:** "Stamps that *can't be faked.*"
- **Glass cards:** `rgba(10,36,114,.42)` fill, `1px rgba(77,138,255,.22)` border, 6 px blur, 18 px
  radius.
- **Pills:** 52 px-high, fully rounded buttons. Primary is the accent with dark ink and a soft
  accent shadow. Secondary is an outline.
- **Motion:** content fades up 18 px over 700 ms (`cubic-bezier(.22,1,.36,1)`), staggered 80 ms. A
  springy press (`scale(.97)`). A bouncing chevron hints at more below. Respect
  `prefers-reduced-motion`.
- **Product lockup:** a thin-stroke, rounded line glyph plus the module name at weight 500, to sit
  beside "ShareRing Me" and "ShareRing Link".
- **The WOW moment:** each module should have one hero visual that shows the value, not describes
  it: a real photo being sealed, a card that tilts, a proof that ticks green, a stamp that lands.
  Real-looking imagery (generated with an image model if the `imagegen` skill is available: no
  people, plates or logos) beats abstract art for trust. Ship it as ~720 px WebP in `public/`.
- **Trust signals:** show live, checkable facts rather than claims. For example, the current
  ShareLedger block height from the public RPC with a pulsing "mainnet" dot, linking to the
  explorer.
- **Tilt without blur:** CSS `perspective` on a card at rest makes Chrome draw its text soft. Apply
  perspective only while the card turns, and keep resting text out of a 3D context.
- **The colour journey holds, then blends:** blend only through the middle of the gap between two
  scenes (the template eases `t` with a smoothstep from 0.3 to 0.7). A straight-line blend parks on
  muddy in-betweens while people read: mint into amber passes through a sage that reads as a third
  accent.
- **Product names stay whole.** "ShareProtect" or "ShareRing" must never break across lines. Size big
  type to the longest word (`font-size: min(…, calc(<column width> / (<longest word length> * 0.55)))`)
  instead of adding break points.
- **Motion that runs by itself stops:** carousels and cycling examples pause under
  `prefers-reduced-motion` and once someone taps one. Don't put `role="status"` on counters that tick
  many times a second (it floods screen readers): announce the final value once.
- **Splash:** `index.html` has an inline splash (ground, glow, lockup, a progress bar) that shows
  before JS loads, then dissolves once the bridge has decided in-app or landing (`decided` in
  `bridge.ts`), so neither ever flashes the other. Keep it inline:
  no network requests before first paint.

## 4. Using the template's kit

| Piece | Where | What |
|---|---|---|
| `<Backdrop />` | `src/ui/house.tsx` | Fixed ground, glows and glyph grid. Render once, first child of `.app` |
| `setScene(bg, accent)` | same | Route-level scene; CSS eases the change (`@property` colours) |
| `useJourney(getScroller, deps)` | same | Scroll journey over `[data-bg][data-accent]` scenes, plus `.srk-reveal` fade-ups, inside the scrolling pane |
| `<ProductGlyph />` | same | The module's mark. Replace the paths; keep it a single-colour line drawing |
| `.scene`, `.display`, `.display-m`, `.lede`, `.srk-eyebrow`, `.srk-accent` | `app.css` / `house.css` | Scene layout and type |
| `.glass`, `.card`, `.cards`, `.btn-primary`, `.btn-ghost`, `.pill`, `.facts` | `app.css` | Components |
| `.nav` / `.nav-item` | `app.css` | Bottom nav on phones, side rail at the foldable breakpoint |

A new screen is a component in `src/screens/` returning one or more
`<section className="scene" data-bg=… data-accent=…>`, plus an entry in `TABS` (or a `go()` route)
in `App.tsx`. Add `srk-reveal` to things that should fade in.

When the user's brand isn't ShareRing's (a partner's module), keep the structure and motion but
swap the palette pairs and the glyph. Don't hard-code the mint anywhere except the tokens.

## 5. Copy: short, confident, not wordy

- A headline of 3–6 words, with the accent phrase carrying the promise.
- A lede of one sentence, 20 words at most. Card bodies of one sentence.
- Buttons are verbs: "Seal photos", "Collect stamp", "Verify". Not "Click here to…".
- No explanations of blockchain on the main path. Say "Recorded on ShareLedger" plus a link to the
  explorer for those who care.
- Name the pain once (warm scene), show the fix (mint scene), then get out of the way.
- Claim only what the module really does. If the server can't verify a signature, a vote is "one per
  wallet, approved with a PIN", not "bot-proof". Experiments that run in the page (camera, sound)
  don't "call ShareRing Me".

## 6. Performance

- The first paint is the inline splash; JS parses behind it. Keep the main bundle lean: React plus
  the SDK is about 80 KB gzipped. Lazy-load heavy screens with `import()` (camera, maps, charts).
- Self-host fonts (`@fontsource/inter-tight`, Latin subsets 400/500/600). No Google Fonts request
  from inside the WebView.
- Animate `transform` and `opacity` only. The backdrop is fixed and GPU-composited; don't add
  scroll listeners that set layout properties.
- Big data (photos, drafts) goes in IndexedDB, not app storage or localStorage.
