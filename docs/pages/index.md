---
title: x402-hl
description: Standalone Hyperliquid primitives and browser paywall support for x402.
---

# x402-hl

`x402-hl` provides standalone Hyperliquid support for x402 without carrying a
fork of upstream x402.

It includes:

- exact client support for signing Hyperliquid `sendAsset` payments;
- exact resource-server support for advertising Hyperliquid payment
  requirements;
- exact facilitator support for verifying and settling signed Hyperliquid
  payments;
- a browser injected-wallet paywall handler for upstream `@x402/paywall`;
- version-2 brokered execution intents that bind a finalized HyperCore x402
  payment to an application- and gateway-scoped HyperEVM action.

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
- `x402-hl/intents`: versioned schemas, canonical payment hashing, EIP-712
  signing, and extension helpers.
- `x402-hl/intents/client`: client approval and signing of a declared intent
  bound to the exact selected payment requirements.
- `x402-hl/intents/server`: quote, strict post-settlement verification, durable
  compare-and-swap storage, constrained execution, status, and refund helpers.
- `x402-hl/paywall`: `hyperliquidPaywall` for upstream `@x402/paywall`.

The [execution-intent guide](./intents) lists every public intents export and
type.

## Network Support And Evidence

The exact scheme implementation supports `hyperliquid:testnet` and
`hyperliquid:mainnet`. The related HyperEVM chain ids are 998 and 999,
respectively.

Funded evidence is narrower than code support. Successful x402 settlements are
recorded on testnet. The recorded mainnet attempt failed, and no funded
HyperEVM execution-intent smoke is recorded on either network. See
[Facilitator integration](./facilitator#networks) for the evidence matrix.

## Start Here

- [Facilitator integration](./facilitator): add Hyperliquid verification and
  settlement to an x402 facilitator.
- [Accept Hyperliquid payments](./endpoint): configure an HTTP endpoint that
  accepts `hyperliquid:testnet`.
- [Execution intents](./intents): understand the version-2 signature, strict
  verification, state machine, and brokered trust boundary.
- [Production sample](./production-sample): assemble a durable, allowlisted,
  simulated, receipt-confirmed execution and refund saga.
