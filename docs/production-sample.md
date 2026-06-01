# Production Sample

`x402-demo` is the production sample for this stack.

- Live route: `https://hq.peezy.tech/x402`
- Protected endpoint: `https://hq.peezy.tech/x402/api/paid`
- Payment method: `exact` on `hyperliquid:testnet`
- Browser flow: injected EVM wallet signs a Hyperliquid `spotSend` action
- Server stack: upstream `@x402/core`, `@x402/express`, `@x402/paywall`, and
  published `x402-hl`

The sample intentionally keeps private keys out of git. Browser payments are
signed by the user's injected wallet. The optional server-side payer path is
enabled only when `HYPERLIQUID_PAYER_PRIVATE_KEY` is present in the local
runtime environment.

## What It Proves

The sample proves that an x402 resource server can advertise a Hyperliquid
payment requirement, render a browser paywall for wallet users, verify the
payment payload, submit the signed transfer to Hyperliquid, and return the
settled protected response.

Use it as the reference implementation for:

- wiring `x402-hl` into an Express resource server;
- using a local in-process facilitator for Hyperliquid settlement;
- adding the `x402-hl/paywall` browser-wallet handler to upstream
  `@x402/paywall`;
- keeping recipient and optional payer credentials in environment variables.

## Validate The Sample

From `/home/peezy/workspaces/x402-protocol/x402-demo`:

```sh
pnpm typecheck
pnpm smoke
```

The smoke test checks that:

- `/x402` returns the demo page;
- `/x402/api/paid` returns `402` without payment;
- the HTML paywall contains the Hyperliquid injected-wallet UI;
- the payment requirement advertises `hyperliquid:testnet`.

For a funded server-side payment test:

```sh
HYPERLIQUID_PAYER_PRIVATE_KEY=0x... pnpm pay
```

For the preferred browser-wallet validation, open the live route, select the
wallet paywall, connect an injected wallet with Hyperliquid testnet spot USDC,
and sign the transfer.

