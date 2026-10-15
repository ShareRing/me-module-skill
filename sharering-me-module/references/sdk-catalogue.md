# SDK event catalogue (generated from @sharering/me-module-sdk)

Wrapper = camelCase of the event (`COMMON_APP_INFO` -> `commonAppInfo()`, `NAVIGATE_TO` -> `navigateTo()`).
Fire-and-forget events resolve immediately with no reply.

## COMMON
App context, device info, clipboard, the in-app browser, and per-domain key/value storage.

### COMMON_APP_INFO
`commonAppInfo()`: App language, version, identifier and dark-mode state.
- response: `{"language":"en","version":"4.12.0","id":"network.sharering.me","darkMode":false}`
- Read `darkMode` here rather than `prefers-color-scheme` - the app’s theme is its own setting.

### COMMON_DEVICE_INFO
`commonDeviceInfo()`: Device identifier, brand, model, OS, country and timezone.
- response: `{"identifier":"9f2a1c7e-4b60-4d1a-8e5f-2c9a7b31d004","brand":"Apple","model":"iPhone15,3","os":"iOS 18.2","country":"VN","timezone":"Asia/Ho_Chi_Minh"}`

### COMMON_READ_ASYNC_STORAGE
`commonReadAsyncStorage()`: Read app-managed key/value storage, scoped to your module’s domain.
- request: `"onboardingComplete"`
- response: `{"onboardingComplete":"true"}`
- For a single key send the key as a **bare string**. Wrapping it in an extra object is silently accepted and returns nothing - unnoticeable in a browser, empty in the real app.
- Pass an array of strings to read several keys at once. Missing keys are omitted from the response.
- Storage is scoped by your **domain**, which the app derives from the loaded URL host. Never send a `dAppsDomainName` field yourself - the app injects it, and overriding it points you at the wrong bucket.

### COMMON_WRITE_ASYNC_STORAGE
`commonWriteAsyncStorage()`: Write app-managed key/value storage, scoped to your module’s domain.
- request: `{"onboardingComplete":"true","lastSeenVersion":"1.0.3"}`
- response: `null`
- Keep it small and non-sensitive. This is app storage, not a vault.

### COMMON_STATUS_BAR_DIMENSIONS
`commonStatusBarDimensions()`: Safe-area geometry for the status bar, so your UI can sit under it.
- response: `{"top":0,"left":0,"width":393,"height":59}`

### COMMON_SET_STATUS_BAR_STYLE
`commonSetStatusBarStyle()`: Switch the status bar between light and dark content.
- request: `"light"`
- response: `null`
- The payload is a bare string - `"light"` or `"dark"` - not an object.

### COMMON_COPY_TO_CLIPBOARD
`commonCopyToClipboard()`: Copy text to the system clipboard, optionally with the app’s own toast.
- request: `{"content":"shr1q9x...k2p","showToastNotification":true}`
- response: `null`
- `showToastNotification` defaults to `true`. Set it to `false` if you show your own confirmation.

### COMMON_OPEN_BROWSER
`commonOpenBrowser()`: Open a URL in the in-app browser and get data back when it closes.
- request: `"https://example.com/checkout?session=abc123"`
- response: `{"status":"success","orderId":"77120"}`
- The payload is a bare URL string.
- To pass data back, redirect to `sharering://close?...` - the query string comes back as the response payload.

## NAVIGATION
Move around the host app, open device settings, hand a URL to the OS.

### NAVIGATE_TO (fire-and-forget)
`navigateTo()`: Navigate to an in-app screen, or to another Me Module by its domain.
- request: `{"to":"wallet","params":{"tab":"history"},"mode":"push"}`
- `to` is an in-app screen name or another Me Module’s domain.
- `mode`: `push` adds a route, `replace` swaps the current one, `pop` returns to `to` in the stack (replacing the current route if it is not there).

### NAVIGATE_BACK
`navigateBack()`: Go back one or more routes in the host app’s stack.
- request: `{"steps":1}`
- response: `null`
- `steps` defaults to `1`.

### NAVIGATE_IS_FOCUSED
`navigateIsFocused()`: Whether your module’s screen is currently focused.
- response: `true`

### NAVIGATE_OPEN_DEVICE_SETTINGS (fire-and-forget)
`navigateOpenDeviceSettings()`: Open a section of the OS settings app.
- request: `"location"`
- One of `general`, `location`, `bluetooth`, `network`, `wifi`, `cellular`, `app`, `apps`.

### NAVIGATE_OPEN_LINK (fire-and-forget)
`navigateOpenLink()`: Hand a URL or deeplink to the OS.
- request: `"https://example.com/help"`
- The app calls `Linking.openURL(...)`; the OS decides what handles the scheme.

## VAULT
The user’s identity documents, email, avatar and vault queries.

