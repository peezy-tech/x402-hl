---
title: Execution Intents
description: Bind a finalized HyperCore x402 payment to a constrained, brokered HyperEVM execution saga.
---

# Execution Intents

`x402-hl/intents` version 2 lets an application quote an action on HyperEVM,
settle its payment on HyperCore, and run the action through an application-owned
gateway. The gateway is a trusted broker. This flow is not an atomic
cross-chain transaction and does not make arbitrary calldata safe.

The supported sequence is:

```txt
create and persist quote
  -> advertise x402 PaymentRequirements + intent template
  -> client approves the application/gateway domain
  -> client signs the exact finalized PaymentRequirements hash + intent
  -> verify the intent, domain, quote, template, payment hash, and signature
     before settlement
  -> settle the HyperCore payment
  -> verify settlement, domain, quote, template, payment hash, and signer
  -> atomically register the paid intent in a durable store
  -> claim -> policy/decode -> simulate -> submit -> confirm
  -> executed, or a confirmed refund, or manual intervention
```

Version 1 was an unpublished draft. Version 2 is deliberately brokered-only;
the package does not include a Solidity router, smart-account executor, bridge,
or inventory manager.

## Security Contract

Every deployment must configure the same `ExecutionIntentDomain` on the client
and gateway:

```ts
import type { ExecutionIntentDomain } from "x402-hl/intents";

export const intentDomain = {
  application: "com.example.mint/v1",
  gateway: "0x1111111111111111111111111111111111111111",
} satisfies ExecutionIntentDomain;
```

`application` is a stable application and environment identifier. `gateway` is
the stable EVM address used as the EIP-712 verifying-contract domain value.
Clients must obtain both values from trusted local configuration, not copy them
blindly from a `402` response.

The version-2 signature commits to:

- the application, gateway, user, execution chain, target, calldata hash,
  native value, recipient, refund address, gas/slippage limits, deadline,
  nonce, quote id, and metadata hash;
- a canonical hash of the selected, finalized `PaymentRequirements`, including
  its scheme, network, asset, amount, payee, timeout, and complete `extra`
  object.

The quote uses an `intentTemplateHash` before finalized payment requirements
exist. The final client signature uses a non-zero `paymentRequirementsHash`.
Never treat a template hash as authorization to execute.

## Create And Persist A Quote

Create a unique quote id, persist the quoted intent and expiry in application
storage, then install the returned `routeConfig` on the exact route that serves
the quote:

```ts
import { createIntentQuote } from "x402-hl/intents/server";

const quote = createIntentQuote({
  id: crypto.randomUUID(),
  network: "hyperliquid:testnet",
  price: "$0.05",
  payTo: process.env.HYPERLIQUID_PAY_TO_ADDRESS!,
  description: "Allowlisted mint",
  intent: {
    application: intentDomain.application,
    gateway: intentDomain.gateway,
    user: userAddress,
    chainId: 998,
    target: mintContract,
    callData: canonicalMintCallData,
    value: "0",
    recipient: userAddress,
    refundAddress: userAddress,
    maxGasCost: "1000000000000000",
    maxSlippageBps: 0,
    deadline: Math.floor(Date.now() / 1000) + 300,
    nonce: crypto.randomUUID(),
    metadata: { action: "mint" },
  },
});

await quoteStore.insert({
  id: quote.id,
  intentTemplateHash: quote.intentTemplateHash,
  intent: quote.intent,
});

routes[`POST /x402/execute/${quote.id}`] = quote.routeConfig;
```

Do not reconstruct `expectedQuoteId` or `expectedIntentTemplateHash` from the
request at execution time. Read the values from the server-side quote record.

## Approve And Sign On The Client

Register the normal Hyperliquid exact scheme and the intent extension. The
client extension hashes the exact `PaymentRequirements` selected by
`@x402/core`; it refuses a requirement that was not advertised by the server.

```ts
import { x402Client } from "@x402/core/client";
import { ExactHyperliquidScheme } from "x402-hl/exact/client";
import {
  createExecutionIntentClientExtension,
} from "x402-hl/intents/client";

const client = new x402Client()
  .register("hyperliquid:testnet", new ExactHyperliquidScheme(wallet))
  .registerExtension(
    createExecutionIntentClientExtension({
      signer: wallet,
      domain: intentDomain,
      approve(intent) {
        return (
          intent.chainId === 998 &&
          intent.target.toLowerCase() === mintContract.toLowerCase() &&
          intent.recipient.toLowerCase() === wallet.address.toLowerCase()
        );
      },
    }),
  );
```

