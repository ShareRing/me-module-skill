/**
 * Everything that talks to ShareRing Me, in one place. The SDK already handles the late-injected
 * bridge, per-type queueing, timeouts and duplicate delivery; this file decides WHAT to ask for,
 * in what order, and what happens when nothing answers: the module is APP-ONLY, so a browser gets
 * the Get ShareRing Me landing (screens/GetApp.tsx) and nothing else.
 *
 * Rules baked in here (each one cost someone a debugging session on a real phone):
 *  - Decide "in app or not" only after a real round trip (COMMON_APP_INFO with a timeout), never by
 *    checking window.ReactNativeWebView at start-up: it is injected after the page starts.
 *  - Same-type calls one at a time; different types may overlap.
 *  - Short timeouts for lookups, long (60-120 s) for anything PIN-gated: a human is answering it.
 *  - The user agent may only show the landing SOONER (plainBrowserHint); a bridge answer always wins.
 *  - Preferences live in WebView localStorage, NOT COMMON_WRITE_ASYNC_STORAGE: on webapps bundle
 *    1.1.4 (Oct 2026) a bridge storage write breaks the module's host on that phone ("Coming Soon").
 *  - Some answers are cached or coalesced by the SDK (CACHEABLE: device info, the DID, the wallet-pass
 *    checks; COALESCABLE: most lookups). To re-ask for real, getBridge().invalidate() first (rediscover).
 *  - Optional data (avatar, documents, balance) is decoration: render first, fill in later.
 */
import {
  commonAppInfo,
  commonCopyToClipboard,
  commonDeviceInfo,
  commonSetStatusBarStyle,
  commonStatusBarDimensions,
  navigateBack,
  navigateOpenDeviceSettings,
  navigateOpenLink,
  BridgeTimeoutError,
  getBridge,
  vaultAvatar,
  vaultDocuments,
  vaultExecQuery,
  walletBalance,
  walletCurrentAccount,
  walletMainAccount,
} from '@sharering/me-module-sdk';
import { useSyncExternalStore } from 'react';

/** The dev-only mock bridge is on (see main.tsx). */
export const MOCKED = import.meta.env.DEV && !import.meta.env.VITE_REAL_BRIDGE;

export interface Identity {
  /** null while we are still finding out; false shows the Get ShareRing Me landing. */
  inApp: boolean | null;
  dark: boolean;
  language: string;
  address: string | null;
  pubKey: string | null;
  /** The user holds at least one verified document in their vault (a good "real person" signal). */
  idVerified: boolean;
  avatar: string | null;
  model: string | null;
  /** ISO-2; merchandising only (it loses to a VPN), never compliance. */
  country: string | null;
  timezone: string;
  /** nshr (1 SHR = 1e9 nshr), as a string. */
  balance: string | null;
}

let identity: Identity = {
  inApp: null,
  dark: true,
  language: navigator.language || 'en',
  address: null,
  pubKey: null,
  idVerified: false,
  avatar: null,
  model: null,
  country: null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  balance: null,
};
const subs = new Set<() => void>();
let settle!: () => void;
/** Resolves once in-app vs browser is known (the splash waits on it). */
export const decided = new Promise<void>((r) => (settle = r));
const set = (patch: Partial<Identity>) => {
  identity = { ...identity, ...patch };
  if (identity.inApp !== null) settle();
  subs.forEach((f) => f());
};
export const getIdentity = () => identity;
export const useIdentity = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => identity);

const soft = async <T,>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch {
    return null;
  }
};

/** Set true only once every screen has a designed light variant. */
const FOLLOW_APP_THEME = false;

export function applyTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#050a20' : '#f4f6ff');
}

/**
 * True for user agents that cannot be ShareRing Me's WebView: desktop browsers, Chrome on Android
 * (the app's Android WebView always carries "; wv)"), Safari on iOS (the app's WKWebView has no
 * "Safari/" token). Only a hint to show the landing without the ~7 s wait: never used to decide
 * "in the app", and a late bridge answer still flips inApp to true.
 */
function plainBrowserHint() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return !/\bwv\b/.test(ua);
  return /Safari\/|Firefox\//.test(ua);
}

let firstRun = true;