### VAULT_DOCUMENTS
`vaultDocuments()`: The identity documents in the user’s vault - ids, types and countries only.
- response: `[{"id":"doc_8f21","type":"passport","country":"VN"},{"id":"doc_1a09","type":"driver_license","country":"AU"}]`
- Metadata only. Reading the contents is a vault query.

### VAULT_EMAIL
`vaultEmail()`: The user’s vault email address.
- response: `"user@example.com"`

### VAULT_AVATAR
`vaultAvatar()`: The user’s avatar, base64 encoded.
- response: `"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB..."`

### VAULT_ADD_DOCUMENT
`vaultAddDocument()`: Add a document to the user’s vault.
- request: `{"image":"<base64>","photo":"<base64>","metadata":{"type":"passport","expiryDate":"2031-04-18","issueDate":"2021-04-19","number":"C1234567","country":"Vietnam","countryCode":"VN","fullName":"Jane Nguyen","dob":"1992-08-03","address":"12 Nguyen Hue, District 1","nationality":"Vietnamese","placeOfBirth":"Ho Chi Minh City","issueBy":"Immigration Department"}}`
- response: `null`

### VAULT_ADD_CUSTOM_VALUE
`vaultAddCustomValue()`: Store arbitrary named values against the user’s vault.
- request: `{"membershipTier":"gold","memberSince":"2023-02-11"}`
- response: `null`

### VAULT_EXEC_QUERY
`vaultExecQuery()`: Start a vault query - the user is shown what is being shared and consents.
- request: `{"queryId":"qry_0b71","clientId":"client_4kf9x2","ownerAddress":"shr1q9x...k2p","sessionId":"sess_88a1","customValue":[{"name":"purpose","value":"age check"}]}`
- response: `[{"name":"over18","label":"Over 18","value":"true"},{"name":"country","label":"Country","value":"VN"}]`
- Two request shapes. Either `{ workflowId }` on its own, or the ids below. A workflow already names the query, the client and the owner, so the two are alternatives and not to be combined - `{ workflowId, queryId }` is refused, not merged.

### VAULT_EXEC_QUERY_SILENT
`vaultExecQuerySilent()`: The same query without the consent screen. PIN-gated.
- request: `{"workflowId":"wf_7c3a19"}`
- response: `[{"name":"over18","label":"Over 18","value":"true"}]`
- Same two request shapes as `VAULT_EXEC_QUERY`: `{ workflowId }` alone, or `queryId` + `clientId` + `ownerAddress` (with optional `sessionId` and `customValue`). Never a mixture.

### VAULT_VCT_TOKEN_ID
`vaultVctTokenId()`: The user’s VCT token id, which is their DID (`did:shr:<pubkey hex>`).
- response: `"did:shr:02b4c1f7a9e3..."`
- This is the most direct DID source. Do **not** derive the DID from the wallet address or wallet pubkey - those are a different key.
- Prompts on the first call per session. Use a 60s timeout and cache the result.
- Wrapper versions differ on whether the value arrives bare or nested, and may omit the `did:shr:` prefix. Accept both and prefix it yourself.

## WALLET
ShareLedger accounts, balances, and transaction signing.

### WALLET_MAIN_ACCOUNT
`walletMainAccount()`: The user’s main ShareLedger account.
- response: `{"address":"shr1q9x...k2p","pubKey":"02b4c1f7a9e3..."}`
- Older builds answer only this event. Try `WALLET_CURRENT_ACCOUNT` first and fall back here.

### WALLET_CURRENT_ACCOUNT
`walletCurrentAccount()`: The account currently selected in the app.
- response: `{"address":"shr1q9x...k2p","pubKey":"02b4c1f7a9e3..."}`
- Current builds use this; older builds only answer `WALLET_MAIN_ACCOUNT`.
- Response shapes vary between builds - fields may sit at the top level or under `account`/`result`/`data`, and the pubkey may be hex or base64. Parse defensively.

### WALLET_BALANCE
`walletBalance()`: Balances of the current account, per denomination.
- response: `[{"amount":"12500000000","denom":"nshr"}]`

### WALLET_ACCOUNTS
`walletAccounts()`: Every ShareLedger account the user holds.
- response: `[{"address":"shr1q9x...k2p","pubKey":"02b4c1f7a9e3..."},{"address":"shr1m40...7de","pubKey":"03a1e8b2c4d6..."}]`

### WALLET_SWITCH_ACCOUNT
`walletSwitchAccount()`: Ask the user to switch accounts; returns the one they picked.
- response: `{"address":"shr1m40...7de","pubKey":"03a1e8b2c4d6..."}`

### WALLET_SIGN_TRANSACTION
`walletSignTransaction()`: Sign a ShareLedger transaction without broadcasting it.
- request: `{"messages":"0a8c010a1a2f636f736d6f732e62616e6b...","memo":"ticket purchase","fee":{"amount":[{"amount":"1000","denom":"nshr"}],"gas":200000,"gasPrice":"1000nshr"}}`
- response: `"MEUCIQDx8k1o..."`
- Build `messages` with `@shareledgerjs/client`: encode the tx body, then hex-encode the buffer.
- PIN-gated, and the user may decline. Treat a rejection as a soft failure.