An application can supply an exact `intent` or `IntentResolver` instead of an
approval callback. Either way, show the target action, amount, recipient,
deadline, and refund address to the user before signing. The signer must support
EIP-712 `signTypedData`, and the intent user must equal the recovered signer.

`createIntentDeclaration` marks a declaration `required` by default, and the
client extension then refuses any selected payment requirement that is not
bound to the declared intent. A server that also advertises a plain,
intent-free payment option must declare the intent with
`createIntentDeclaration(intent, { required: false })`; the extension signs an
intent only when the selected requirement carries the `x402HlIntent`
commitment and otherwise sends a normal payment without one.

## Verify Before Settlement

Settlement moves the user's funds, so run every check that does not require a
settlement response first. `verifyPreSettlementExecutionIntent` verifies intent
presence, canonical shape, the payment-requirements hash, domain, quote id,
template hash, payment binding, deadline, and intent signature. It also
validates the signed Hyperliquid payment payload, recovers its payer, and by
default requires that payer to match the recovered intent signer. A payment
payload that fails here — for example a client that never attached a signed
intent or whose payment was signed by another payer — must be rejected before
settling, because `execute` refuses to register such a payload after settlement
and the settled payment would have no durable record and no automated refund:

```ts
import {
  verifyPreSettlementExecutionIntent,
} from "x402-hl/intents/server";

const preflight = await verifyPreSettlementExecutionIntent({
  paymentPayload,
  paymentRequirements,
  expectedDomain: intentDomain,
  expectedQuoteId: persistedQuote.id,
  expectedIntentTemplateHash: persistedQuote.intentTemplateHash,
});

if (!preflight.ok) {
  throw new Error(`${preflight.reason}: ${preflight.message}`);
}

const settleResponse = await settleHyperCorePayment();
```

An executor exposes the same check as `verifyBeforeSettlement`, using its
configured domain. Passing this check authorizes settlement, not execution:
the settlement-dependent checks below still run afterwards.

## Verify Again After Settlement

`verifyPaidExecutionIntent` runs the same checks plus the settlement-dependent
ones. It checks the receipt payer against the signer again and requires a
successful settlement with a payer, transaction identifier, and matching
network, along with locally trusted domain, quote id, and template hash values:

```ts
import {
  verifyPaidExecutionIntent,
} from "x402-hl/intents/server";

const verified = await verifyPaidExecutionIntent({
  paymentPayload,
  paymentRequirements,
  settleResponse,
  expectedDomain: intentDomain,
  expectedQuoteId: persistedQuote.id,
  expectedIntentTemplateHash: persistedQuote.intentTemplateHash,
});

if (!verified.ok) {
  throw new Error(`${verified.reason}: ${verified.message}`);
}
```

Verification fails on missing or unsuccessful settlement, a changed payment
requirement, mismatched domain/quote/template, expired intent, invalid
signature, or a payer/signer mismatch. Keep `requireSamePayer` enabled unless
the application has an explicit, separately reviewed delegated-payer design.

The executor's `execute` runs this same verification but defers only the
deadline check to the durable state machine. Settlement takes real time, so an
intent can expire between signing and settlement confirmation; a payment that
settles after the signed deadline is still registered as `paid` and then driven
to an automated refund instead of failing with no durable record. Every other
verification failure still throws before registration, because a mismatched or
unsigned intent has no trustworthy refund address.

## Durable Store And State Machine

Production gateways must implement the asynchronous `IntentExecutionStore`:

```ts
interface IntentExecutionStore {
  registerPaid(
    record: IntentExecutionRecord,
  ): Promise<IntentStoreRegistrationResult>;
  get(intentHash: string): Promise<IntentExecutionRecord | undefined>;
  getPayment(
    paymentNetwork: string,
    paymentTransaction: string,
  ): Promise<IntentExecutionRecord | undefined>;
  transition(
    transition: IntentExecutionTransition,
  ): Promise<IntentStoreTransitionResult>;
}
```

`registerPaid` must atomically enforce uniqueness for the primary intent hash
and quote, plus every `(paymentNetwork, paymentTransaction)`. If the same signed
intent arrives with a new settled transaction, registration must durably create
a refund-only `duplicatePayment` record instead of returning an `intent_hash`
conflict. Execution and refund transaction identifiers remain globally unique
across primary and duplicate-payment records.

