import { Component, useEffect, type ReactNode } from 'react';
import { discover, useIdentity } from './lib/bridge.ts';
import { armBackGuard, go, savedScroll, useRoute } from './lib/router.ts';
import { Backdrop, setScene, useJourney } from './ui/house.tsx';
import { GetApp } from './screens/GetApp.tsx';
import { Home } from './screens/Home.tsx';
import { You } from './screens/You.tsx';

let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  armBackGuard();
  void discover();
}

/** Each tab is a "scene" with its own ground and accent, as on sharering.network. */
const TABS = [
  { path: '/', label: 'Home', icon: 'M4 11l8-6.5 8 6.5 M6 9.5V20h12V9.5 M10 20v-5.5h4V20', scene: ['#050A20', '#2CE5A7'] },
  { path: '/you', label: 'You', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20a7.5 7.5 0 0 1 15 0', scene: ['#0D1032', '#6E9BFF'] },
] as const;
const GET_APP_SCENE = ['#050A20', '#2CE5A7'] as const;

/** One broken screen never takes the module down: it reports to /api/log and offers a retry. */
class ScreenBoundary extends Component<{ children: ReactNode; screen: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: Error) {
    void fetch('/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'screen', message: `${this.props.screen}: ${e.stack ?? e.message}`, ua: navigator.userAgent, w: innerWidth, h: innerHeight }) }).catch(() => undefined);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page">
        <span className="srk-eyebrow">Something went wrong</span>
        <h1 className="display-m">This screen didn&rsquo;t load.</h1>
        <p className="lede">Check your connection, then try again.</p>
        <div className="actions"><button type="button" className="btn btn-primary" onClick={() => location.reload()}>Try again</button></div>
      </div>
    );
  }
}

export default function App() {
  const route = useRoute();
  const { inApp } = useIdentity();
  const tab = TABS.find((t) => t.path === route.path) ?? TABS[0];
  // App-only: a browser gets the landing and nothing else. /#/get-app previews it in development.
  const gated = inApp === false || (import.meta.env.DEV && route.path === '/get-app');
  const scene = gated ? GET_APP_SCENE : tab.scene;
  useEffect(boot, []);
  useEffect(() => setScene(scene[0], scene[1]), [scene]);
  // Back on a screen the person left earlier: put the pane where it was once the screen is tall
  // enough (sections that draw on entering view can still grow, so keep at it briefly).
  useEffect(() => {
    const y = savedScroll();
    if (!y) return;
    let tries = 0;
    let raf = requestAnimationFrame(function tick() {
      const m = document.querySelector<HTMLElement>('.main');
      if (!m) return;
      const fits = m.scrollHeight - m.clientHeight >= y - 4;
      if (fits || tries % 20 === 19) {
        m.style.scrollBehavior = 'auto';
        m.scrollTop = y;
        m.style.scrollBehavior = '';
      }
      if ((fits && Math.abs(m.scrollTop - y) < 8) || tries++ > 150) return;
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [route.path]);
  // Scroll journey (scenes with data-bg/data-accent) and fade-up reveals inside the scrolling pane.
  useJourney(() => document.querySelector<HTMLElement>('.main'), [tab.path, gated, inApp]);

  // Nothing behind the splash until the bridge has answered (or clearly never will).
  if (inApp === null) return null;
  if (gated) {
    return (
      <div className="app">
        <Backdrop />
        <main className="main"><GetApp /></main>
      </div>
    );
  }

  return (
    <div className="app">
      <Backdrop />
      <nav className="nav" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.path} className={`nav-item ${t === tab ? 'on' : ''}`} onClick={() => go(t.path, true)} aria-current={t === tab ? 'page' : undefined}>
            <span className="nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg></span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>
      <main className="main" key={tab.path}>
        <ScreenBoundary screen={tab.path}>{tab.path === '/you' ? <You /> : <Home />}</ScreenBoundary>
      </main>
    </div>
  );
}
