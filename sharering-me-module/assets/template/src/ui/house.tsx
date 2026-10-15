/**
 * The house-style backdrop and its two engines, shared by the module and the public site:
 *  - the JOURNEY: scenes carry data-bg / data-accent; the ground and accent lerp between adjacent
 *    scene midpoints by the viewport centre (ported from sharering.network's scene-kit.js);
 *  - the REVEAL: .srk-reveal elements fade up as they enter, staggered by position (80 ms, capped).
 */
import { useEffect } from 'react';

const GLYPHS = [
  '<rect x="7" y="9" width="26" height="20" rx="3"/><path d="M12 16h8M12 20h13M12 24h9"/>',
  '<circle cx="20" cy="19" r="10"/><path d="M15 19l4 4 7-7"/>',
  '<rect x="6" y="7" width="28" height="24" rx="4"/><circle cx="20" cy="17" r="4"/><path d="M13 27c2-4 12-4 14 0"/>',
  '<path d="M8 14h24M8 20h16M8 26h20"/>',
  '<path d="M20 7l10 4v7c0 6-4 10-10 12-6-2-10-6-10-12v-7z"/><path d="M16 19l3 3 5-5"/>',
];

export function Backdrop({ cells = 96 }: { cells?: number }) {
  const html = Array.from({ length: cells }, (_, i) => {
    // Glyphs on a sparse, irregular pattern: most cells are empty.
    const g = (i * 7 + (i % 5) * 3) % 17;
    const mark = g < GLYPHS.length ? `<svg viewBox="0 0 40 38" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[g]}</svg>` : '';
    return `<div class="srh-cell">${mark}</div>`;
  }).join('');
  return (
    <>
      <div className="srh-ground" aria-hidden="true" />
      <div className="srh-glow" aria-hidden="true" />
      <div className="srh-grid" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const A = hex(a), B = hex(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

/** Sets the ground and accent directly (route-level scenes); CSS eases the change. */
export function setScene(bg: string, accent: string) {
  const r = document.documentElement.style;
  r.setProperty('--srk-bg', bg);
  r.setProperty('--srk-accent-live', accent);
}

/**
 * The scroll journey over a scroller (window, or a pane like the module's .main). Returns a stop().
 * With no [data-bg] scenes inside, it does nothing and the route-level colour holds.
 */
export function journey(scroller: HTMLElement | Window, root: ParentNode = document) {
  const isWin = scroller === window;
  const el = scroller as HTMLElement;
  let raf = 0;
  const update = () => {
    raf = 0;
    const scenes = Array.from(root.querySelectorAll<HTMLElement>('[data-bg]'));
    const vh = isWin ? innerHeight : el.clientHeight;
    const top = isWin ? scrollY : el.scrollTop;
    const max = Math.max(1, (isWin ? document.body.scrollHeight : el.scrollHeight) - vh);
    document.documentElement.style.setProperty('--srk-parallax', `${Math.round(Math.min(0.999, top / max) * 320)}px`);
    if (!scenes.length) return;
    const base = isWin ? 0 : el.getBoundingClientRect().top;
    const mid = (s: HTMLElement) => s.getBoundingClientRect().top - base + top + s.offsetHeight / 2;
    const centre = top + vh / 2;
    let i = 0;
    let t = 0;
    if (centre >= mid(scenes[scenes.length - 1])) i = scenes.length - 1;
    else if (centre > mid(scenes[0])) {
      for (let k = 0; k < scenes.length - 1; k++) {
        const m0 = mid(scenes[k]), m1 = mid(scenes[k + 1]);
        if (centre >= m0 && centre < m1) { i = k; t = (centre - m0) / Math.max(1, m1 - m0); break; }
      }
    }
    const cur = scenes[i];
    const next = scenes[Math.min(i + 1, scenes.length - 1)];
    // Hold each scene's colour while it's being read and blend only through the middle of the gap:
    // a straight-line blend parks on a muddy in-between (mint into amber reads as sage, a third accent).
    const e = t <= 0.3 ? 0 : t >= 0.7 ? 1 : ((u: number) => u * u * (3 - 2 * u))((t - 0.3) / 0.4);
    const r = document.documentElement.style;
    // Scroll-driven colour must follow the finger, not ease behind it.
    document.documentElement.style.transition = 'none';
    r.setProperty('--srk-bg', mix(cur.dataset.bg!, next.dataset.bg!, e));
    r.setProperty('--srk-accent-live', mix(cur.dataset.accent!, next.dataset.accent!, e));
    requestAnimationFrame(() => { document.documentElement.style.transition = ''; });
  };
  const on = () => { raf ||= requestAnimationFrame(update); };
  scroller.addEventListener('scroll', on, { passive: true });
  addEventListener('resize', on);
  update();
  return () => {
    scroller.removeEventListener('scroll', on);
    removeEventListener('resize', on);
    if (raf) cancelAnimationFrame(raf);
  };
}

/** Fade-up reveals for .srk-reveal inside `root`; re-scans when the DOM changes. */
export function reveal(root: HTMLElement, scrollRoot: HTMLElement | null = null) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return () => undefined;
  document.documentElement.classList.add('js-reveal');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      const idx = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      setTimeout(() => el.classList.add('is-in'), Math.min(idx, 5) * 80);
      io.unobserve(el);
    }
  }, { root: scrollRoot, rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  const scan = () => root.querySelectorAll('.srk-reveal:not(.is-in):not([data-obs])').forEach((el) => { el.setAttribute('data-obs', ''); io.observe(el); });
  scan();
  const mo = new MutationObserver(scan);
  mo.observe(root, { childList: true, subtree: true });
  return () => { io.disconnect(); mo.disconnect(); };
}

export function useJourney(getScroller: () => HTMLElement | Window | null, deps: unknown[]) {
  useEffect(() => {
    const s = getScroller();
    if (!s) return;
    const stopJ = journey(s, s === window ? document : (s as HTMLElement));
    const stopR = reveal(s === window ? document.body : (s as HTMLElement), s === window ? null : (s as HTMLElement));
    return () => { stopJ(); stopR(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * The module's product glyph, in the site's product-lockup line style (thin stroke, rounded).
 * Replace the paths with your own mark; keep it a single-colour line drawing so it sits beside
 * "ShareRing Me", "ShareRing Link" and the other product lockups.
 */
export function ProductGlyph({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="6" width="30" height="36" rx="6" />
      <path d="M17 36h14" />
      <path d="M19 21l4 4 7-8" style={{ stroke: 'var(--srk-accent-live, #2ce5a7)' }} strokeWidth="2.2" />
    </svg>
  );
}
