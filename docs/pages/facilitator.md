---
title: Facilitator Integration
description: Add Hyperliquid verification and settlement to an x402 facilitator.
---

# Facilitator Integration

Use the facilitator primitive when you operate an x402 facilitator that should
verify and settle Hyperliquid payments.

`x402-hl` registers Hyperliquid support with upstream `@x402/core`; it does
not require a forked x402 package or a monorepo checkout.

## Install

```sh
pnpm add @x402/core x402-hl
```

## Register Hyperliquid

```ts
import { x402Facilitator } from "@x402/core/facilitator";
import {
  registerExactHyperliquidScheme,
} from "x402-hl/exact/facilitator";

const facilitator = registerExactHyperliquidScheme(new x402Facilitator(), {
  networks: ["hyperliquid:testnet"],
});
```

The registered facilitator can now answer upstream x402 facilitator calls:

```ts
const verifyResponse = await facilitator.verify(paymentPayload, requirements);
const settleResponse = await facilitator.settle(paymentPayload, requirements);
const supported = await facilitator.getSupported();
```

## Settlement Behavior

For `exact` Hyperliquid payments, the client signs a Hyperliquid `sendAsset`
action from the payer's spot DEX balance to the recipient's spot DEX balance.
The facilitator:

- validates x402 version, scheme, network, recipient, asset, amount, and TTL;
- submits the signed action to the Hyperliquid exchange endpoint;
- looks up the matching non-funding ledger update for the payer;
- confirms the transaction hash through Hyperliquid info endpoints;
- returns an x402 `SettleResponse` with the transaction hash.

The facilitator does not need a private key to settle browser-wallet payments,
because the payer has already signed the transfer action.

## Networks

The implementation supports both Hyperliquid networks:

| x402 payment network | Hyperliquid environment | Related HyperEVM chain | Code support | Funded smoke evidence for this release |
| --- | --- | --- | --- | --- |
| `hyperliquid:testnet` | Testnet HyperCore | `eip155:998` | Yes | Successful funded x402 settlements were recorded on 2026-06-09 (`0xbf6176…`) and 2026-06-12 (`0xf53e86…`). |
| `hyperliquid:mainnet` | Mainnet HyperCore | `eip155:999` | Yes | No successful funded settlement is recorded. A 2026-06-13 browser attempt failed with `hl_exchange_error`. |

Code support and funded evidence are different claims. `getSupported`, unit
tests, compatibility probes, and a mocked settlement prove integration shape;
they do not prove that a funded transfer settled on either network. Record the
payer-controlled smoke transaction separately during release validation.

The repository documents a temporary mainnet-configured exact-payment
deployment using `x402-hl@0.1.2`. Configuration or availability is not funded
settlement evidence. No funded HyperEVM execution-intent smoke is recorded on
either network.

Registering without an explicit `networks` option uses all supported
Hyperliquid networks:

```ts
const facilitator = registerExactHyperliquidScheme(new x402Facilitator());
```

Production applications should normally register an explicit network and keep
the route, payee, receiver inventory, wallet UI, funded smoke, and operational
alerts on that same environment.

## Execution Intent Boundary

The facilitator verifies and settles the HyperCore payment only. It does not
approve calldata, execute on HyperEVM, maintain intent state, rebalance
inventory, or issue refunds.

An execution-intent gateway must pass the real `SettleResponse` to
`verifyPaidExecutionIntent`. Version 2 requires:

- `success: true`;
- a valid settled payer;
- a non-empty settlement transaction identifier;
- a settlement network matching the finalized `PaymentRequirements`;
- the settled amount to match when the facilitator returns an amount.

Do not synthesize a successful response around `verify()`. A successful
verification is not a settlement, and a submitted transaction hash is not by
itself proof that a transfer settled.

## Resource Server Adapter

Many apps do not run a separate facilitator service yet. For that shape, expose
the in-process facilitator through the `FacilitatorClient` interface expected by
upstream x402 resource servers:

```ts
import { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
} from "@x402/core/types";
import {
  registerExactHyperliquidScheme,
} from "x402-hl/exact/facilitator";

const facilitator = registerExactHyperliquidScheme(new x402Facilitator());

export const facilitatorClient: FacilitatorClient = {
  verify(paymentPayload: PaymentPayload, requirements: PaymentRequirements) {
    return facilitator.verify(paymentPayload, requirements);
  },
  settle(paymentPayload: PaymentPayload, requirements: PaymentRequirements) {
    return facilitator.settle(paymentPayload, requirements);
  },
  getSupported() {
    return facilitator.getSupported();
  },
};
```

This adapter can live inside the same app as your protected resource, or behind
your own facilitator HTTP service.