/** Asks ShareRing Me who is holding the phone. Runs once at start-up; rediscover() runs it again. */
export async function discover(): Promise<Identity> {
  const boot = firstRun;
  firstRun = false;
  // In a plain browser the SDK needs about 7 s to conclude there is no app. The splash holds until
  // this settles; the user-agent hint lets obvious browsers skip the wait.
  if (boot && !MOCKED && plainBrowserHint()) set({ inApp: false });
  const info = await soft(commonAppInfo({ timeoutMs: 7000 }));
  if (!info) {
    // A slow answer on a re-run is not "no app": only the first run decides that.
    if (boot) set({ inApp: false });
    return identity;
  }
  set({ inApp: true, dark: info.darkMode, language: info.language });
  if (boot) {
    // The house look is dark whatever the app's own theme: following a light app setting washes the
    // cinema ground out (and a half-light UI reads as grey on a phone). Offer light as an explicit
    // user choice if you want it: applyTheme(false).
    applyTheme(FOLLOW_APP_THEME ? info.darkMode : true);
    void soft(commonSetStatusBarStyle(FOLLOW_APP_THEME && !info.darkMode ? 'dark' : 'light'));
    void soft(commonStatusBarDimensions({ timeoutMs: 4000 })).then((d) => {
      if (d?.height) document.documentElement.style.setProperty('--sat', `max(env(safe-area-inset-top, 0px), ${d.height}px)`);
    });
  }

  const device = await soft(commonDeviceInfo({ timeoutMs: 6000 }));
  // Current builds answer WALLET_CURRENT_ACCOUNT; older ones only WALLET_MAIN_ACCOUNT.
  const acct = (await soft(walletCurrentAccount({ timeoutMs: 8000 }))) ?? (await soft(walletMainAccount({ timeoutMs: 8000 })));
  set({
    address: acct?.address ?? null,
    pubKey: acct?.pubKey ?? null,
    model: device ? `${device.brand} ${device.model}`.trim() : null,
    country: device?.country && /^[A-Z]{2}$/i.test(device.country) ? device.country.toUpperCase() : null,
    timezone: device?.timezone || identity.timezone,
  });

  const [docs, avatar, bal] = await Promise.all([
    soft(vaultDocuments({ timeoutMs: 8000 })),
    soft(vaultAvatar({ timeoutMs: 8000 })),
    soft(walletBalance({ timeoutMs: 8000 })),
  ]);
  // VAULT_AVATAR is base64, sometimes without the data: prefix.
  const av = typeof avatar === 'string' && avatar.length > 40 ? (avatar.startsWith('data:') ? avatar : `data:image/png;base64,${avatar}`) : null;
  set({
    idVerified: Array.isArray(docs) && docs.length > 0,
    avatar: av,
    balance: Array.isArray(bal) ? bal.find((c) => c.denom === 'nshr')?.amount ?? null : null,
  });
  return identity;
}

/** Runs discovery again with the SDK's caches cleared, so every answer is a fresh round trip. */
export async function rediscover() {
  try { getBridge().invalidate(); } catch { /* older SDKs */ }
  return discover();
}

// --- storage: small preferences only (big data goes in IndexedDB) ----------------------------------

const local = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/**
 * Small preferences, in the WebView's own localStorage (scoped to this module's host, kept across
 * launches). Not COMMON_*_ASYNC_STORAGE: a bridge write breaks the module's host on current app builds
 * (references/testing.md). If you ever read COMMON_READ_ASYNC_STORAGE, send the key as a BARE STRING.
 */
export async function readPref(key: string): Promise<string | null> {
  return local.get(key);
}

export async function writePref(key: string, value: string) {
  local.set(key, value);
}

// --- little actions ---------------------------------------------------------------------------------

export async function copy(text: string): Promise<boolean> {
  // The app answers null on success, so a call that resolves means copied (soft() can't tell null
  // from a failure). The web clipboard is only a fallback: iOS blocks it after an await.
  if (identity.inApp) {
    try {
      await commonCopyToClipboard({ content: text, showToastNotification: true }, { timeoutMs: 6000 });
      return true;
    } catch {
      /* fall back to the web clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Opens a URL with the OS (in the app) or a new tab (in a browser). There is no native share event. */
export function openLink(url: string) {
  if (identity.inApp) void soft(navigateOpenLink(url));
  else window.open(url, '_blank', 'noopener');
}

export const SHARE = {
  whatsapp: (url: string, text: string) => openLink(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`),
  telegram: (url: string, text: string) => openLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`),
  x: (url: string, text: string) => openLink(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`),
};

/**
 * Runs a ShareRing LINK workflow INSIDE the module (identity checks, KYC, age checks, consented
 * details). ShareRing Me shows the workflow's own consent, PIN, document and selfie screens over the
 * module and resolves when the person is done, so they never leave. Handing the workflow's
 * sharering://link2/workflow/<id> deep link to navigateOpenLink instead takes them out of the module;
 * keep that only as a fallback button.
 *
 * - workflowId: a published LINK workflow id, or (to tie the run to your own record) the single-use
 *   `dynamicId` your server got from LINK's qr-info?dynamic=true.
 * - The answer is the workflow's outputs as nested objects (personalInfo, identityDocument...). Anyone
 *   can fake the bridge, so use it as a "finished" signal: your server trusts LINK's own delivery.
 * - A declined consent and a workflow the app can't run fail the same way: offer "Try again".
 */
export type LinkRun = { ok: true; data: unknown } | { ok: false; reason: 'timeout' | 'declined' | 'not_in_app' };
export async function runLinkWorkflow(workflowId: string, timeoutMs = 20 * 60_000): Promise<LinkRun> {
  if (!identity.inApp) return { ok: false, reason: 'not_in_app' };
  try {
    return { ok: true, data: await vaultExecQuery({ workflowId }, { timeoutMs }) };
  } catch (e) {
    return { ok: false, reason: e instanceof BridgeTimeoutError ? 'timeout' : 'declined' };
  }
}

export const openLocationSettings = () => void soft(navigateOpenDeviceSettings('location'));
export const leaveModule = () => void soft(navigateBack({ steps: 1 }));

export const STORE_LINKS = {
  ios: 'https://apps.apple.com/us/app/sharering-me/id6476899324',
  android: 'https://play.google.com/store/apps/details?id=network.sharering.me',
};
