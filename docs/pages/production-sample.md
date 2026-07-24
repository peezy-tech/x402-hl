---
title: Production Brokered Intent Sample
description: Build a durable, policy-constrained HyperCore-payment to HyperEVM-execution gateway.
---

# Production Brokered Intent Sample

This page is a production reference shape for version-2 brokered execution
intents. It is intentionally explicit about trust and failure handling. It is
not a claim that a funded end-to-end intent deployment currently exists.

The repository also contains a typechecked, offline companion at
[`examples/intents/production.ts`](../../examples/intents/production.ts). It
implements the package-facing quote, payment-identifier, signer, durable-store,
policy, simulation, confirmed execution, refund, and safe-audit-log boundaries.
Its chain adapter is deterministic and does not transfer funds.

The recorded payment evidence is narrower:

- funded `hyperliquid:testnet` x402 settlements succeeded on 2026-06-09 and
  2026-06-12;
- a recorded `hyperliquid:mainnet` browser settlement attempt on 2026-06-13
  failed with `hl_exchange_error`;
- no funded HyperEVM execution-intent smoke has been recorded on either
  network.

The older temporary Venice gateway was configured for mainnet exact payments
and prepaid balances. Availability and configuration are not proof of a funded
mainnet settlement, and that gateway did not prove the version-2 intent saga.

## Architecture

The gateway is an application-owned broker:

```txt
durable quote + payment id
  -> 402 with finalized payment requirements and intent template
  -> client approves trusted application/gateway and signs payment + intent
  -> pre-settlement intent verification
  -> HyperCore settlement
  -> strict server verification
  -> durable paid registration
  -> policy + canonical ABI decode
  -> simulation
  -> confirmed HyperEVM execution
  -> executed

definitive pre-execution failure
  -> confirmed refund -> refunded

uncertain execution/refund
  -> manual_intervention
```

Payment and execution are not atomic. The operator is trusted to keep
destination inventory available, execute the approved action, monitor stalled
records, and refund eligible failures.

## Runtime Configuration

Keep deployment identity, payee, relayer, and treasury values outside git:

```sh
HYPERLIQUID_NETWORK=hyperliquid:testnet
HYPERLIQUID_PAY_TO_ADDRESS=0x...
INTENT_APPLICATION=com.example.mint/testnet/v1
INTENT_GATEWAY_ADDRESS=0x...
HYPEREVM_CHAIN_ID=998
HYPEREVM_RPC_URL=https://...
HYPEREVM_RELAYER_PRIVATE_KEY=0x...
ALLOWED_MINT_CONTRACT=0x...
DATABASE_URL=postgres://...
```

The application and gateway form a deployment identity:

```ts
import type { ExecutionIntentDomain } from "x402-hl/intents";

const intentDomain = {
  application: process.env.INTENT_APPLICATION!,
  gateway: process.env.INTENT_GATEWAY_ADDRESS as `0x${string}`,
} satisfies ExecutionIntentDomain;
```

Clients must pin the same values in trusted application configuration. They
must not adopt an application or gateway value merely because a server placed
it in a `402` response.

## 1. Create A Quote And Payment Identifier

Use separate unique values for the quote and the payment attempt. Persist them
before advertising the route:

```ts
import {
  PAYMENT_IDENTIFIER,
  declarePaymentIdentifierExtension,
} from "@x402/extensions/payment-identifier";
import { encodeFunctionData } from "viem";
import { createIntentQuote } from "x402-hl/intents/server";

const quoteId = crypto.randomUUID();
const paymentId = crypto.randomUUID();
const callData = encodeFunctionData({
  abi: mintAbi,
  functionName: "mint",
  args: [userAddress, tokenId],
});

const quote = createIntentQuote({
  id: quoteId,
  network: "hyperliquid:testnet",
  price: "$0.05",
  payTo: process.env.HYPERLIQUID_PAY_TO_ADDRESS!,
  maxTimeoutSeconds: 300,
  description: "Allowlisted mint",
  intent: {
    application: intentDomain.application,
    gateway: intentDomain.gateway,
    user: userAddress,
    chainId: 998,
    target: process.env.ALLOWED_MINT_CONTRACT as `0x${string}`,
    callData,
    value: "0",
    recipient: userAddress,
    refundAddress: userAddress,
    maxGasCost: "1000000000000000",
    maxSlippageBps: 0,
    deadline: Math.floor(Date.now() / 1000) + 300,
    nonce: crypto.randomUUID(),
    metadata: { action: "mint", tokenId: tokenId.toString() },
  },
});

const routeConfig = {
  ...quote.routeConfig,
  extensions: {
    ...quote.routeConfig.extensions,
    [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
  },
};

await quoteStore.insert({
  quoteId,
  paymentId,
  intentTemplateHash: quote.intentTemplateHash,
  intent: quote.intent,
  expiresAt: quote.intent.deadline,
});

routes[`POST /x402/execute/${quoteId}`] = routeConfig;
```

