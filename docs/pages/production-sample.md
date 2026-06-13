---
title: Production Sample
description: Inspect the live Venice gateway that uses published x402-hl with Hyperliquid x402 payments.
---

# Production Sample

The current production-style sample is a temporary public Venice API gateway:

- App: `https://ai.peezy.tech/`
- API config: `https://ai.peezy.tech/api`
- Models: `https://ai.peezy.tech/api/v1/models`
- Top-up paywall: `https://ai.peezy.tech/api/x402/top-up/pay/5.00`
- Payment method: `exact` on `hyperliquid:mainnet`
- Package: published `x402-hl@0.1.2`

This deployment is a real-world example of the Hyperliquid integration rather
than a permanent hosted product. It accepts mainnet Hyperliquid USDC top-ups,
tracks a prepaid gateway balance, and forwards authenticated chat requests to
Venice.

## What It Proves

The sample proves that an x402 resource server can:

- advertise a Hyperliquid payment requirement;
- render an injected-wallet browser paywall;
- have the user's wallet sign a Hyperliquid `sendAsset` action;
- verify and settle the signed payment with an in-process facilitator;
- credit an application ledger from explicit USD top-up metadata;
- serve paid API requests without storing payer private keys on the server.

The gateway uses upstream `@x402/core`, `@x402/express`, `@x402/paywall`, and
published `x402-hl`. Browser users sign payments with their injected wallet.
The remote host only needs the public Hyperliquid receiver address and the
ordinary application secrets needed to operate the gateway.

## Production Shape

The Venice gateway has a few pieces that most production samples eventually
need:

- a public base URL and stable x402 resource URLs;
- a Hyperliquid receiver address configured outside git;
- an in-process facilitator registered for `hyperliquid:mainnet`;
- the `x402-hl/paywall` handler registered with upstream `@x402/paywall`;
- a small ledger that credits allowed top-up amounts and charges usage;
- spend caps and model allowlists to limit blast radius;
- operational balance checks for both the application ledger and the
  Hyperliquid receiver.

The live sample intentionally keeps validation payer keys off the VPS. Funded
validation can run from an operator machine, but the public service does not
need a server-side payer key for browser-wallet top-ups.

## Minimal Project Shape

A smaller app can start with:

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
HYPERLIQUID_NETWORK=hyperliquid:testnet
HYPERLIQUID_PAY_TO_ADDRESS=0x...
HYPERLIQUID_PRICE_USD=0.000001
PUBLIC_BASE_URL=https://example.com
```

Use `hyperliquid:testnet` while building your first sample. Switch to
`hyperliquid:mainnet` only after you have controlled receiver credentials,
funded-wallet validation, and an explicit operating plan for balances and
spend limits.

Then combine the [facilitator guide](./facilitator) with the
[endpoint guide](./endpoint).

## Validate A Sample

Before using funded wallets:

```sh
pnpm typecheck
```

Recommended smoke checks:

- the public page returns `200`;
- the protected endpoint returns `402` without payment;
- the HTML paywall contains the Hyperliquid injected-wallet UI;
- the payment requirement advertises the intended Hyperliquid network;
- the requirement amount, token, and any application USD metadata agree;
- the server credits application balances from USD metadata, not raw token base
  units.

For a funded server-side payment test:

```sh
HYPERLIQUID_PAYER_PRIVATE_KEY=0x... pnpm pay
```

For the preferred browser-wallet validation, open your deployed route, select
the wallet paywall, connect an injected wallet with Hyperliquid spot USDC on
the configured network, and sign the transfer.
