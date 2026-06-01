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

For `exact` Hyperliquid payments, the client signs a Hyperliquid `spotSend`
action. The facilitator:

- validates x402 version, scheme, network, recipient, asset, amount, and TTL;
- submits the signed action to the Hyperliquid exchange endpoint;
- looks up the matching non-funding ledger update for the payer;
- confirms the transaction hash through Hyperliquid info endpoints;
- returns an x402 `SettleResponse` with the transaction hash.

The facilitator does not need a private key to settle browser-wallet payments,
because the payer has already signed the transfer action.

## Networks

The current published package supports:

- `hyperliquid:testnet`

Registering without an explicit `networks` option uses all supported
Hyperliquid networks:

```ts
const facilitator = registerExactHyperliquidScheme(new x402Facilitator());
```

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
