// Screenshots for design review. The page never scrolls (only the .main pane does), so a full-page
// capture shows one screen; with SCROLL=1 this also walks the pane one screen at a time.
//   URL=http://localhost:5173 ROUTES=/,/you SIZES=390x844,749x832 OUT=shots SCROLL=1 node test/shoot.mjs
// LOOK at the images afterwards: fitting is not the same as looking right.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL0 = process.env.URL ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? 'shots';
const ROUTES = (process.env.ROUTES ?? '/').split(',');
const SIZES = (process.env.SIZES ?? '390x844,749x832').split(',');
const WAIT = Number(process.env.WAIT ?? 2600);
const SCROLL = process.env.SCROLL === '1';
const MAX = Number(process.env.MAX ?? 8);
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
for (const s of SIZES) {
  const [width, height] = s.split('x').map(Number);
  const ctx = await b.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`${s} PAGE ERROR ${e.message}`));
  for (const r of ROUTES) {
    await p.goto(`${URL0}/#${r}`);
    await p.waitForTimeout(WAIT);
    const name = `${s}${r.replace(/\//g, '_') || '_'}`;
    await p.screenshot({ path: `${OUT}/${name}.png` });
    if (SCROLL) {
      const total = await p.evaluate(() => { const m = document.querySelector('.main'); return m ? Math.ceil(m.scrollHeight / m.clientHeight) : 1; });
      for (let i = 1; i < Math.min(total, MAX); i++) {
        await p.evaluate((k) => { const m = document.querySelector('.main'); if (m) { m.style.scrollBehavior = 'auto'; m.scrollTop = k * m.clientHeight * 0.92; } }, i);
        await p.waitForTimeout(900);
        await p.screenshot({ path: `${OUT}/${name}-${i}.png` });
      }
    }
    console.log(`${s} ${r} ok`);
  }
  await ctx.close();
}
await b.close();
