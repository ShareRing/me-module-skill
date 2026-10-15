import { configureBridge, createWebViewTransport } from '@sharering/me-module-sdk';
import { createMockTransport } from '@sharering/me-module-sdk/mock';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter-tight/latin-400.css';
import '@fontsource/inter-tight/latin-500.css';
import '@fontsource/inter-tight/latin-600.css';
import './ui/house.css';
import './app.css';
import App from './App.tsx';
import { decided } from './lib/bridge.ts';
import { traced } from './lib/trace.ts';

// Every message to and from ShareRing Me goes through the traced transport (src/lib/trace.ts), so the
// module can show a live log of its bridge calls: your devtools on a phone, where there are none.
// In development the transport is the SDK's mock with believable replies (src/lib/mock.ts); set
// VITE_REAL_BRIDGE=1 to talk to a real app instead.
//
// Do NOT swap this guard for a `window.ReactNativeWebView` check: the app injects that object AFTER
// the page starts, so the check loses the race and the module mocks itself on a real phone. The guard
// is spelled out with import.meta.env so a production build drops the mock and its replies entirely.
configureBridge({
  transport: traced(
    import.meta.env.DEV && !import.meta.env.VITE_REAL_BRIDGE
      ? createMockTransport({ latencyMs: 180, responses: (await import('./lib/mock.ts')).MOCK_RESPONSES })
      : createWebViewTransport(),
  ),
});

// Your eyes on a handset: there are no devtools in the app's WebView, so crashes, rejections and a
// boot ping are posted to the backend's /api/log (printed to its console with the viewport and UA).
const report = (kind: string, message: string) => {
  try {
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, message: String(message).slice(0, 2000), ua: navigator.userAgent, w: innerWidth, h: innerHeight }),
      keepalive: true,
    });
  } catch { /* nothing more we can do */ }
};
addEventListener('error', (e) => report('error', `${e.message} @ ${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => report('rejection', String((e.reason as Error)?.stack ?? e.reason)));
report('boot', 'page loaded');

createRoot(document.getElementById('app')!).render(<App />);

// The splash holds until we know whether ShareRing Me is there (the module or the Get ShareRing Me
// landing, never a flash of the wrong one), and at least long enough to read as a moment.
const splash = document.getElementById('boot');
if (splash) {
  void decided.then(() => setTimeout(() => {
    splash.classList.add('out');
    setTimeout(() => splash.remove(), 650);
  }, Math.max(0, 900 - performance.now())));
}