Return `quoteId` and `paymentId` to the client over the authenticated quote
response. Require the payment payload to return that exact payment id.

## 2. Sign The Selected Final Payment Requirements

Register a small upstream payment-identifier extension alongside the intent
extension:

```ts
import { x402Client, type ClientExtension } from "@x402/core/client";
import type { PaymentPayload } from "@x402/core/types";
import {
  PAYMENT_IDENTIFIER,
  appendPaymentIdentifierToExtensions,
} from "@x402/extensions/payment-identifier";
import { ExactHyperliquidScheme } from "x402-hl/exact/client";
import {
  createExecutionIntentClientExtension,
} from "x402-hl/intents/client";

function paymentIdentifier(id: string): ClientExtension {
  return {
    key: PAYMENT_IDENTIFIER,
    async enrichPaymentPayload(payload: PaymentPayload) {
      const extensions = { ...(payload.extensions ?? {}) };
      appendPaymentIdentifierToExtensions(extensions, id);
      return { ...payload, extensions };
    },
  };
}

const client = new x402Client()
  .register("hyperliquid:testnet", new ExactHyperliquidScheme(wallet))
  .registerExtension(paymentIdentifier(paymentId))
  .registerExtension(
    createExecutionIntentClientExtension({
      signer: wallet,
      domain: intentDomain,
      approve(intent) {
        return (
          intent.quoteId === quoteId &&
          intent.chainId === 998 &&
          intent.target.toLowerCase() ===
            allowedMintContract.toLowerCase() &&
          intent.recipient.toLowerCase() ===
            wallet.address.toLowerCase()
        );
      },
    }),
  );
```

The intent extension signs the canonical hash of the exact finalized
`PaymentRequirements` selected by `@x402/core`, including its complete `extra`
object. Do not hash a preliminary price configuration or reconstruct
requirements after settlement.

## 3. Validate Payment Id, Settlement, And Quote

