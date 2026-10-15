/**
 * Writing to and reading from ShareLedger from a Me Module.
 *
 * WRITING. Send the TxBody with `WALLET_SIGN_AND_BROADCAST_TRANSACTION`. ShareRing Me's V2 WebView
 * raises the PIN itself, signs with the user's own key and broadcasts. The module never sees the
 * key. One catch: after the PIN the app reads the transaction from `payload.payload`, so the
 * request must be WRAPPED. The SDK's flat `{ messages, fee }` fails with
 * '"payload" is a required field.'
 *
 *   const body = sendTxBodyHex({ from: address, to: address, memo: 'MyModule v1 root:<hex>' });
 *   const res = await broadcastInApp(body);   // { txHash, height } | { error }
 *
 * The app signs with the MAIN account's key, so `from` must be the main account
 * (`walletMainAccount`); a switched-to sub-account fails on chain.
 *
 * LEGACY. `broadcastViaAnchor` pushes anchor.html into a V1 `WEB_VIEW` screen whose
 * `sign_and_broadcast` signs behind the PIN. Current ShareRing Me (v3) has NO `WEB_VIEW` route, so
 * that navigateTo silently does nothing and no PIN appears. Keep it only as a fallback when
 * `broadcastInApp` answers `unsupported` (an app without the V2 event).
 *
 * Only default Cosmos messages work through this path (MsgSend is the safe choice; CosmWasm
 * execute is rejected before signing; shareledger.document needs an issuer role). Put your data in
 * the MEMO - and put the memo INSIDE the TxBody, because the signer signs the body bytes verbatim.
 *
 * COST. Every tx pays gas (~10000nshr/gas) PLUS a gentlemint action fee (bank_send = 0.01 SHRP,
 * ~6.4 SHR at rate 642). Batch (e.g. a Merkle root of many items in one memo) and show the fee first:
 * GET {LCD}/shareledger/gentlemint/checkFees?address=...&actions=bank_send (no CORS: proxy it).
 *
 * READING. The public Tendermint RPC answers CORS, so a browser can verify a tx itself:
 * /tx?hash=0x<HEX> -> base64 TxRaw (decode with proto.ts), /block?height=N -> block time.
 */
import { navigateTo, walletSignAndBroadcastTransaction } from '@sharering/me-module-sdk';
import { fromBase64, toHex } from './bytes.ts';
import { decodeTxRaw, encodeSendTxBody } from './proto.ts';

export const RPC = 'https://rpc.explorer.shareri.ng';
export const LCD = 'https://lcd.explorer.shareri.ng';
export const EXPLORER = 'https://explorer.shareri.ng';
export const explorerTx = (hash: string) => `${EXPLORER}/transactions/${hash.toUpperCase()}`;

/** A 1 nshr MsgSend (to yourself by default) carrying `memo`, hex-encoded for the app's signer. */
export function sendTxBodyHex({ from, to = from, memo, amount = '1' }: { from: string; to?: string; memo: string; amount?: string }): string {
  if (memo.length > 256) throw new Error('memo too long (Cosmos default max is 256 chars)');
  return toHex(encodeSendTxBody({ from, to, amount, denom: 'nshr', memo }));
}

export type BroadcastResult = { txHash: string; height?: number } | { error: string; unsupported?: boolean };

/**
 * Sign and broadcast through ShareRing Me (PIN prompt over your screen). Persist what you're anchoring
 * first. A declined PIN, a timeout or a chain error comes back as `{ error }`: offer Try again.
 */
export async function broadcastInApp(bodyHex: string, timeoutMs = 5 * 60_000): Promise<BroadcastResult> {
  // Wrapped on purpose: the app reads payload.payload (see the header).
  const request = { payload: { messages: bodyHex, fee: { gasPrice: '10000nshr' } } };
  try {
    const r = await walletSignAndBroadcastTransaction(request as never, { timeoutMs });
    if (!r?.transactionHash) return { error: 'nothing was signed' };
    if (Number(r.code ?? 0) !== 0) return { error: `rejected on chain (code ${r.code})` };
    return { txHash: String(r.transactionHash).toUpperCase(), height: Number(r.height) || undefined };
  } catch (e) {
    const raw = (e as { details?: { raw?: unknown } }).details?.raw;
    const msg = typeof raw === 'string' ? raw : (e as Error).message;
    if (/event not found/i.test(msg)) return { error: msg, unsupported: true };
    if (/confirm password fail/i.test(msg)) return { error: 'PIN not entered, nothing was signed' };
    return { error: msg };
  }
}

/** LEGACY: opens anchor.html in a V1 `WEB_VIEW` screen, a route current ShareRing Me no longer has. */
export async function broadcastViaAnchor(bodyHex: string, opts: { title?: string } = {}): Promise<string> {
  const id = crypto.getRandomValues(new Uint32Array(2)).join('');
  const frag = new URLSearchParams({ id, b: bodyHex, t: opts.title ?? 'Sign on ShareLedger' });
  await navigateTo({ to: 'WEB_VIEW', mode: 'push', params: { source: { uri: `${location.origin}/anchor.html#${frag}` }, title: opts.title ?? 'ShareLedger' } });
  return id;
}

/** Polls localStorage (shared with the anchor page) until it reports back. */
export function waitForBroadcast(id: string, timeoutMs = 10 * 60_000): Promise<BroadcastResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      try {
        const r = JSON.parse(localStorage.getItem(`ledger:${id}`) ?? 'null') as BroadcastResult | null;
        if (r) {
          localStorage.removeItem(`ledger:${id}`);
          return resolve(r);
        }
      } catch { /* keep waiting */ }
      if (Date.now() - started > timeoutMs) return resolve({ error: 'timed out' });
      setTimeout(tick, 1000);
    };
    tick();
  });
}

async function rpc<T>(path: string): Promise<T> {
  const res = await fetch(`${RPC}${path}`, { cache: 'no-store' });
  const j = (await res.json()) as { result?: T; error?: { data?: string } };
  if (!j.result) throw new Error(j.error?.data ?? `rpc ${res.status}`);
  return j.result;
}

/** A transaction as the public ledger sees it (memo, signer, block time). Retries until indexed. */
export async function readTx(hash: string, attempts = 20): Promise<{ height: number; ok: boolean; memo: string; signer: string | null; time: string }> {
  const h = hash.replace(/^0x/i, '').toUpperCase();
  for (let i = 0; ; i++) {
    try {
      const r = await rpc<{ height: string; tx: string; tx_result: { code: number } }>(`/tx?hash=0x${h}`);
      const tx = decodeTxRaw(fromBase64(r.tx));
      const b = await rpc<{ block: { header: { time: string } } }>(`/block?height=${r.height}`);
      return { height: Number(r.height), ok: r.tx_result.code === 0, memo: tx.memo, signer: tx.messages.find((m) => m.from)?.from ?? null, time: b.block.header.time };
    } catch (e) {
      if (i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

/** The newest block: a value nobody could know in advance (proves "not before" for anything that names it). */
export async function latestBlock(): Promise<{ height: number; hash: string; time: string }> {
  const r = await rpc<{ sync_info: { latest_block_hash: string; latest_block_height: string; latest_block_time: string } }>('/status');
  return { height: Number(r.sync_info.latest_block_height), hash: r.sync_info.latest_block_hash.toLowerCase(), time: r.sync_info.latest_block_time };
}