`transition` is a compare-and-swap over the selected payment identity, revision,
current status, and claim token. Back it with a database transaction and unique
indexes. A read followed by an unconditional update is not sufficient. Existing
store adapters must add `getPayment` and payment-keyed transition support before
upgrading.

The state machine is:

```txt
paid
  -> execution_claimed
  -> execution_submitted
  -> executed

execution_claimed | execution_submitted
  -> execution_failed
  -> refund_pending
  -> refund_claimed
  -> refund_submitted
  -> refunded | refund_failed

uncertain execution, uncertain refund, or unreconciled store conflict
  -> manual_intervention
```

`executed`, `refunded`, and `manual_intervention` are terminal. A primary
`refund_failed` record can be retried with `retryRefund`; duplicate-payment
refunds use `retryPaymentRefund`. If a process crashes while a record holds a
claim, `recover(intentHash)` resumes a primary record and
`recoverPayment(network, transaction)` resumes a duplicate-payment refund
using the claim token persisted on the record: adapters are only invoked after
the matching `*_submitted` transition is durably recorded, so a record
stranded in `execution_claimed`, `execution_failed`, `refund_pending`,
`refund_claimed`, or `refund_failed` is driven to a refund, while
`execution_submitted` and `refund_submitted` park in `manual_intervention` for
reconciliation. Call either recovery method only when no other executor
process can still be driving the record — for example on restart after a crash,
before resuming traffic. `InMemoryIntentExecutionStore` implements the contract for tests and
single-process development only. It is not durable and must not be used as a
production replay boundary.

## Policy, Simulation, Execution, And Refund

`createIntentExecutor` requires every production boundary explicitly:

```ts
import {
  createIntentExecutor,
  type IntentExecutorConfig,
} from "x402-hl/intents/server";

const executor = createIntentExecutor({
  store: durableStore,
  domain: intentDomain,
  policy: authorizeExactCall,
  simulate: simulateExactCall,
  execute: submitAndConfirmExactCall,
  refund: submitAndConfirmRefund,
} satisfies IntentExecutorConfig);
```

The policy callback must decode calldata with the canonical ABI, reject unknown
targets and selectors, validate every action-specific argument, re-encode the
call to reject non-canonical calldata, and return evidence for the exact chain,
target, selector, calldata hash, value, and recipient.

Simulation must evaluate that same call from the real relayer account against
current chain state. Return exact binding evidence plus estimated gas cost and
slippage; the executor rejects evidence outside the signed limits.

Execution is successful only after the adapter returns a confirmed successful
receipt on `eip155:<intent.chainId>`. A transaction hash alone is not success.
Adapters must use the supplied `idempotencyKey` and reconcile a timeout before
retrying.

Refunds are application operations, not an automatic Hyperliquid protocol
feature. A refund adapter must return funds to the signed `refundAddress`,
confirm the refund transaction or ledger update, and use its separate
`<intentHash>:refund` idempotency key. If execution or refund may have
succeeded, return an uncertain result; the state machine moves to
`manual_intervention` instead of risking a double execution or double refund.

See [Production sample](./production-sample) for the complete gateway shape.

## Brokered Trust And Inventory

HyperCore payment and HyperEVM execution are separate operations:

- the user pays first, and a later destination action can fail;
- the operator controls the relayer, policy, durable store, monitoring, and
  refund path;
- the signed intent constrains what the operator is authorized to do, but
  cannot force timely execution or refund;
- there is no atomic rollback across HyperCore and HyperEVM.

Keep the HyperEVM relayer pre-funded with the gas and action inventory needed to
honor accepted quotes. HyperCore receipts do not become HyperEVM inventory
automatically. Treat HyperCore-to-HyperEVM transfers or bridging as a separate,
asynchronous treasury-rebalancing process. Do not accept a quote based on an
unconfirmed future rebalance. Monitor available inventory, reserved inventory,
outstanding paid intents, refund liquidity, and relayer gas before advertising
new quotes.

## API Reference

The three entry points are ESM exports with TypeScript declarations.
`x402-hl/intents/client` and `x402-hl/intents/server` re-export the complete
common `x402-hl/intents` surface.

### `x402-hl/intents`

