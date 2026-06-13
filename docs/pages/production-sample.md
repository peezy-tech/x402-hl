---
title: Production Sample
description: Deploy a small x402 app that accepts Hyperliquid payments with x402-hl.
---

# Production Sample

A production sample for this stack is any deployed app that accepts
Hyperliquid x402 payments using upstream `@x402/*` packages plus `x402-hl`.

One reference deployment is currently live at:

- App route: `https://hq.peezy.tech/x402`
- Protected endpoint: `https://hq.peezy.tech/x402/api/paid`
- Payment method: `exact` on `hyperliquid:testnet`
- Browser flow: injected EVM wallet signs a Hyperliquid `sendAsset` action
- Server stack: upstream `@x402/core`, `@x402/express`, `@x402/paywall`, and
  published `x402-hl`

A sample app should keep private keys out of git. Browser payments are signed
by the user's injected wallet. Optional server-side payer flows should be
enabled only when `HYPERLIQUID_PAYER_PRIVATE_KEY` is present in the runtime
environment.

## What It Proves

The sample proves that an x402 resource server can advertise a Hyperliquid
payment requirement, render a browser paywall for wallet users, verify the
payment payload, submit the signed transfer to Hyperliquid, and return the
settled protected response.

Use the pattern as a reference for:

- wiring `x402-hl` into an Express resource server;
- using an in-process facilitator for Hyperliquid settlement;
- adding the `x402-hl/paywall` browser-wallet handler to upstream
  `@x402/paywall`;
- keeping recipient and optional payer credentials in environment variables.

## Minimal Project Shape

A standalone sample can be as small as:

```txt
my-x402-hl-app/
  package.json
  src/
    facilitator.ts
    server.ts
```

Install the runtime dependencies:

```sh
pnpm add express @x402/core @x402/express @x402/fetch @x402/paywall viem x402-hl
pnpm add -D typescript tsx @types/express @types/node
```

Configure runtime values outside git:

```sh
HYPERLIQUID_PAY_TO_ADDRESS=0x...
HYPERLIQUID_PRICE_USD=0.000001
PUBLIC_BASE_URL=https://example.com
```

Then combine the [facilitator guide](./facilitator) with the
[endpoint guide](./endpoint).

## Validate A Sample

From your sample app:

```sh
pnpm typecheck
```

Recommended smoke checks:

- the public page returns `200`;
- the protected endpoint returns `402` without payment;
- the HTML paywall contains the Hyperliquid injected-wallet UI;
- the payment requirement advertises `hyperliquid:testnet`.

For a funded server-side payment test:

```sh
HYPERLIQUID_PAYER_PRIVATE_KEY=0x... pnpm pay
```

For the preferred browser-wallet validation, open your deployed route, select
the wallet paywall, connect an injected wallet with Hyperliquid testnet spot
USDC, and sign the transfer.
