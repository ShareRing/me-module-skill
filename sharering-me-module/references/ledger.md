# Writing to and reading from ShareLedger

The template ships a working kit (skip it with `--no-ledger`):
- `src/lib/ledger.ts`
- `src/lib/proto.ts`: a minimal protobuf encoder and decoder for TxBody, MsgSend and TxRaw
- `src/lib/bytes.ts`
- `anchor.html` with `src/anchor.ts` (legacy fallback, see §1)
- the `/api/fees` proxy

The TxBody, memo, fee and verification parts are proven on mainnet (ShareProtect anchors Merkle
roots). The V2 signing call in §1 comes from the app's source (13 Oct 2026). Confirm it on a phone
before you promise a date.

## Contents
1. How a module signs (and why not the V1 hop)
2. The flow, in code
3. What you can put on chain (memo design)
4. Fees: show them first
5. Reading and verifying from a browser
6. Pattern: batch many items under one Merkle root
7. Network facts

## 1. How a module signs (and why not the V1 hop)

Send the TxBody with `WALLET_SIGN_AND_BROADCAST_TRANSACTION`. ShareRing Me's V2 WebView raises the
PIN itself, signs with the user's key and broadcasts. The module never sees the key.

What the app does with a PIN-gated event (`EventsConfirmPin`: `WALLET_SIGN_TRANSACTION`,
`WALLET_SIGN_AND_BROADCAST_TRANSACTION`, `CRYPTO_SIGN`, `CRYPTO_DECRYPT`, `VAULT_EXEC_QUERY_SILENT`):
1. It raises its PIN screen (`confirmPIN`). A cancelled PIN answers `Confirm password fail!`.
2. It reads your request from **`payload.payload`** of the message.

So **wrap the request**. The SDK sends `SignTxRequest` flat (`{ messages, fee }`), and the app
answers `"payload" is a required field.`:

```ts
const request = { payload: { messages: txBodyHex, fee: { gasPrice: '10000nshr' } } };
const r = await walletSignAndBroadcastTransaction(request as never, { timeoutMs: 5 * 60_000 });
// r = { height, transactionHash, gasUsed, gasWanted, code }
```

`broadcastInApp()` in the template's `src/lib/ledger.ts` does this. `messages` is the hex of the
whole **TxBody** (memo inside). The app passes it to `client.signAndBroadcast(address, bytes, fee)`,
the same call the V1 signer makes. The same wrap applies to `WALLET_SIGN_TRANSACTION` and
`CRYPTO_SIGN`. `CRYPTO_DECRYPT` takes a bare string, which the app already puts under `payload`.

**Use the main account.** The key is always the main account's, so build the TxBody `from`
`walletMainAccount()`. If the user has switched to a sub-account in the app, the signature won't
match and the chain rejects it. Say so in the error.

**Why not the V1 anchor hop any more.** Older guides (and modules built before Oct 2026) push
`anchor.html` into a V1 screen with `navigateTo({ to: 'WEB_VIEW', mode: 'push', ... })`, and the
page posts `sign_and_broadcast`. ShareRing Me v3 has **no route named `WEB_VIEW`**. `NAVIGATE_TO`
calls `navigation.push(to)` and answers success even when the route doesn't exist, so nothing
opens, no PIN appears and the module waits forever. ShareProtect hit exactly this on 12 Oct 2026.
V3 opens V1 pages through `JS_BUNDLE_MODULES` with `{ modules: 'webapps', webAppVersion: 'v1',
webAppSource: { uri } }`. Its V1 signer also pops the screen itself after the PIN, so an anchor page
that sends `go_back` as well would close the module. Keep the hop only as a fallback when the V2
call answers `Event not found!`.

## 2. The flow, in code

```ts
import { sendTxBodyHex, broadcastInApp, readTx, explorerTx } from './lib/ledger.ts';

const body = sendTxBodyHex({ from: mainAddress, memo: `MyModule v1 root:${rootHex} n:${count}` });
const res = await broadcastInApp(body);                   // PIN prompt over your screen
if ('error' in res) return showSoftFailure(res.error);    // cancelled, low balance, rejected
const onChain = await readTx(res.txHash);                 // independent confirmation
```

- Persist *what you were anchoring* (the items, the leaf hashes) **before** calling
  `broadcastInApp`. The WebView can be recreated while the PIN screen is up, so on start-up look for
  a pending batch and check it on chain (or on your server) before signing again.
