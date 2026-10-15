/**
 * Development only: believable answers for the bridge events a module typically uses, so the whole
 * module runs in a browser tab. main.tsx loads this file only while the mock bridge is on, so none
 * of it ships in a production build. Add a reply for every event your screens use, including the
 * failure paths (the mock transport's `errors` and `silent` options).
 *
 * The wallet below is a real secp256k1 key pair (the private key was thrown away), so a server that
 * checks "does this public key hash to this address" passes in development exactly as on a phone.
 * Function replies receive the request payload, so the crypto and browser events behave like the app.
 */
import type { MockTransportOptions } from '@sharering/me-module-sdk/mock';

const ADDRESS = 'shareledger1678ys56mkj92gvt2zjpznhqessj204yhg26d6r';
const PUBKEY = 'A/K7jfinA1DYASiIP1vFHyV8awEK/sQSG3i5dGMr+LeV';
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s: string) => decodeURIComponent(escape(atob(s)));
/** Not a real signature: 64 deterministic bytes, base64, the shape the app returns. */
const sigOf = (s: string) => {
  let h = 2166136261;
  const out = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < s.length; j++) h = Math.imul(h ^ s.charCodeAt(j) ^ i, 16777619);
    out[i] = h & 255;
  }
  return btoa(String.fromCharCode(...out));
};

type Responses = NonNullable<MockTransportOptions['responses']>;

export const MOCK_RESPONSES: Responses = {
  COMMON_APP_INFO: { language: 'en', version: '4.12.0', id: 'network.sharering.me', darkMode: true },
  COMMON_DEVICE_INFO: { identifier: 'dev-device', brand: 'samsung', model: 'SM-F966B', os: 'Android 16', country: 'AU', timezone: 'Australia/Sydney' },
  COMMON_STATUS_BAR_DIMENSIONS: { top: 0, left: 0, width: 412, height: 28 },
  COMMON_READ_ASYNC_STORAGE: {},
  WALLET_CURRENT_ACCOUNT: { address: ADDRESS, pubKey: PUBKEY },
  WALLET_MAIN_ACCOUNT: { address: ADDRESS, pubKey: PUBKEY },
  WALLET_ACCOUNTS: [{ address: ADDRESS, pubKey: PUBKEY }],
  WALLET_BALANCE: [{ amount: '184500000000', denom: 'nshr' }],
  VAULT_DOCUMENTS: [{ id: 'doc1', type: 'passport', country: 'AU' }],
  // Empty on purpose: test the no-photo look (a designed monogram, never a grey silhouette).
  VAULT_AVATAR: '',
  VAULT_EMAIL: 'alex.tan@example.com',
  VAULT_VCT_TOKEN_ID: 'did:shr:02b4c1f7a9e3d5c7b9a1e3f5d7c9b1a3e5f7d9c1b3a5e7f9d1c3b5a7e9f1d3c5b7',
  NFT_NFTS: [],
  GOOGLE_WALLET_CAN_ADD_PASSES: true,
  APPLE_WALLET_CAN_ADD_PASSES: false,
  WALLET_SIGN_ARBITRARY_MESSAGE: (msg: unknown) => ({ address: ADDRESS, publicKey: PUBKEY, signature: sigOf(String(msg)) }),
  CRYPTO_ENCRYPT: (text: unknown) => `v1.enc.${b64(String(text)).split('').reverse().join('')}`,
  CRYPTO_DECRYPT: (cipher: unknown) => unb64(String(cipher).replace(/^v1\.enc\./, '').split('').reverse().join('')),
  CRYPTO_SIGN: (req: unknown) => {
    const r = req as { data: string; signOptions?: { delimiter?: string; expiration?: { enabled?: boolean; salt?: string } } };
    const d = r.signOptions?.delimiter ?? '|';
    const data = r.signOptions?.expiration?.enabled ? `${r.data}${d}${Math.floor(Date.now() / 1000)}${d}${r.signOptions.expiration.salt ?? ''}` : r.data;
    return { signature: sigOf(data), data };
  },
  CRYPTO_VERIFY: (req: unknown) => {
    const r = req as { data: string; verifyOptions: { signature?: string; delimiter?: string; expiration?: { enabled?: boolean; time?: number } } };
    const d = r.verifyOptions.delimiter ?? '|';
    const parts = r.data.split(d);
    const ts = Number(parts[parts.length - 2]);
    const fresh = !r.verifyOptions.expiration?.enabled || Date.now() / 1000 - ts <= (r.verifyOptions.expiration.time ?? 0);
    return { valid: r.verifyOptions.signature === sigOf(r.data) && fresh, data: parts };
  },
  // The in-app browser resolves with whatever the page passed to sharering://close?...
  COMMON_OPEN_BROWSER: (url: unknown) => {
    const u = new URL(String(url), location.origin);
    return { status: 'success', orderId: u.searchParams.get('order') ?? '77120' };
  },
  // broadcastInApp: a fake hash, so readTx() will not find it on the real chain.
  WALLET_SIGN_AND_BROADCAST_TRANSACTION: { height: 1, transactionHash: '00'.repeat(32), gasUsed: 0, gasWanted: 0, code: 0 },
  // A LINK workflow run inside the module answers with nested outputs (see runLinkWorkflow).
  VAULT_EXEC_QUERY: { personalInfo: { attributes: { first_name: 'Alex', last_name: 'Tan', email: 'alex@example.com' } }, identityDocument: { docType: 'passport', attributes: { country: 'AU' } } },
};