| Group | Public exports |
| --- | --- |
| Wire constants | `X402_HL_INTENTS_EXTENSION`, `X402_HL_INTENTS_EXTRA_KEY`, `X402_HL_INTENT_VERSION`, `X402_HL_INTENT_DOMAIN_NAME`, `X402_HL_INTENT_DOMAIN_VERSION`, `X402_HL_INTENT_PRIMARY_TYPE`, `X402_HL_INTENT_TYPES`, `ZERO_ADDRESS`, `ZERO_BYTES32` |
| Schemas | `HexSchema`, `Bytes32Schema`, `EvmAddressSchema`, `NonZeroEvmAddressSchema`, `DecimalIntegerStringSchema`, `IntentApplicationSchema`, `JsonValueSchema`, `JsonRecordSchema`, `IntentExecutionModeSchema`, `ExecutionIntentDomainSchema`, `HyperEvmExecutionIntentSchema`, `SignedHyperEvmExecutionIntentSchema`, `IntentDeclarationSchema`, `IntentPaymentExtraSchema`, `IntentExecutionStatusSchema`, `IntentFailureReasonSchema`, `IntentFailureSchema`, `IntentExecutionReceiptSchema` |
| Schema-derived types | `JsonValue`, `IntentExecutionMode`, `ExecutionIntentDomain`, `HyperEvmExecutionIntent`, `HyperEvmExecutionIntentInput`, `SignedHyperEvmExecutionIntent`, `IntentDeclaration`, `IntentPaymentExtra`, `IntentExecutionStatus`, `IntentFailureReason`, `IntentFailure`, `IntentExecutionReceipt` |
| Canonical JSON and typed data | `stableJson`, `ExecutionIntentPaymentBinding`, `normalizeExecutionIntent`, `hashIntentMetadata`, `hashIntentText`, `normalizeBytes32`, `buildExecutionIntentTypedData`, `hashExecutionIntent`, `hashExecutionIntentTemplate` |
| Payment binding | `CanonicalPaymentRequirements`, `IntentBindingFailure`, `IntentBindingResult`, `canonicalizePaymentRequirements`, `hashPaymentRequirements`, `createIntentPaymentExtra`, `readIntentPaymentExtra`, `verifyIntentPaymentExtra` |
| Signing | `IntentSigner`, `SignExecutionIntentOptions`, `getIntentSignerAddress`, `signExecutionIntent`, `recoverExecutionIntentSigner`, `verifyExecutionIntentSignature` |
| Extensions | `IntentDeclarationOptions`, `createIntentDeclaration`, `readIntentDeclaration`, `attachSignedExecutionIntent`, `readSignedExecutionIntent` |
| Status helpers | `TERMINAL_INTENT_EXECUTION_STATUSES`, `isTerminalIntentExecutionStatus` |

### `x402-hl/intents/client`

In addition to every common export:

| Kind | Public exports |
| --- | --- |
| Types | `IntentResolver`, `IntentApproval`, `ExecutionIntentClientExtensionConfig` |
| Functions | `signDeclaredExecutionIntent`, `createExecutionIntentClientExtension` |

### `x402-hl/intents/server`

In addition to every common export:

| Group | Public exports |
| --- | --- |
| Quote | `IntentQuoteInput`, `ResolvedIntentQuote`, `createIntentQuote` |
| Verification | `PreSettlementIntentVerificationInput`, `VerifiedPreSettlementExecutionIntent`, `PreSettlementIntentVerificationResult`, `verifyPreSettlementExecutionIntent`, `PaidIntentVerificationInput`, `VerifiedPaidExecutionIntent`, `PaidIntentVerificationResult`, `verifyPaidExecutionIntent`, `assertPaidExecutionIntent` |
| Durable store | `IntentExecutionRecordSchema`, `IntentExecutionRecord`, `IntentStoreConflictKey`, `IntentStoreRegistrationResult`, `IntentExecutionTransitionPatch`, `IntentExecutionTransition`, `IntentStoreTransitionResult`, `IntentExecutionStore`, `InMemoryIntentExecutionStore`, `isLegalIntentExecutionTransition` |
| Executor types | `IntentExecutionContext`, `IntentPolicyDecision`, `IntentSimulationResult`, `IntentExecutionResult`, `IntentRefundContext`, `IntentRefundResult`, `IntentExecutorConfig` |
| Executor runtime | `IntentStoreConflictError`, `createIntentExecutor` |