- Hand the hash to your backend and let it confirm on chain, so a seal still lands if the module
  closes before the reply.
- Test in a browser with the mock reply in `main.tsx`. Only a phone signs for real.
- Nothing is signed unless the user approves the PIN. Say what's being recorded and what it costs
  on the screen before you call it.

## 3. What you can put on chain

Only standard Cosmos bank messages go through the app's signer (CosmWasm execute is rejected before
signing, and custom modules need roles). The pattern: a **MsgSend of 1 nshr to yourself carrying
a memo**.
- The memo lives *inside the TxBody*, because the signer signs the body bytes verbatim.
  `sendTxBodyHex` handles it.
- The memo is at most **256 characters**. Make it a versioned, parseable line: `<Product> v1
  root:<64 hex> n:<count>`. Never put personal data in it: the chain is public and permanent. Put
  hashes on chain and keep the content elsewhere.
- Signer address + block time + memo together are the proof: "this wallet committed to this hash
  no later than this block".

## 4. Fees: show them first

Every tx pays gas (about 10000nshr per gas unit) **plus** a gentlemint action fee (`bank_send` =
0.01 SHRP, about 6.4 SHR at rate 642). That's real money to the user, so:
- Before signing, fetch `GET /api/fees?address=…`. The template's server proxies
  `{LCD}/shareledger/gentlemint/checkFees?address=…&actions=bank_send`, because the LCD sends no
  CORS headers. It returns `{ actionFee, gas, balance, sufficient }`.
- Show the total in SHR (1 SHR = 1e9 nshr), and disable the action if `sufficient` is false.
- **Batch.** One transaction per many items (see §6) instead of one per item.

## 5. Reading and verifying from a browser

The public Tendermint RPC `https://rpc.explorer.shareri.ng` answers CORS, so any page (including
a public verification page without the app) can check a proof itself, with no trust in your
server:
- `readTx(hash)` calls `/tx?hash=0x<HEX>`, decodes TxRaw, and reads the block time from
  `/block?height=N`. It returns `{ height, ok, memo, signer, time }` and retries while indexing
  (a few seconds).
- `latestBlock()` returns the newest block hash. Put it *inside* what you're hashing to prove
  "not before" (a beacon): nobody could know that hash in advance.
- Explorer link: `explorerTx(hash)` builds `https://explorer.shareri.ng/transactions/<HASH>`.

## 6. Pattern: many items, one transaction (Merkle root)

What ShareProtect does, and what you should copy for any "prove these N things existed":
The template ships this as `src/lib/merkle.ts`:

```ts
import { leafHash, buildTree, rootFromProof } from './lib/merkle.ts';
const leaves = await Promise.all(items.map((r) => leafHash('myproduct:v1:', r)));
const { root, proofs } = await buildTree(leaves);            // proofs[i] = sibling path for item i
// later, anywhere (browser or Node):
(await rootFromProof(leaves[i], proofs[i])) === rootFromMemo;
```

1. Per item, build a canonical record and hash it with a domain tag:
   `leaf = sha256("myproduct:v1:" + stableStringify(record))`. `stableStringify` sorts keys so
   the same record always hashes the same.
2. Build the tree with `node = sha256(0x01 || left || right)`. An odd node at the end of a level is
   promoted unchanged.
3. Anchor the root in one memo: `MyProduct v1 root:<hex> n:<N>`.
4. Give each item its **proof**: the leaf record, its sibling path, the tx hash. Anyone can then
   recompute leaf → root and compare it with the memo read from the RPC. The chain is the only
   trusted party.
5. Publish a public `/v/<id>` page that does that check in the browser and shows "Verified on
   ShareLedger · block N · time", with a QR code back to it.

Use Web Crypto (`crypto.subtle.digest('SHA-256', …)`) on both client and server (Node has it too)
so the same `shared/` code runs in both places.

## 7. Network facts

- **Mainnet (production).** ShareRing Me in the stores is on mainnet.
  - RPC `https://rpc.explorer.shareri.ng`, LCD `https://lcd.explorer.shareri.ng`, explorer
    `https://explorer.shareri.ng`.
  - Denom `nshr`, where 1 SHR = 1,000,000,000 nshr. Address prefix `shareledger`.
- A testnet build of the app exists. If the user is testing there, make RPC and LCD configurable
  (environment variables on the server, a build-time `VITE_` variable on the client), and **tell
  the user which network the deployed module targets**, so they open it in the matching app.
