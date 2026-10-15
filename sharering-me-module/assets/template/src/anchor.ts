/**
 * The V1 anchor page (see src/lib/ledger.ts). Runs inside ShareRing Me's legacy V1 WEB_VIEW, which
 * can sign and broadcast: it sends `sign_and_broadcast` with the hex TxBody, the app raises the PIN,
 * and replies by calling window.onMessageFromApp(json) with { type, status, data } where `data` is
 * URI-encoded JSON { height, transactionHash, gasUsed, gasWanted, code } or { error }.
 * The result is left in localStorage (same origin as the module) and we go back.
 */
type V1Reply = { type: string; status: boolean; data: unknown };
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (s: string) => void };
    onMessageFromApp?: (raw: string) => void;
  }
}

const q = new URLSearchParams(location.hash.slice(1));
const id = q.get('id') ?? '';
const body = q.get('b') ?? '';
const title = q.get('t') ?? 'Sign on ShareLedger';
const root = document.getElementById('anchor')!;

document.head.insertAdjacentHTML('beforeend', `<style>
  html,body{margin:0;height:100%;background:#050a20;color:#edf3ff;font:16px/1.5 'Inter Tight',system-ui,-apple-system,sans-serif}
  main{min-height:100%;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:radial-gradient(120% 70% at 50% 0%,#0a2472 0%,#050a20 70%)}
  .c{max-width:420px;display:grid;justify-items:center;gap:12px;text-align:center}
  .r{width:96px;height:96px;border-radius:50%;border:3px solid rgba(234,240,255,.15);border-top-color:#2ce5a7;animation:s 1s linear infinite}
  .done .r,.fail .r{animation:none}.done .r{border-color:#2ce5a7}.fail .r{border-color:#ff6057}
  @keyframes s{to{transform:rotate(360deg)}}
  h1{margin:8px 0 0;font-size:24px;font-weight:600;letter-spacing:-.02em}p{margin:0;color:rgba(234,240,255,.72)}
  code{font:12px ui-monospace,monospace;color:rgba(234,240,255,.52);word-break:break-all}
  button{font:inherit;font-weight:600;border:0;border-radius:999px;min-height:46px;padding:0 22px;margin:4px}
  .p{background:#2ce5a7;color:#02311f}.g{background:transparent;color:#edf3ff;border:1px solid rgba(234,240,255,.32)}
</style>`);

const post = (m: object) => window.ReactNativeWebView?.postMessage(JSON.stringify(m));
const goBack = () => post({ type: 'go_back' });
/** Everything written into the page is escaped: the title comes from the URL, the rest from the app. */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const leave = (r: object) => { try { localStorage.setItem(`ledger:${id}`, JSON.stringify(r)); } catch { /* ignore */ } };

function render(state: 'wait' | 'pin' | 'done' | 'fail' | 'nobridge', detail = '') {
  const h = { wait: 'Connecting…', pin: title, done: 'Done', fail: 'Not signed', nobridge: 'Open from the module' }[state];
  const p = { wait: '', pin: 'Approve with your PIN. The network fee is paid from your wallet.', done: 'Recorded on ShareLedger. Taking you back…', fail: detail || 'Cancelled.', nobridge: 'This page only works inside ShareRing Me.' }[state];
  root.innerHTML = `<div class="c ${state}"><div class="r"></div><h1>${esc(h)}</h1><p>${esc(p)}</p>${state === 'done' ? `<code>${esc(detail)}</code>` : ''}
    <div>${state === 'fail' ? '<button class="p" id="retry">Try again</button>' : ''}${state !== 'done' ? '<button class="g" id="back">Back</button>' : ''}</div></div>`;
  document.getElementById('retry')?.addEventListener('click', send);
  document.getElementById('back')?.addEventListener('click', () => { leave({ error: 'Cancelled' }); goBack(); });
}

function send() {
  render('pin');
  post({ type: 'sign_and_broadcast', data: { msg: body } });
}

function onReply(r: V1Reply) {
  if (r.type !== 'sign_and_broadcast') return;
  let data = r.data as Record<string, unknown> | string | null;
  if (typeof data === 'string') { try { data = JSON.parse(decodeURIComponent(data)); } catch { /* as is */ } }
  const d = (data ?? {}) as { transactionHash?: string; height?: number; code?: number | string; error?: string };
  if (!r.status || !d.transactionHash || (d.code !== undefined && Number(d.code) !== 0)) {
    const error = d.error ?? (d.code ? `Rejected by the chain (code ${d.code})` : 'Cancelled');
    leave({ error });
    return render('fail', error);
  }
  leave({ txHash: d.transactionHash, height: d.height });
  render('done', d.transactionHash);
  setTimeout(goBack, 1600);
}

window.onMessageFromApp = (raw: string) => { try { onReply(JSON.parse(raw) as V1Reply); } catch { /* not ours */ } };
// Replies come from the app (no source, or this window). Anything posted by another window (a page
// framing this one) is ignored: it must never be able to fake a result.
const onMessage = (e: Event) => { const m = e as MessageEvent; if (m.source && m.source !== window) return; const x = m.data; if (typeof x === 'string') { try { onReply(JSON.parse(x) as V1Reply); } catch { /* not ours */ } } };
addEventListener('message', onMessage, true);
document.addEventListener('message', onMessage);

(async () => {
  if (!id || !body || !/^[0-9a-f]{20,2000}$/i.test(body)) return render('fail', 'Nothing to sign.');
  render('wait');
  for (let i = 0; i < 60 && !window.ReactNativeWebView; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.ReactNativeWebView) return render('nobridge');
  await new Promise((r) => setTimeout(r, 300));
  send();
})();

export {};