### WALLET_SIGN_AND_BROADCAST_TRANSACTION
`walletSignAndBroadcastTransaction()`: Sign a ShareLedger transaction and commit it to the chain.
- request: `{"messages":"0a8c010a1a2f636f736d6f732e62616e6b...","memo":"ticket purchase","fee":{"amount":[{"amount":"1000","denom":"nshr"}],"gas":200000,"gasPrice":"1000nshr"}}`
- response: `{"height":4820117,"transactionHash":"A3F1C0...9E2B","gasUsed":128442,"gasWanted":200000,"code":"0"}`
- Gated by PIN *and* by the chain round-trip. Use a long timeout - 60s is the floor here.

### WALLET_SIGN_ARBITRARY_MESSAGE
`walletSignArbitraryMessage()`: Sign an arbitrary string - a nonce challenge against your own backend.
- request: `"login-nonce:8f21c0a4"`
- response: `{"address":"shr1q9x...k2p","publicKey":"02b4c1f7a9e3...","signature":"MEUCIQDx8k1o..."}`
- The payload is a bare string, not an object.
- A declined prompt returns an error or times out.

### WALLET_SWAP_ACCOUNT
`walletSwapAccount()`: The user’s account on an EVM network.
- request: `{"network":"eth"}`
- response: `{"network":"eth","address":"0x7a3f...9c2b"}`

## NFT
The user’s NFTs.

### NFT_NFTS
`nftNfts()`: The NFTs held by the user.
- response: `[{"id":"nft_5512","name":"Founding Member","collection":"ShareRing Origins"}]`

## CRYPTOGRAPHY
Encrypt, decrypt, sign and verify with the user’s key.

### CRYPTO_ENCRYPT
`cryptoEncrypt()`: Encrypt a string with the user’s key.
- request: `"order:77120"`
- response: `"v1.enc.9f2a1c7e4b60..."`

### CRYPTO_DECRYPT
`cryptoDecrypt()`: Decrypt a string previously encrypted with the user’s key. PIN-gated.
- request: `"v1.enc.9f2a1c7e4b60..."`
- response: `"order:77120"`

### CRYPTO_SIGN
`cryptoSign()`: Sign data, optionally with an expiry baked into the signed payload. PIN-gated.
- request: `{"data":"order:77120","signOptions":{"delimiter":"|","expiration":{"enabled":true,"salt":"a91f"}}}`
- response: `{"signature":"MEUCIQDx8k1o...","data":"order:77120|1740000000|a91f"}`

### CRYPTO_VERIFY
`cryptoVerify()`: Verify a signature, and whether the signed payload is still within its expiry.
- request: `{"data":"order:77120|1740000000|a91f","verifyOptions":{"signature":"MEUCIQDx8k1o...","delimiter":"|","expiration":{"enabled":true,"time":300,"salt":"a91f"}}}`
- response: `{"valid":true,"data":["order:77120","1740000000","a91f"]}`
- `expiration.time` is in seconds.

## GOOGLE_WALLET
Add passes to Google Wallet.

### GOOGLE_WALLET_CAN_ADD_PASSES
`googleWalletCanAddPasses()`: Whether this device can add Google Wallet passes.
- response: `true`
- Always check before offering the button - it is false on iOS and on devices without Google Wallet.

### GOOGLE_WALLET_ADD_PASS
`googleWalletAddPass()`: Add a pass to Google Wallet.
- request: `"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."`
- response: `null`
- The payload is a signed JWT string or a save URL.

## APPLE_WALLET
Add, inspect, view and remove Apple Wallet passes.

### APPLE_WALLET_CAN_ADD_PASSES
`appleWalletCanAddPasses()`: Whether this device can add Apple Wallet passes.
- response: `true`

### APPLE_WALLET_ADD_PASS
`appleWalletAddPass()`: Add a pass to Apple Wallet.
- request: `"https://example.com/passes/77120.pkpass"`
- response: `null`

### APPLE_WALLET_HAS_PASS
`appleWalletHasPass()`: Whether a pass is already in the user’s Apple Wallet.
- request: `{"cardIdentifier":"pass.com.example.ticket","serialNumber":"77120"}`
- response: `true`

### APPLE_WALLET_REMOVE_PASS
`appleWalletRemovePass()`: Remove a pass from Apple Wallet.
- request: `{"cardIdentifier":"pass.com.example.ticket","serialNumber":"77120"}`
- response: `true`

### APPLE_WALLET_VIEW_PASS
`appleWalletViewPass()`: Open a pass in Apple Wallet.
- request: `{"cardIdentifier":"pass.com.example.ticket","serialNumber":"77120"}`
- response: `null`
