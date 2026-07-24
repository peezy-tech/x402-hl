import { x402Client } from "@x402/core/client";
import type { PaymentRequired, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { keccak256 } from "viem";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ExactHyperliquidScheme as ExactHyperliquidClient } from "x402-hl/exact/client";
import {
  createExecutionIntentClientExtension,
} from "x402-hl/intents/client";
import {
  InMemoryIntentExecutionStore,
  createIntentExecutor,
  createIntentQuote,
  verifyPaidExecutionIntent,
  verifyPreSettlementExecutionIntent,
} from "x402-hl/intents/server";

const HYPERLIQUID_TESTNET = "hyperliquid:testnet" as const;
const FIXED_NOW_SECONDS = 1_800_000_000;
const TEST_PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const TEST_USER = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" as const;
const PAY_TO = "0x0000000000000000000000000000000000004020" as const;
const GATEWAY = "0x0000000000000000000000000000000000008080" as const;
const TARGET = "0x0000000000000000000000000000000000009999" as const;
const CALL_DATA = "0x12345678" as const;
const TEST_PAYMENT_TRANSACTION =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
const TEST_EXECUTION_TRANSACTION =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const TEST_REFUND_TRANSACTION =
  "0x4444444444444444444444444444444444444444444444444444444444444444" as const;

const INTENT_DOMAIN = {
  application: "example.test/x402-hl/intents-compat",
  gateway: GATEWAY,
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const signer = privateKeyToAccount(TEST_PRIVATE_KEY);
const quote = createIntentQuote({
  id: "quote-compat-intent-1",
  network: HYPERLIQUID_TESTNET,
  price: "$0.01",
  payTo: PAY_TO,
  description: "Compatibility probe for x402-hl/intents",
  intent: {
    ...INTENT_DOMAIN,
    user: TEST_USER,
    chainId: 998,
    target: TARGET,
    callData: CALL_DATA,
    value: "0",
    recipient: TEST_USER,
    refundAddress: TEST_USER,
    maxGasCost: "1000000000000000",
    maxSlippageBps: 50,
    deadline: FIXED_NOW_SECONDS + 300,
    nonce: "compat-intent-nonce-1",
    metadata: {
      action: "demo-call",
    },
  },
});

const paymentRequirement = {
  scheme: "exact",
  network: HYPERLIQUID_TESTNET,
  amount: "1000000",
  asset: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
  payTo: PAY_TO,
  maxTimeoutSeconds: 300,
  extra: {
    x402HlIntent: quote.paymentExtra,
    decimals: 8,
    tokenSymbol: "USDC",
  },
} satisfies PaymentRequirements;

const paymentRequired = {
  x402Version: 2,
  resource: {
    url: "https://example.test/x402/intents",
    description: "x402-hl intents compatibility probe",
    mimeType: "application/json",
  },
  accepts: [paymentRequirement],
  extensions: quote.routeConfig.extensions,
} satisfies PaymentRequired;

const client = new x402Client()
  .register(HYPERLIQUID_TESTNET, new ExactHyperliquidClient(signer))
  .registerExtension(createExecutionIntentClientExtension({
    signer,
    domain: INTENT_DOMAIN,
    intent: quote.intent,
  }));

const paymentPayload = await client.createPaymentPayload(paymentRequired);
assert(
  paymentPayload.extensions?.["x402-hl/intents"],
  "payment payload should include a signed execution intent",
);

const preflight = await verifyPreSettlementExecutionIntent({
  paymentPayload,
  paymentRequirements: paymentRequirement,
  expectedDomain: INTENT_DOMAIN,
  expectedQuoteId: quote.id,
  expectedIntentTemplateHash: quote.intentTemplateHash,
  now: FIXED_NOW_SECONDS,
});
assert(preflight.ok, preflight.ok ? "verified" : preflight.message);
assert(
  preflight.signer === signer.address,
  "pre-settlement verification should recover the intent signer",
);

const settleResponse = {
  success: true,
  transaction: TEST_PAYMENT_TRANSACTION,
  network: HYPERLIQUID_TESTNET,
  payer: TEST_USER,
} satisfies SettleResponse;

const verification = await verifyPaidExecutionIntent({
  paymentPayload,
  paymentRequirements: paymentRequirement,
  settleResponse,
  expectedDomain: INTENT_DOMAIN,
  expectedQuoteId: quote.id,
  expectedIntentTemplateHash: quote.intentTemplateHash,
  now: FIXED_NOW_SECONDS,
});

assert(verification.ok, verification.ok ? "verified" : verification.message);
assert(
  verification.intentTemplateHash === quote.intentTemplateHash,
  "verified intent should match the quoted intent template",
);

const store = new InMemoryIntentExecutionStore();
let claimSequence = 0;
const executor = createIntentExecutor({
  store,
  domain: INTENT_DOMAIN,
  createClaimToken: () => `compat-claim-${++claimSequence}`,
  policy(context) {
    assert(context.intent.target === TARGET, "policy received wrong target");
    return {
      allowed: true,
      chainId: context.intent.chainId,
      target: context.intent.target,
      selector: context.intent.callData.slice(0, 10),
      callDataHash: keccak256(context.intent.callData as Hex),
      value: context.intent.value,
      recipient: context.intent.recipient,
      metadata: { allowlist: "compat-only" },
    };
  },
  simulate(context) {
    return {
      success: true,
      chainId: context.intent.chainId,
      target: context.intent.target,
      callDataHash: keccak256(context.intent.callData as Hex),
      value: context.intent.value,
      recipient: context.intent.recipient,
      gasCost: "100000000000000",
      slippageBps: 25,
      metadata: { deterministic: true },
    };
  },
  async execute(context) {
    assert(context.intent.target === TARGET, "executor received wrong target");
    return {
      success: true,
      confirmed: true,
      transaction: TEST_EXECUTION_TRANSACTION,
      network: "eip155:998",
      metadata: { dryRun: true },
    };
  },
  async refund() {
    return {
      success: true,
      confirmed: true,
      transaction: TEST_REFUND_TRANSACTION,
      network: HYPERLIQUID_TESTNET,
      metadata: { dryRun: true },
    };
  },
});

const record = await executor.execute({
  paymentPayload,
  paymentRequirements: paymentRequirement,
  settleResponse,
  expectedQuoteId: quote.id,
  expectedIntentTemplateHash: quote.intentTemplateHash,
  now: FIXED_NOW_SECONDS,
});

assert(record.status === "executed", "intent should be marked executed");
assert(record.executionTransaction === TEST_EXECUTION_TRANSACTION, "execution tx should be stored");

console.log(JSON.stringify({
  ok: true,
  intentHash: verification.intentHash,
  paymentTransaction: record.paymentTransaction,
  executionTransaction: record.executionTransaction,
}, null, 2));
