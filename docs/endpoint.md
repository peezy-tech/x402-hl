# Accept Hyperliquid Payments On An x402 Endpoint

Use the endpoint primitives when you own an HTTP resource and want to accept
Hyperliquid as an x402 payment method.

This guide shows the Express shape used by the production sample at
`https://hq.peezy.tech/x402`.

## Install

```sh
pnpm add express @x402/core @x402/express @x402/paywall x402-hl
```

## Configure Environment

Keep the recipient address in runtime configuration:

```sh
HYPERLIQUID_PAY_TO_ADDRESS=0x...
HYPERLIQUID_PRICE_USD=0.000001
PUBLIC_BASE_URL=https://example.com
```

For browser-wallet payments, no server-side payer key is required. The user
signs with their injected wallet.

For optional server-side smoke tests, use an untracked private key:

```sh
HYPERLIQUID_PAYER_PRIVATE_KEY=0x...
```

## Register The Resource Server

```ts
import express from "express";
import {
  paymentMiddleware,
  x402ResourceServer,
} from "@x402/express";
import { createPaywall } from "@x402/paywall";
import { ExactHyperliquidScheme as ExactHyperliquidServer } from "x402-hl/exact/server";
import { hyperliquidPaywall } from "x402-hl/paywall";
import { facilitatorClient } from "./facilitator";

const app = express();
const network = "hyperliquid:testnet" as const;
const protectedPath = "/api/paid";

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  network,
  new ExactHyperliquidServer(),
);

const browserPaywall = createPaywall()
  .withNetwork(hyperliquidPaywall)
  .build();

app.use(
  paymentMiddleware(
    {
      [`GET ${protectedPath}`]: {
        accepts: {
          scheme: "exact",
          network,
          price: "$0.000001",
          payTo: process.env.HYPERLIQUID_PAY_TO_ADDRESS as `0x${string}`,
          maxTimeoutSeconds: 300,
        },
        description: "Paid Hyperliquid x402 endpoint",
        mimeType: "application/json",
      },
    },
    resourceServer,
    {
      appName: "Hyperliquid x402 App",
      testnet: true,
    },
    browserPaywall,
  ),
);

app.get(protectedPath, (_req, res) => {
  res.json({ ok: true, paid: true });
});
```

The browser paywall is optional for API-only clients, but it is the expected
flow for injected-wallet users. With the paywall enabled, a browser request for
the protected endpoint receives an HTML payment UI; API clients receive the
normal x402 `402 Payment Required` response.

## Server-Side Client Test

Use upstream `@x402/fetch` with the `x402-hl` client primitive when you want a
server-side smoke test:

```ts
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactHyperliquidScheme } from "x402-hl/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(
  process.env.HYPERLIQUID_PAYER_PRIVATE_KEY as `0x${string}`,
);

const client = new x402Client().register(
  "hyperliquid:testnet",
  new ExactHyperliquidScheme(account),
);

const paidFetch = wrapFetchWithPayment(fetch, client);
const response = await paidFetch("https://example.com/api/paid", {
  headers: { Accept: "application/json" },
});

console.log(response.status, response.headers.get("PAYMENT-RESPONSE"));
```

The payer account must hold enough Hyperliquid testnet spot USDC for the
configured amount.