Before requesting settlement, validate the upstream payment identifier against
the persisted quote, then run `verifyPreSettlementExecutionIntent` (or the
executor's `verifyBeforeSettlement`) with the same payload, requirements, and
persisted quote values. A payload that fails either application-level binding or
pre-settlement checks — a missing, malformed, mismatched, or unsigned intent,
an invalid signed Hyperliquid payment payload, or a payment payer that differs
from the recovered intent signer — must be rejected without settling, because
it can never be registered or automatically refunded afterwards.

After settlement, provide the actual payment payload, exact settled
requirements, and facilitator response to paid-intent verification. Repeat the
payment-identifier check as defense in depth:

```ts
import {
  extractAndValidatePaymentIdentifier,
} from "@x402/extensions/payment-identifier";
import {
  verifyPaidExecutionIntent,
} from "x402-hl/intents/server";

const identifier = extractAndValidatePaymentIdentifier(paymentPayload);
if (!identifier.validation.valid || identifier.id !== persistedQuote.paymentId) {
  throw new Error("payment_identifier_mismatch");
}

const verified = await verifyPaidExecutionIntent({
  paymentPayload,
  paymentRequirements,
  settleResponse,
  expectedDomain: intentDomain,
  expectedQuoteId: persistedQuote.quoteId,
  expectedIntentTemplateHash: persistedQuote.intentTemplateHash,
});

if (!verified.ok) {
  throw new Error(`${verified.reason}: ${verified.message}`);
}
```

This call requires `settleResponse.success === true`, a payer, a settlement
transaction, a matching network, the locally expected domain/quote/template,
the exact payment-requirements hash, an unexpired intent, and a valid payer
signature. The receipt payer is checked against the recovered intent signer
again. Never replace settlement evidence with a successful facilitator
`verify()` response.

If a separately reviewed delegated-payer design sets `requireSamePayer: false`,
verification still requires a valid payment signature and binds the settlement
receipt payer to the recovered payment payer. Only equality between that payer
and the intent signer is relaxed.

## 4. Implement A Durable Store Adapter

The store is the replay and concurrency boundary. Store every settled payment,
not only one row per intent: one payment is the primary execution funding row,
and later payments for the same signed intent are refund-only rows. A production
table needs one canonical transaction function shared by checks, lookups, conflict
targets, and indexes. This example matches ECMAScript `trim()` and then folds ASCII
case:

```sql
CREATE FUNCTION x402_canonical_transaction(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT pg_catalog.translate(
    pg_catalog.btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz'
  )
$function$;

ALTER TABLE intent_payments
  ADD PRIMARY KEY (payment_network, payment_transaction),
  ADD CONSTRAINT payment_transaction_canonical
    CHECK (payment_transaction = x402_canonical_transaction(payment_transaction)),
  ADD CONSTRAINT execution_transaction_canonical
    CHECK (execution_transaction IS NULL OR execution_transaction = x402_canonical_transaction(execution_transaction)),
  ADD CONSTRAINT refund_transaction_canonical
    CHECK (refund_transaction IS NULL OR refund_transaction = x402_canonical_transaction(refund_transaction));
CREATE UNIQUE INDEX intents_payment_tx_uq
  ON intent_payments (
    payment_network,
    x402_canonical_transaction(payment_transaction)
  );
CREATE UNIQUE INDEX intents_primary_intent_uq
  ON intent_payments (intent_hash)
  WHERE primary_payment;
CREATE UNIQUE INDEX intents_primary_quote_uq
  ON intent_payments (application, lower(gateway), quote_id)
  WHERE primary_payment;
CREATE UNIQUE INDEX intents_execution_tx_uq
  ON intent_payments (
    execution_network,
    x402_canonical_transaction(execution_transaction)
  )
  WHERE execution_transaction IS NOT NULL;
CREATE UNIQUE INDEX intents_refund_tx_uq
  ON intent_payments (
    refund_network,
    x402_canonical_transaction(refund_transaction)
  )
  WHERE refund_transaction IS NOT NULL;
```

For an existing table, run the locked, collision-checking backfill represented by
`POSTGRES_INTENT_STORE_CANONICALIZATION_MIGRATION_DDL` before deploying the new
adapter. Never silently choose a winner when two legacy rows collapse to one
canonical payment key.

Adapt those rows to `IntentExecutionStore`:

```ts
import type {
  IntentExecutionRecord,
  IntentExecutionStore,
  IntentExecutionTransition,
} from "x402-hl/intents/server";

const canonicalTransaction = (value: string) =>
  value.trim().replace(/[A-Z]/g, character => character.toLowerCase());

function canonicalTransition(input: IntentExecutionTransition) {
  return {
    ...input,
    ...(input.paymentTransaction
      ? { paymentTransaction: canonicalTransaction(input.paymentTransaction) }
      : {}),
    patch: input.patch && {
      ...input.patch,
      ...(input.patch.executionTransaction
        ? {
            executionTransaction: canonicalTransaction(
              input.patch.executionTransaction,
            ),
          }
        : {}),
      ...(input.patch.refundTransaction
        ? {
            refundTransaction: canonicalTransaction(input.patch.refundTransaction),
          }
        : {}),
    },
  } as IntentExecutionTransition;
}

class PostgresIntentStore implements IntentExecutionStore {
  constructor(private readonly db: Database) {}

  async registerPaid(record: IntentExecutionRecord) {
    const canonicalRecord = {
      ...record,
      paymentTransaction: canonicalTransaction(record.paymentTransaction),
      executionTransaction: record.executionTransaction
        ? canonicalTransaction(record.executionTransaction)
        : undefined,
      refundTransaction: record.refundTransaction
        ? canonicalTransaction(record.refundTransaction)
        : undefined,
    };
    return this.db.transaction(async tx => {
      // INSERT the primary payment, or atomically insert a refund-only
      // duplicate-payment row when the same intent already has a different
      // settled transaction. Never return a conflict without retaining that
      // additional payment.
      return atomicRegisterPaid(tx, canonicalRecord);
    });
  }

  async get(intentHash: string) {
    return loadPrimaryIntentRecord(this.db, intentHash);
  }

  async getPayment(paymentNetwork: string, paymentTransaction: string) {
    return loadPaymentRecord(
      this.db,
      paymentNetwork,
      canonicalTransaction(paymentTransaction),
    );
  }

  async transition(input: IntentExecutionTransition) {
    return this.db.transaction(async tx => {
      // One UPDATE must match the selected payment row + expected revision +
      // from status and, when present, the claim token. Increment revision in
      // that UPDATE, validate the legal state transition, and return the row.
      return compareAndSwapIntent(tx, canonicalTransition(input));
    });
  }
}
```

`atomicRegisterPaid`, `loadPrimaryIntentRecord`, `loadPaymentRecord`, and
`compareAndSwapIntent` are database-specific application code; the example
names are not package exports. This is a store-interface migration: adapters
must add payment-keyed lookup and compare-and-swap support before upgrading.
Test two processes racing the same quote, distinct payments for one intent,
payment transaction, execution claim, and refund claim.
`InMemoryIntentExecutionStore` is only for tests and single-process development.

## 5. Canonically Decode And Allowlist The Call

Do not authorize calldata by selector alone. Decode with the exact ABI, validate
the target and every relevant argument, then re-encode and compare the complete
bytes:

```ts
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  keccak256,
  type Hex,
} from "viem";
import type {
  IntentExecutionContext,
  IntentPolicyDecision,
} from "x402-hl/intents/server";

function authorizeExactCall(
  context: IntentExecutionContext,
): IntentPolicyDecision {
  const { intent } = context;
  if (
    intent.chainId !== 998 ||
    getAddress(intent.target) !== getAddress(allowedMintContract) ||
    intent.value !== "0"
  ) {
    return { allowed: false };
  }

  try {
    const decoded = decodeFunctionData({
      abi: mintAbi,
      data: intent.callData as Hex,
    });
    if (decoded.functionName !== "mint") return { allowed: false };

    const [recipient, tokenId] = decoded.args;
    if (getAddress(recipient) !== getAddress(intent.recipient)) {
      return { allowed: false };
    }
    if (!isTokenIdAvailable(tokenId)) return { allowed: false };

    const canonical = encodeFunctionData({
      abi: mintAbi,
      functionName: "mint",
      args: [recipient, tokenId],
    });
    if (canonical.toLowerCase() !== intent.callData.toLowerCase()) {
      return { allowed: false };
    }

    return {
      allowed: true,
      chainId: intent.chainId,
      target: intent.target,
      selector: intent.callData.slice(0, 10),
      callDataHash: keccak256(intent.callData as Hex),
      value: intent.value,
      recipient: intent.recipient,
      metadata: {
        functionName: "mint",
        tokenId: tokenId.toString(),
      },
    };
  } catch {
    return { allowed: false };
  }
}
```

Use a separate allowlist per application version and chain. A signed call is
authenticated input, not trusted input.

## 6. Simulate, Submit, And Confirm

Simulation must run from the real relayer account against the current chain:

```ts
import { keccak256, type Hex } from "viem";

async function simulateExactCall(context: IntentExecutionContext) {
  const request = {
    account: relayer.address,
    to: context.intent.target,
    data: context.intent.callData as Hex,
    value: BigInt(context.intent.value),
  } as const;

  try {
    await publicClient.call(request);
    const gas = await publicClient.estimateGas(request);
    const gasPrice = await publicClient.getGasPrice();
    return {
      success: true as const,
      chainId: context.intent.chainId,
      target: context.intent.target,
      callDataHash: keccak256(context.intent.callData as Hex),
      value: context.intent.value,
      recipient: context.intent.recipient,
      gasCost: (gas * gasPrice).toString(),
      slippageBps: 0,
    };
  } catch {
    return { success: false as const };
  }
}

async function submitAndConfirmExactCall(context: IntentExecutionContext) {
  const transaction = await walletClient.sendTransaction({
    account: relayer,
    to: context.intent.target,
    data: context.intent.callData as Hex,
    value: BigInt(context.intent.value),
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transaction,
  });

  if (receipt.status !== "success") {
    return {
      success: false as const,
      refundSafe: true,
      mayHaveSucceeded: false,
    };
  }

  return {
    success: true as const,
    confirmed: true as const,
    transaction,
    network: `eip155:${context.intent.chainId}`,
  };
}
```

A transport timeout after submission is uncertain. Let the adapter throw or
return an uncertain result so the record moves to `manual_intervention`; first
reconcile the destination transaction using the stable intent idempotency key.

## 7. Confirm Refunds

Refunds happen on the payment side and require operator-controlled liquidity.
Implement the refund adapter with the same care as settlement:

```ts
import type { IntentRefundContext } from "x402-hl/intents/server";

async function submitAndConfirmRefund(context: IntentRefundContext) {
  const outcome = await sendConfirmedHyperCoreRefund({
    network: context.record.paymentNetwork,
    asset: context.record.paymentAsset,
    amount: context.record.paymentAmount,
    destination: context.intent.refundAddress,
    idempotencyKey: context.idempotencyKey,
  });

  if (outcome.kind === "confirmed") {
    return {
      success: true as const,
      confirmed: true as const,
      transaction: outcome.transaction,
      network: context.record.paymentNetwork,
    };
  }
  if (outcome.kind === "unknown") {
    return {
      success: false as const,
      retryable: false,
      mayHaveSucceeded: true,
    };
  }
  return {
    success: false as const,
    retryable: outcome.retryable,
    mayHaveSucceeded: false,
  };
}
```

`sendConfirmedHyperCoreRefund` is application code, not an `x402-hl` export.
It must submit from controlled refund inventory, confirm the exact ledger
update, and reconcile its idempotency key before retrying. Never auto-refund an
execution that may already have succeeded.

## 8. Run The Saga And Expose Status

```ts
import { createIntentExecutor } from "x402-hl/intents/server";

const executor = createIntentExecutor({
  store: new PostgresIntentStore(db),
  domain: intentDomain,
  policy: authorizeExactCall,
  simulate: simulateExactCall,
  execute: submitAndConfirmExactCall,
  refund: submitAndConfirmRefund,
});

const record = await executor.execute({
  paymentPayload,
  paymentRequirements,
  settleResponse,
  expectedQuoteId: persistedQuote.quoteId,
  expectedIntentTemplateHash: persistedQuote.intentTemplateHash,
});
```

Expose a status route backed by `executor.get(intentHash)`. Omit internal claim
tokens. Return the payment, execution, and refund transaction identifiers,
attempt counts, failure reason, and timestamps. Alert operators on
`manual_intervention`, long-lived claims/submissions, retryable
`refund_failed`, inventory pressure, and database conflicts.

## Inventory And Rebalancing

The payee receives spot USDC on HyperCore. The relayer spends gas and possibly
action inventory on HyperEVM. Those balances are not interchangeable during the
request:

- reserve HyperEVM gas and action inventory before issuing a quote;
- reserve HyperCore refund liquidity for outstanding paid intents;
- decrement available inventory atomically with quote acceptance;
- treat HyperCore-to-HyperEVM transfers or bridging as asynchronous treasury
  rebalancing, outside the paid request;
- stop quoting when available inventory cannot cover execution and refund
  policy.

An anticipated rebalance is not inventory. A production readiness check should
reconcile HyperCore receiver balance, HyperEVM relayer gas, action inventory,
reserved quotes, paid records, and pending refunds independently.
