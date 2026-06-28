import { x402Client } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse } from "@x402/core/types";
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
} from "x402-hl/intents/server";

const HYPERLIQUID_TESTNET = "hyperliquid:testnet" as const;
const TEST_PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
const TEST_USER = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" as const;
const PAY_TO = "0x0000000000000000000000000000000000004020" as const;
const TARGET = "0x0000000000000000000000000000000000009999" as const;
const TEST_PAYMENT_TRANSACTION =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
const TEST_EXECUTION_TRANSACTION =
  "0x3333333333333333333333333333333333333333333333333333333333333333" as const;

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
    user: TEST_USER,
    chainId: 998,
    target: TARGET,
    callData: "0x1234",
    value: "0",
    recipient: TEST_USER,
    deadline: Math.floor(Date.now() / 1000) + 300,
    nonce: "compat-intent-nonce-1",
    metadata: {
      action: "demo-call",
      maxSlippageBps: 50,
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
  .registerExtension(createExecutionIntentClientExtension({ signer }));

const paymentPayload = await client.createPaymentPayload(paymentRequired);
assert(
  paymentPayload.extensions?.["x402-hl/intents"],
  "payment payload should include a signed execution intent",
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
});

assert(verification.ok, verification.ok ? "verified" : verification.message);
assert(
  verification.intentHash === quote.intentHash,
  "verified intent should match the quoted intent hash",
);

const store = new InMemoryIntentExecutionStore();
const executor = createIntentExecutor({
  store,
  async execute(context) {
    assert(context.intent.target === TARGET, "executor received wrong target");
    return {
      transaction: TEST_EXECUTION_TRANSACTION,
      network: "eip155:998",
      metadata: { dryRun: true },
    };
  },
});

const record = await executor.execute({
  paymentPayload: paymentPayload as PaymentPayload,
  paymentRequirements: paymentRequirement,
  settleResponse,
});

assert(record.status === "executed", "intent should be marked executed");
assert(record.executionTransaction === TEST_EXECUTION_TRANSACTION, "execution tx should be stored");

console.log(JSON.stringify({
  ok: true,
  intentHash: quote.intentHash,
  paymentTransaction: record.paymentTransaction,
  executionTransaction: record.executionTransaction,
}, null, 2));
