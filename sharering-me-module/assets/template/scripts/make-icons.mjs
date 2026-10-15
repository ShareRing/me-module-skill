// Renders the registry tile (PNG at 106, 192 and 512; the registry refuses SVG) in the house style:
// deep navy ground, glow, and the module glyph + short name. Run: npm run icons
// Edit GLYPH to change the mark; ICON_LABEL="" renders the glyph alone. The registry copies icons at submission: a new icon needs a new version.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const NAME = process.env.ICON_LABEL ?? JSON.parse(readFileSync(`${root}public/manifest.json`, 'utf8')).short_name;
const GLYPH = `<rect x="9" y="6" width="30" height="36" rx="6" stroke="#edf3ff"/><path d="M17 36h14" stroke="#edf3ff"/><path d="M19 21l4 4 7-8" stroke="#2ce5a7" stroke-width="2.6"/>`;
let font = '';
try { font = `@font-face{font-family:'Inter Tight';font-weight:600;src:url(data:font/woff2;base64,${readFileSync(`${root}node_modules/@fontsource/inter-tight/files/inter-tight-latin-600-normal.woff2`).toString('base64')})}`; } catch { /* system font */ }

const html = (s) => `<html><head><style>${font} html,body{margin:0}
  .t{width:${s}px;height:${s}px;display:grid;place-items:center;align-content:center;gap:${s * 0.04}px;
    background:radial-gradient(70% 70% at 30% 20%,#2a3fb8 0%,#0a2472 42%,#050a20 100%);position:relative;overflow:hidden;font-family:'Inter Tight',sans-serif}
  .t::before{content:'';position:absolute;inset:0;background:radial-gradient(40% 40% at 75% 80%,rgba(44,229,167,.3),transparent 70%)}
  svg{position:relative;width:${s * 0.46}px;height:${s * 0.46}px}
  b{position:relative;color:#edf3ff;font-weight:600;font-size:${s * 0.11}px;letter-spacing:-.02em;display:${s < 150 ? 'none' : 'block'}}
</style></head><body><div class="t"><svg viewBox="0 0 48 48" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPH}</svg><b>${NAME}</b></div></body></html>`;

const b = await chromium.launch();
for (const s of [106, 192, 512]) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(html(s));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${root}public/icon-${s}.png` });
  await p.close();
}
await b.close();
console.log('icons written to public/');
