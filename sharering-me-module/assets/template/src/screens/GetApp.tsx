/**
 * The front door for anyone who reaches the module outside ShareRing Me: a link opened in a phone
 * browser, a desktop tab, a crawler. The module is app-only, so this is ALL a browser ever gets:
 * no guest mode, no module features. Store buttons are ordered for the visitor's platform.
 *
 * Preview it in development at /#/get-app (the mock bridge would otherwise make you "in the app").
 */
import { STORE_LINKS } from '../lib/bridge.ts';
import { ProductGlyph } from '../ui/house.tsx';

type Platform = 'ios' | 'android' | 'desktop';

function platform(): Platform {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  // iPadOS reports a Mac user agent; a touch screen gives it away.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

const STORES = {
  ios: { href: STORE_LINKS.ios, small: 'Download on the', big: 'App Store' },
  android: { href: STORE_LINKS.android, small: 'Get it on', big: 'Google Play' },
} as const;

export function GetApp() {
  const p = platform();
  const order: (keyof typeof STORES)[] = p === 'android' ? ['android', 'ios'] : ['ios', 'android'];
  return (
    <div className="page get-app">
      <header className="top">
        <span className="lockup"><ProductGlyph size={32} /><b>__MODULE_NAME__</b></span>
      </header>
      <span className="srk-eyebrow srk-reveal">Only in ShareRing Me</span>
      <h1 className="display srk-reveal">Open this in <span className="srk-accent">ShareRing Me.</span></h1>
      <p className="lede srk-reveal">
        __SHORT_DESCRIPTION__ It runs inside the ShareRing Me app, where your verified identity and wallet already are.
      </p>
      <div className="actions srk-reveal">
        {order.map((k, i) => (
          <a key={k} className={`btn store ${p !== 'desktop' && i === 0 ? 'btn-primary' : 'btn-ghost'}`} href={STORES[k].href} target="_blank" rel="noopener">
            <span><small>{STORES[k].small}</small>{STORES[k].big}</span>
          </a>
        ))}
      </div>
      {p === 'desktop' && <p className="note srk-reveal">ShareRing Me is a phone app. Get it on your phone, then open __MODULE_NAME__ from inside the app.</p>}
      <ol className="steps">
        {[
          ['Get ShareRing Me', 'Free on the App Store and Google Play.'],
          ['Verify your ID once', 'The app checks your identity document, so modules never ask for it again.'],
          ['Open __MODULE_NAME__ in the app', 'It picks up your verified identity and wallet, with nothing to type.'],
        ].map(([t, d], i) => (
          <li key={t} className="glass card srk-reveal"><span className="step-n">{i + 1}</span><b>{t}</b><p>{d}</p></li>
        ))}
      </ol>
    </div>
  );
}
