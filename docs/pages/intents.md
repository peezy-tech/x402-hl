---
title: Execution Intents
description: Bind a Hyperliquid x402 payment to a signed HyperEVM execution intent.
---

# Execution Intents

`x402-hl/intents` is the TypeScript layer for apps that accept payment on
HyperCore, then execute a quoted action on HyperEVM.

The package keeps payment and execution separate:

```txt
quote action -> advertise x402 payment + intent declaration
client signs Hyperliquid payment + EIP-712 execution intent
server settles payment
server verifies intent signature and quote binding
server executes with its own TypeScript relayer or records status
```

The Solidity verifier/router pieces are intentionally not included yet.

## Exports

```ts
import {
  createIntentDeclaration,
  hashExecutionIntent,
  signExecutionIntent,
} from "x402-hl/intents";
import { createExecutionIntentClientExtension } from "x402-hl/intents/client";
import {
  createIntentExecutor,
  createIntentQuote,
  verifyPaidExecutionIntent,
} from "x402-hl/intents/server";
```

## Create A Quote

On the server, create a quote for the exact action you are willing to execute.
The route config includes normal `exact` Hyperliquid payment details plus an
intent declaration under the `x402-hl/intents` extension key.

```ts
const quote = createIntentQuote({
  id: "quote-123",
  network: "hyperliquid:testnet",
  price: "$0.05",
  payTo: process.env.HYPERLIQUID_PAY_TO_ADDRESS!,
  mode: "brokered",
  intent: {
    user: userAddress,
    chainId: 998,
    target: nftContract,
    callData: mintCallData,
    value: "0",
    recipient: userAddress,
    deadline: Math.floor(Date.now() / 1000) + 300,
    nonce: crypto.randomUUID(),
    metadata: { action: "mint" },
  },
});

routes[`POST /x402/execute/${quote.id}`] = quote.routeConfig;
```

## Sign On The Client

Register the normal Hyperliquid exact scheme plus the intent extension. When
the server's 402 response declares an execution intent, the extension signs it
and attaches the signed intent to the x402 payment payload.

```ts
const client = new x402Client()
  .register("hyperliquid:testnet", new ExactHyperliquidScheme(wallet))
  .registerExtension(createExecutionIntentClientExtension({ signer: wallet }));
```

The signer is expected to support EIP-712 `signTypedData`. For most browser
wallet clients and `viem` local accounts, the same EVM address can sign both the
Hyperliquid payment action and the execution intent.

## Verify And Execute

After x402 settlement succeeds, verify that the signed intent matches the
quoted requirement and the settled payer.

```ts
const verified = await verifyPaidExecutionIntent({
  paymentPayload,
  paymentRequirements,
  settleResponse,
});

if (!verified.ok) {
  throw new Error(verified.reason);
}
```

For a pure TypeScript gateway, provide an executor function. This is where your
app simulates the call, checks allowlists, submits a HyperEVM transaction, and
returns the execution transaction hash.

```ts
const executor = createIntentExecutor({
  async execute(context) {
    const tx = await walletClient.sendTransaction({
      to: context.intent.target,
      data: context.intent.callData,
      value: BigInt(context.intent.value),
    });

    return {
      transaction: tx,
      network: `eip155:${context.intent.chainId}`,
    };
  },
});

const receipt = await executor.execute({
  paymentPayload,
  paymentRequirements,
  settleResponse,
});
```

## Trust Model

This first release supports TypeScript gateways. That makes the operator or app
server the HyperEVM transaction sender, so it is best for brokered execution,
allowlisted mints, swaps with explicit recipients, and other flows where the app
can define safe target/call-data policy.

Use the intent hash and quote id as idempotency keys. Store both the Hyperliquid
payment transaction and the HyperEVM execution transaction so users can see
whether the flow is paid, executing, executed, failed, or refunded.
