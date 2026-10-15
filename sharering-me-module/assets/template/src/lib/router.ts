/**
 * Hash routing with no dependency (`#/about?x=1`). Hash routes need no server rewrites and keep
 * the option of offline (zip) mode open. Also arms the Android back-button guard: at the root of our
 * own history a hardware back press would otherwise close the whole module, even from a screen the
 * user only just opened. Overlays (sheets) take a history entry too, so back closes them first.
 */
import { useSyncExternalStore } from 'react';
import { leaveModule } from './bridge.ts';

export interface Route { path: string; parts: string[]; q: URLSearchParams }

const hashNow = () => location.hash || '#/';

function parse(): Route {
  const [path, qs] = hashNow().replace(/^#/, '').split('?');
  const clean = path.startsWith('/') ? path : '/';
  return { path: clean, parts: clean.split('/').filter(Boolean), q: new URLSearchParams(qs ?? '') };
}

let current = parse();
let lastHash = hashNow();
let depth = 0;
/** Set while our own go() changes the hash: Chromium fires popstate for it, which is not a back press. */
let selfNav = false;
const subs = new Set<() => void>();

// --- scroll memory: coming back to a screen puts the pane where the person left it ---------------
const scrolls = new Map<string, number>();
const pane = () => document.querySelector<HTMLElement>('.main');
function rememberScroll() {
  const m = pane();
  if (m) scrolls.set(hashNow(), m.scrollTop);
}
/** Where the pane was when the person last left this screen (0 if never). */
export const savedScroll = (hash = hashNow()) => scrolls.get(hash) ?? 0;

addEventListener('hashchange', () => {
  selfNav = false;
  lastHash = hashNow();
  current = parse();
  subs.forEach((f) => f());
});

export const useRoute = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => current);
export const getRoute = () => current;

export function go(to: string, replace = false) {
  if (`#${to}` === hashNow()) return;
  rememberScroll();
  selfNav = true;
  if (replace) location.replace(`#${to}`);
  else {
    depth++;
    location.hash = to;
  }
}

export function back(fallback = '/') {
  if (overlays.length) return closeTopOverlay();
  // The popstate handler counts the step back, exactly as it does for the hardware button.
  if (depth > 0) history.back();
  else go(fallback, true);
}

// --- overlays: a sheet pushes a history entry so the hardware back button closes it -------------

const overlays: (() => void)[] = [];

/** Registers an open overlay. Returns a function that closes it through history (use it for UI close). */
export function pushOverlay(onClose: () => void): () => void {
  overlays.push(onClose);
  history.pushState({ overlay: overlays.length }, '', hashNow());
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const i = overlays.indexOf(onClose);
    // Still on the stack: go back, and the popstate handler below closes it.
    if (i >= 0) history.back();
  };
}

/** Forgets an overlay that went away by itself (unmounted on a route change), without going back. */
export function dropOverlay(onClose: () => void) {
  const i = overlays.indexOf(onClose);
  if (i >= 0) overlays.splice(i, 1);
}

function closeTopOverlay() {
  history.back();
}

export function armBackGuard() {
  if (!location.hash) history.replaceState(null, '', '#/');
  // One spare entry, so the first hardware-back press lands on us rather than on the host.
  history.pushState(null, '', hashNow());
  addEventListener('popstate', () => {
    // Our own go() changed the hash: not a back press.
    if (selfNav) {
      selfNav = false;
      return;
    }
    // An overlay is open: this back press closes it and nothing else.
    if (overlays.length) {
      const close = overlays.pop()!;
      close();
      return;
    }
    // popstate fires before hashchange, so lastHash is still the screen we were on.
    if (lastHash === '#/' && hashNow() === '#/') {
      history.pushState(null, '', '#/');
      leaveModule(); // genuinely done: let ShareRing Me close us
      return;
    }
    depth = Math.max(0, depth - 1);
  });
}
