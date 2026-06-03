---
title: x402-hl
description: Standalone Hyperliquid primitives and browser paywall support for x402.
---

# x402-hl

`x402-hl` provides standalone Hyperliquid support for x402 without carrying a
fork of upstream x402.

It includes:

- exact client support for signing Hyperliquid `spotSend` payments;
- exact resource-server support for advertising Hyperliquid payment
  requirements;
- exact facilitator support for verifying and settling signed Hyperliquid
  payments;
- a browser injected-wallet paywall handler for upstream `@x402/paywall`.

## Install

```sh
pnpm add @x402/core @x402/paywall x402-hl
```

Express resource servers usually also install:

```sh
pnpm add express @x402/express
```

Server-side payer smoke tests usually also install:

```sh
pnpm add @x402/fetch viem
```

## Package Exports

- `x402-hl`: constants, types, signer helpers, utilities, and exact aliases.
- `x402-hl/exact/client`: `ExactHyperliquidScheme` for clients.
- `x402-hl/exact/server`: `ExactHyperliquidScheme` for resource servers.
- `x402-hl/exact/facilitator`: `ExactHyperliquidScheme` for facilitators.
- `x402-hl/paywall`: `hyperliquidPaywall` for upstream `@x402/paywall`.

## Start Here

- [Facilitator integration](./facilitator): add Hyperliquid verification and
  settlement to an x402 facilitator.
- [Accept Hyperliquid payments](./endpoint): configure an HTTP endpoint that
  accepts `hyperliquid:testnet`.
- [Production sample](./production-sample): deploy a small app that proves the
  full stack.
