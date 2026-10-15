// Layout sweep: every route at phone, foldable, tablet and landscape sizes. Fails on any page-level
// scroll, sideways overflow of the page OR of the scrolling pane (.main), and anything wider than the
// viewport. Needs `npm run dev` running.
//   node test/layout.mjs            URL=... ROUTES=/,/you,/get-app OUT=shots node test/layout.mjs
// /get-app is the dev-only preview of the Get ShareRing Me landing that browsers get.
//
// Layouts often break only AFTER an action (a result lands, a second button appears): set
// AFTER_CLICK to a selector and each route is checked again after clicking its first match, e.g.
//   AFTER_CLICK='.actions .btn-primary' ROUTES=/scan,/claim node test/layout.mjs
import { chromium } from 'playwright';
const URL0 = process.env.URL ?? 'http://localhost:5173';
const OUT = process.env.OUT;
const ROUTES = (process.env.ROUTES ?? '/,/you,/get-app').split(',');
const AFTER_CLICK = process.env.AFTER_CLICK;
// 344x882 = Fold cover screen, 749x832 = Galaxy Z Fold 7 inner screen in the WebView (near-square!).
const SIZES = (process.env.SIZES ?? '360x640,375x667,390x844,412x915,430x932,344x882,749x832,832x749,884x1104,1024x768,740x360').split(',');
// Decorative layers (the backdrop, glows, halos) may bleed past the edges on purpose.
const DECOR = '.srh-ground, .srh-glow, .srh-grid, .srh-grain, .halo, #boot';
const b = await chromium.launch();
let bad = 0;

const measure = (p) => p.evaluate((decor) => {
  const d = document.documentElement;
  const main = document.querySelector('.main');
  const wide = [...document.querySelectorAll('body *')].filter((e) => {
    const x = e.getBoundingClientRect();
    return x.width > 0 && x.right > innerWidth + 1 && !e.closest(decor);
  }).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}`).slice(0, 3);
  // A pane that scrolls sideways is as broken as a page that does (halos and long words cause it).
  const paneX = main ? main.scrollWidth - main.clientWidth : 0;
  return { sh: d.scrollHeight, sw: d.scrollWidth, ih: innerHeight, iw: innerWidth, wide, paneX };
}, DECOR);

const report = (s, r, m, tag = '') => {
  const over = m.sh > m.ih + 1 || m.sw > m.iw + 1 || m.wide.length > 0 || m.paneX > 1;
  if (over) bad++;
  const why = over ? `OVERFLOW page ${m.sw}x${m.sh}${m.paneX > 1 ? ` pane +${m.paneX}px sideways` : ''} ${m.wide.join(' | ')}` : 'ok';
  console.log(`${s.padEnd(9)} ${(r + tag).padEnd(14)} ${why}`);
};

for (const s of SIZES) {
  const [width, height] = s.split('x').map(Number);
  const ctx = await b.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { bad++; console.log(`${s} PAGE ERROR ${e.message}`); });
  for (const r of ROUTES) {
    await p.goto(`${URL0}/#${r}`);
    await p.waitForTimeout(1200);
    report(s, r, await measure(p));
    if (OUT) await p.screenshot({ path: `${OUT}/${s}${r.replace(/\//g, '_')}.png` });
    if (AFTER_CLICK) {
      const target = p.locator(AFTER_CLICK).first();
      if (await target.count()) {
        await target.click({ timeout: 3000 }).catch(() => undefined);
        await p.waitForTimeout(2500);
        report(s, r, await measure(p), ' (after)');
        if (OUT) await p.screenshot({ path: `${OUT}/${s}${r.replace(/\//g, '_')}-after.png` });
      }
    }
  }
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} problem(s)` : 'all screens fit');
process.exit(bad ? 1 : 0);
