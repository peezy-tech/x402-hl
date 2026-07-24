import assert from "node:assert/strict";
import { test } from "node:test";
import { SendAssetTypes } from "@nktkas/hyperliquid/api/exchange";
import { signUserSignedAction } from "@nktkas/hyperliquid/signing";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import type { Hex } from "viem";
import { keccak256, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ExactHyperliquidScheme as ExactHyperliquidClient } from "../src/exact/client/index";
import {
  canonicalizePaymentRequirements,
  createIntentDeclaration,
  createIntentPaymentExtra,
  hashExecutionIntent,
  hashIntentMetadata,
  hashIntentText,
  hashPaymentRequirements,
  HyperEvmExecutionIntentSchema,
  IntentApplicationSchema,
  IntentPaymentExtraSchema,
  JsonRecordSchema,
  JsonValueSchema,
  MAX_JSON_NESTING_DEPTH,
  type IntentDeclaration,
  type IntentExecutionStatus,
  normalizeExecutionIntent,
  recoverExecutionIntentSigner,
  signExecutionIntent,
  stableJson,
  verifyExecutionIntentSignature,
  X402_HL_INTENTS_EXTENSION,
  ZERO_ADDRESS,
} from "../src/intents/index";
import { signDeclaredExecutionIntent } from "../src/intents/client/index";
import {
  createIntentExecutor,
  createIntentQuote,
  InMemoryIntentExecutionStore,
  verifyPaidExecutionIntent,
  verifyPreSettlementExecutionIntent,
} from "../src/intents/server/index";
import type {
  IntentExecutionContext,
  IntentExecutionResult,
  IntentExecutorConfig,
  IntentPolicyDecision,
  IntentSimulationResult,
} from "../src/intents/server/executor";
import type {
  IntentExecutionStore,
  IntentExecutionTransition,
  IntentStoreRegistrationResult,
  IntentStoreTransitionResult,
} from "../src/intents/server/store";

const PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const OTHER_PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000002";
const account = privateKeyToAccount(PRIVATE_KEY);
const otherAccount = privateKeyToAccount(OTHER_PRIVATE_KEY);

const DOMAIN = {
  application: "example.production.orders",
  gateway: "0x0000000000000000000000000000000000004021",
} as const;
const OTHER_GATEWAY = "0x0000000000000000000000000000000000004022";
const PAY_TO = "0x0000000000000000000000000000000000004020";
const TARGET = "0x0000000000000000000000000000000000009999";
const OTHER_TARGET = "0x0000000000000000000000000000000000009998";
const RECIPIENT = account.address;
const OTHER_RECIPIENT = otherAccount.address;
const CALL_DATA = "0x12345678" as Hex;
const OTHER_CALL_DATA = "0x87654321" as Hex;
const PAYMENT_TX = `0x${"22".repeat(32)}`;
const SECOND_PAYMENT_TX = `0x${"23".repeat(32)}`;
const EXECUTION_TX = `0x${"33".repeat(32)}`;
const REFUND_TX = `0x${"44".repeat(32)}`;
const SECOND_REFUND_TX = `0x${"45".repeat(32)}`;
const HASH_A = `0x${"aa".repeat(32)}` as Hex;
const HASH_B = `0x${"bb".repeat(32)}` as Hex;

type Fixture = Awaited<ReturnType<typeof makeFixture>>;

function baseIntent(overrides: Record<string, unknown> = {}) {
  return {
    application: DOMAIN.application,
    gateway: DOMAIN.gateway,
    user: account.address,
    chainId: 998,
    target: TARGET,
    callData: CALL_DATA,
    value: "0",
    recipient: RECIPIENT,
    refundAddress: RECIPIENT,
    maxGasCost: "100000",
    maxSlippageBps: 50,
    deadline: Math.floor(Date.now() / 1000) + 300,
    nonce: "intent-nonce-00000001",
    quoteId: "quote-intent-00000001",
    metadata: {
      action: "mint",
      nested: { enabled: true, count: 2 },
    },
    ...overrides,
  };
}

async function makeFixture(intentOverrides: Record<string, unknown> = {}) {
  const quote = createIntentQuote({
    id: String(intentOverrides.quoteId ?? "quote-intent-00000001"),
    network: "hyperliquid:testnet",
    price: "$0.01",
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    intent: baseIntent(intentOverrides) as never,
  });
  const paymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "hyperliquid:testnet",
    amount: "1000000",
    asset: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    extra: {
      decimals: 8,
      tokenSymbol: "USDC",
      x402HlIntent: quote.paymentExtra,
    },
  };
  const signedIntent = await signExecutionIntent(quote.intent, account, {
    paymentRequirements,
  });
  const createdPayment = await new ExactHyperliquidClient(
    account,
  ).createPaymentPayload(2, paymentRequirements);
  const paymentPayload: PaymentPayload = {
    ...createdPayment,
    accepted: structuredClone(paymentRequirements),
    extensions: {
      [X402_HL_INTENTS_EXTENSION]: signedIntent,
    },
  };
  const settleResponse: SettleResponse = {
    success: true,
    payer: account.address,
    transaction: PAYMENT_TX,
    network: "hyperliquid:testnet",
    amount: paymentRequirements.amount,
  };
  return {
    quote,
    signedIntent,
    paymentRequirements,
    paymentPayload,
    settleResponse,
  };
}

function verificationInput(fixture: Fixture) {
  return {
    paymentPayload: fixture.paymentPayload,
    paymentRequirements: fixture.paymentRequirements,
    settleResponse: fixture.settleResponse,
    expectedDomain: DOMAIN,
    expectedQuoteId: fixture.quote.id,
    expectedIntentTemplateHash: fixture.quote.intentTemplateHash,
  };
}

function executionInput(fixture: Fixture) {
  const { expectedDomain: _expectedDomain, ...input } =
    verificationInput(fixture);
  return input;
}

function preSettlementInput(fixture: Fixture) {
  const { settleResponse: _settleResponse, ...input } =
    verificationInput(fixture);
  return input;
}

function assertFailure(
  result: Awaited<ReturnType<typeof verifyPaidExecutionIntent>>,
  reason: string,
) {
  assert.equal(result.ok, false);
  if (result.ok) assert.fail(`expected ${reason}, received success`);
  assert.equal(result.reason, reason);
}

async function mutatePaymentBinding(
  fixture: Fixture,
  mutate: (extra: Record<string, unknown>) => void,
): Promise<Fixture> {
  const paymentRequirements = structuredClone(fixture.paymentRequirements);
  const extra = paymentRequirements.extra.x402HlIntent as Record<
    string,
    unknown
  >;
  mutate(extra);
  const signedIntent = await signExecutionIntent(
    fixture.quote.intent,
    account,
    { paymentRequirements },
  );
  return {
    ...fixture,
    paymentRequirements,
    signedIntent,
    paymentPayload: {
      ...fixture.paymentPayload,
      accepted: structuredClone(paymentRequirements),
      extensions: {
        [X402_HL_INTENTS_EXTENSION]: signedIntent,
      },
    },
  };
}

async function resignPaymentPayload(
  payload: PaymentPayload,
  mutate: (exact: {
    action: Parameters<typeof signUserSignedAction>[0]["action"] &
      Record<string, unknown>;
    nonce: number;
  }) => void,
): Promise<PaymentPayload> {
  const resigned = structuredClone(payload);
  const exact = resigned.payload as {
    action: Parameters<typeof signUserSignedAction>[0]["action"] &
      Record<string, unknown>;
    signature: unknown;
    nonce: number;
  };
  mutate(exact);
  exact.signature = await signUserSignedAction({
    wallet: account,
    action: exact.action,
    types: SendAssetTypes,
  });
  return resigned;
}

test("createIntentQuote rejects contradictory quote IDs", () => {
  const input = {
    id: "quote-authoritative",
    network: "hyperliquid:testnet" as const,
    price: "$0.01",
    payTo: PAY_TO,
    intent: baseIntent({ quoteId: undefined }) as never,
  };

  const quote = createIntentQuote(input);
  assert.equal(quote.id, input.id);
  assert.equal(quote.intent.quoteId, input.id);
  assert.equal(quote.declaration.quoteId, input.id);
  assert.equal(quote.paymentExtra.quoteId, input.id);

  assert.doesNotThrow(() =>
    createIntentQuote({
      ...input,
      intent: baseIntent({ quoteId: input.id }) as never,
    }),
  );
  assert.throws(
    () =>
      createIntentQuote({
        ...input,
        intent: baseIntent({ quoteId: "quote-contradictory" }) as never,
      }),
    /quoteId must match/,
  );
});

test("normalization, metadata, and typed-data hashes are deterministic", () => {
  const left = normalizeExecutionIntent(
    baseIntent({
      metadata: {
        z: [3, { beta: true, alpha: "a" }],
        a: { second: 2, first: 1 },
      },
    }) as never,
  );
  const right = normalizeExecutionIntent(
    baseIntent({
      metadata: {
        a: { first: 1, second: 2 },
        z: [3, { alpha: "a", beta: true }],
      },
    }) as never,
  );

  assert.equal(left.metadataHash, right.metadataHash);
  assert.equal(hashIntentMetadata(left.metadata), hashIntentMetadata(right.metadata));
  assert.equal(
    hashExecutionIntent(left, { paymentRequirementsHash: HASH_A }),
    hashExecutionIntent(right, { paymentRequirementsHash: HASH_A }),
  );
  assert.equal(
    stableJson({ z: 2, a: { y: 1, x: true } }),
    '{"a":{"x":true,"y":1},"z":2}',
  );
  assert.throws(
    () =>
      normalizeExecutionIntent(
        baseIntent({ metadataHash: HASH_B }) as never,
      ),
    /metadataHash/,
  );
  assert.throws(() => stableJson({ invalid: undefined }), /undefined/);
  assert.throws(() => stableJson({ invalid: Number.NaN }), /finite/);
  assert.throws(() => stableJson(new Array(1)), /Sparse arrays/);
  assert.throws(() => stableJson([, 1]), /Sparse arrays/);
  assert.throws(
    () =>
      hashPaymentRequirements({
        scheme: "exact",
        network: "hyperliquid:testnet",
        amount: "1",
        asset: "USDC",
        payTo: PAY_TO,
        maxTimeoutSeconds: 60,
        extra: { sparse: new Array(1) },
      }),
    /Sparse arrays/,
  );

  const protoPolicyA = {
    scheme: "exact",
    network: "hyperliquid:testnet",
    amount: "1",
    asset: "USDC",
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: JSON.parse('{"__proto__":{"policy":"A"}}'),
  } satisfies PaymentRequirements;
  const protoPolicyB = {
    ...protoPolicyA,
    extra: JSON.parse('{"__proto__":{"policy":"B"}}'),
  } satisfies PaymentRequirements;
  const canonical = canonicalizePaymentRequirements(protoPolicyA);
  assert.equal(Object.hasOwn(canonical.extra, "__proto__"), true);
  assert.equal(Object.getPrototypeOf(canonical.extra), Object.prototype);
  assert.notEqual(
    hashPaymentRequirements(protoPolicyA),
    hashPaymentRequirements(protoPolicyB),
  );

  assert.throws(
    () =>
      normalizeExecutionIntent(
        baseIntent({
          metadata: JSON.parse(
            '{"__proto__":{"flag":true},"visible":1}',
          ),
        }) as never,
      ),
    /canonical JSON/,
  );
  assert.throws(
    () =>
      normalizeExecutionIntent(
        baseIntent({
          metadata: JSON.parse(
            '{"nested":{"__proto__":{"flag":true},"visible":1}}',
          ),
        }) as never,
      ),
    /canonical JSON/,
  );
});

function nestedJsonContainers(depth: number): unknown {
  let value: unknown = "leaf";
  for (let index = 0; index < depth; index += 1) {
    value = { child: value };
  }
  return value;
}

test("JSON nesting boundaries are consistent across schemas and hashing", () => {
  const maxValue = nestedJsonContainers(MAX_JSON_NESTING_DEPTH);
  const overValue = nestedJsonContainers(MAX_JSON_NESTING_DEPTH + 1);
  assert.equal(JsonValueSchema.safeParse(maxValue).success, true);
  assert.doesNotThrow(() => stableJson(maxValue));
  assert.equal(JsonValueSchema.safeParse(overValue).success, false);
  assert.throws(() => stableJson(overValue), /maximum depth/);

  const maxRecord = {
    root: nestedJsonContainers(MAX_JSON_NESTING_DEPTH - 1),
  };
  const overRecord = {
    root: nestedJsonContainers(MAX_JSON_NESTING_DEPTH),
  };
  assert.equal(JsonRecordSchema.safeParse(maxRecord).success, true);
  assert.doesNotThrow(() => stableJson(maxRecord));
  assert.equal(JsonRecordSchema.safeParse(overRecord).success, false);
  assert.throws(() => stableJson(overRecord), /maximum depth/);
});

test("deep metadata fails closed without overflowing the verifier stack", async () => {
  const metadata = { root: nestedJsonContainers(5_000) };
  const intent = normalizeExecutionIntent(baseIntent() as never);

  assert.doesNotThrow(() => {
    const parsed = HyperEvmExecutionIntentSchema.safeParse({
      ...intent,
      metadata,
    });
    assert.equal(parsed.success, false);
  });
  assert.throws(() => stableJson(metadata), /maximum depth/);

  const fixture = await makeFixture();
  const result = await verifyPreSettlementExecutionIntent({
    ...preSettlementInput(fixture),
    paymentPayload: {
      ...fixture.paymentPayload,
      extensions: {
        [X402_HL_INTENTS_EXTENSION]: {
          ...fixture.signedIntent,
          intent: {
            ...fixture.signedIntent.intent,
            metadata,
          },
        },
      },
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected malformed metadata to fail");
  assert.equal(result.reason, "malformed_extension_payload");
});

test("application schema preserves ZodString helpers and rejects malformed Unicode", () => {
  const limitedApplication = IntentApplicationSchema.max(64);
  assert.equal(limitedApplication.parse(" example.😀 "), "example.😀");
  assert.equal(IntentApplicationSchema.safeParse("\ud800").success, false);
  assert.equal(IntentApplicationSchema.safeParse("\udc00").success, false);
  assert.equal(IntentApplicationSchema.safeParse("\udc00\ud800").success, false);
});

test("text commitments hash UTF-8 bytes so 0x-prefixed text cannot collide", () => {
  assert.equal(hashIntentText("A"), keccak256(stringToBytes("A")));
  assert.equal(hashIntentText("😀"), keccak256(stringToBytes("😀")));
  assert.notEqual(hashIntentText("0x41"), hashIntentText("A"));
  assert.throws(() => hashIntentText("\ud800"), /well-formed Unicode/);
  assert.throws(
    () => normalizeExecutionIntent(baseIntent({ nonce: "\ud800" }) as never),
    /well-formed Unicode/,
  );

  const withTextNonce = normalizeExecutionIntent(
    baseIntent({ nonce: "A" }) as never,
  );
  const withHexLikeNonce = normalizeExecutionIntent(
    baseIntent({ nonce: "0x41" }) as never,
  );
  assert.notEqual(
    hashExecutionIntent(withTextNonce, { paymentRequirementsHash: HASH_A }),
    hashExecutionIntent(withHexLikeNonce, { paymentRequirementsHash: HASH_A }),
  );

  const nonce = "nonce-text";
  const nonceHash = hashIntentText(nonce);
  const withHashedNonceText = normalizeExecutionIntent(
    baseIntent({ nonce: nonceHash }) as never,
  );
  const withNonceText = normalizeExecutionIntent(
    baseIntent({ nonce }) as never,
  );
  assert.notEqual(
    hashExecutionIntent(withNonceText, { paymentRequirementsHash: HASH_A }),
    hashExecutionIntent(withHashedNonceText, {
      paymentRequirementsHash: HASH_A,
    }),
  );
  assert.notEqual(
    createIntentPaymentExtra(withNonceText).nonceHash,
    createIntentPaymentExtra(withHashedNonceText).nonceHash,
  );

  const quoteId = "quote-text";
  const withQuoteText = normalizeExecutionIntent(
    baseIntent({ quoteId }) as never,
  );
  const withHashedQuoteText = normalizeExecutionIntent(
    baseIntent({ quoteId: hashIntentText(quoteId) }) as never,
  );
  assert.notEqual(
    hashExecutionIntent(withQuoteText, { paymentRequirementsHash: HASH_A }),
    hashExecutionIntent(withHashedQuoteText, {
      paymentRequirementsHash: HASH_A,
    }),
  );
});

test("verification rejects a nonce with unpaired UTF-16 surrogates", async () => {
  const fixture = await makeFixture();
  const result = await verifyPreSettlementExecutionIntent({
    ...preSettlementInput(fixture),
    paymentPayload: {
      ...fixture.paymentPayload,
      extensions: {
        [X402_HL_INTENTS_EXTENSION]: {
          ...fixture.signedIntent,
          intent: {
            ...fixture.signedIntent.intent,
            nonce: "\ud800",
          },
        },
      },
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected malformed nonce to fail");
  assert.equal(result.reason, "malformed_extension_payload");
});

test("a rejected signing request is not retried", async () => {
  const fixture = await makeFixture();
  const rejection = Object.assign(new Error("User rejected the request"), {
    code: 4001,
  });
  let calls = 0;

  await assert.rejects(
    signExecutionIntent(
      fixture.quote.intent,
      {
        account: account.address,
        async signTypedData(parameters) {
          calls += 1;
          assert.equal("account" in parameters, false);
          throw rejection;
        },
      },
      { paymentRequirements: fixture.paymentRequirements },
    ),
    error => error === rejection,
  );
  assert.equal(calls, 1);
});

test("a bound signing adapter receives account-free typed data", async () => {
  const fixture = await makeFixture();
  let calls = 0;
  const signed = await signExecutionIntent(
    fixture.quote.intent,
    {
      account: account.address,
      async signTypedData(parameters) {
        calls += 1;
        if ("account" in parameters) {
          throw new Error("unexpected account parameter");
        }
        return account.signTypedData(parameters);
      },
    },
    { paymentRequirements: fixture.paymentRequirements },
  );

  assert.equal(calls, 1);
  assert.equal((await verifyExecutionIntentSignature(signed)).valid, true);
});

test("signing retries with account after an account-not-found error", async () => {
  const fixture = await makeFixture();
  let calls = 0;
  const signed = await signExecutionIntent(
    fixture.quote.intent,
    {
      account: account.address,
      async signTypedData(parameters) {
        calls += 1;
        if (calls === 1) {
          assert.equal("account" in parameters, false);
          const missingAccount = new Error("Could not find an Account");
          missingAccount.name = "AccountNotFoundError";
          throw missingAccount;
        }
        assert.equal(parameters.account, account.address);
        const { account: _account, ...typedData } = parameters;
        return account.signTypedData(typedData);
      },
    },
    { paymentRequirements: fixture.paymentRequirements },
  );

  assert.equal(calls, 2);
  assert.equal((await verifyExecutionIntentSignature(signed)).valid, true);
});

test("a custom account-requiring signer retries after a generic error", async () => {
  const fixture = await makeFixture();
  let calls = 0;
  const signed = await signExecutionIntent(
    fixture.quote.intent,
    {
      account: account.address,
      async signTypedData(parameters) {
        calls += 1;
        if (calls === 1) {
          assert.equal("account" in parameters, false);
          throw new Error("account is required");
        }
        assert.equal(parameters.account, account.address);
        const { account: _account, ...typedData } = parameters;
        return account.signTypedData(typedData);
      },
    },
    { paymentRequirements: fixture.paymentRequirements },
  );

  assert.equal(calls, 2);
  assert.equal((await verifyExecutionIntentSignature(signed)).valid, true);
});

test("a failed account-bearing fallback preserves its error", async () => {
  const fixture = await makeFixture();
  const fallbackError = new Error("signing service unavailable");
  let calls = 0;

  await assert.rejects(
    signExecutionIntent(
      fixture.quote.intent,
      {
        account: account.address,
        async signTypedData(parameters) {
          calls += 1;
          if (calls === 1) {
            assert.equal("account" in parameters, false);
            throw new Error("account is required");
          }
          assert.equal(parameters.account, account.address);
          throw fallbackError;
        },
      },
      { paymentRequirements: fixture.paymentRequirements },
    ),
    error => error === fallbackError,
  );
  assert.equal(calls, 2);
});

test("a wrapped rejected signing request is not retried", async () => {
  const fixture = await makeFixture();
  const rejection = Object.assign(new Error("User rejected the request"), {
    code: 4001,
  });
  const wrapped = new Error("wallet request failed", { cause: rejection });
  let calls = 0;

  await assert.rejects(
    signExecutionIntent(
      fixture.quote.intent,
      {
        account: account.address,
        async signTypedData(parameters) {
          calls += 1;
          assert.equal("account" in parameters, false);
          throw wrapped;
        },
      },
      { paymentRequirements: fixture.paymentRequirements },
    ),
    error => error === wrapped,
  );
  assert.equal(calls, 1);
});

test("signing rejects mismatched declared and configured signer accounts", async () => {
  const fixture = await makeFixture();
  let calls = 0;

  await assert.rejects(
    signExecutionIntent(
      fixture.quote.intent,
      {
        address: account.address,
        account: otherAccount,
        async signTypedData() {
          calls += 1;
          return HASH_A;
        },
      },
      { paymentRequirements: fixture.paymentRequirements },
    ),
    /address must match the configured signing account/,
  );
  assert.equal(calls, 0);
});

test("a valid signed intent recovers its signer and verifies", async () => {
  const fixture = await makeFixture();
  assert.equal(
    await recoverExecutionIntentSigner(fixture.signedIntent),
    account.address,
  );
  const verification = await verifyExecutionIntentSignature(
    fixture.signedIntent,
  );
  assert.equal(verification.valid, true);
  assert.equal(verification.signer, account.address);
  assert.equal(verification.intentHash, fixture.signedIntent.intentHash);
});

test("signature verification rejects a forged declared signer", async () => {
  const fixture = await makeFixture();
  const forged = await verifyExecutionIntentSignature({
    ...fixture.signedIntent,
    signer: otherAccount.address,
  });
  assert.equal(forged.valid, false);
  assert.equal(forged.signer, account.address);

  const withoutDeclaredSigner = structuredClone(fixture.signedIntent);
  delete withoutDeclaredSigner.signer;
  const compatible = await verifyExecutionIntentSignature(
    withoutDeclaredSigner,
  );
  assert.equal(compatible.valid, true);
  assert.equal(compatible.signer, account.address);
});

test("verification fails closed for missing and unsuccessful settlement", async t => {
  const fixture = await makeFixture();

  await t.test("missing settlement", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      settleResponse: undefined,
    });
    assertFailure(result, "missing_settlement");
  });

  await t.test("unsuccessful settlement", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      settleResponse: {
        ...fixture.settleResponse,
        success: false,
        errorReason: "hl_transfer_not_confirmed",
      },
    });
    assertFailure(result, "unsuccessful_settlement");
  });
});

test("verification binds settlement transaction, network, and exact amount", async t => {
  const fixture = await makeFixture();

  await t.test("missing settlement transaction", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      settleResponse: {
        ...fixture.settleResponse,
        transaction: "",
      },
    });
    assertFailure(result, "missing_settlement_transaction");
  });

  await t.test("non-string settlement transaction fails closed", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      settleResponse: {
        ...fixture.settleResponse,
        transaction: 456,
      } as unknown as SettleResponse,
    });
    assertFailure(result, "missing_settlement_transaction");
  });

  await t.test("settlement network mismatch", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      settleResponse: {
        ...fixture.settleResponse,
        network: "hyperliquid:mainnet",
      },
    });
    assertFailure(result, "settlement_network_mismatch");
  });

  await t.test("settlement amount mismatch", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      settleResponse: {
        ...fixture.settleResponse,
        amount: "999999",
      },
    });
    assertFailure(result, "settlement_amount_mismatch");
  });
});

test("verification requires a settled payer and enforces payer/signer equality", async t => {
  const fixture = await makeFixture();

  await t.test("missing payer", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      settleResponse: {
        ...fixture.settleResponse,
        payer: undefined,
      },
    });
    assertFailure(result, "missing_settled_payer");
  });

  await t.test("non-string payer fails closed", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      settleResponse: {
        ...fixture.settleResponse,
        payer: 123,
      } as unknown as SettleResponse,
    });
    assertFailure(result, "missing_settled_payer");
  });

  await t.test("payer mismatch", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      settleResponse: {
        ...fixture.settleResponse,
        payer: otherAccount.address,
      },
    });
    assertFailure(result, "execution_intent_payer_mismatch");
  });

  await t.test("delegated mode still binds the receipt to the signed payment payer", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      requireSamePayer: false,
      settleResponse: {
        ...fixture.settleResponse,
        payer: otherAccount.address,
      },
    });
    assertFailure(result, "execution_intent_payer_mismatch");
  });
});

test("verification rejects an expired intent", async () => {
  const fixture = await makeFixture({ deadline: 100 });
  const result = await verifyPaidExecutionIntent({
    ...verificationInput(fixture),
    now: 101,
  });
  assertFailure(result, "execution_intent_expired");
});

test("paid verification accepts a payment that expired during settlement", async () => {
  const fixture = await makeFixture();
  const expiredNonce =
    Date.now() - (fixture.paymentRequirements.maxTimeoutSeconds + 1) * 1000;
  const paymentPayload = await resignPaymentPayload(
    fixture.paymentPayload,
    exact => {
      exact.action.nonce = expiredNonce;
      exact.nonce = expiredNonce;
    },
  );

  const preSettlement = await verifyPreSettlementExecutionIntent({
    ...preSettlementInput(fixture),
    paymentPayload,
  });
  assert.equal(preSettlement.ok, false);
  if (preSettlement.ok) assert.fail("expected expired payment to be rejected");
  assert.equal(preSettlement.reason, "payment_payload_requirements_mismatch");

  const paid = await verifyPaidExecutionIntent({
    ...verificationInput(fixture),
    paymentPayload,
  });
  if (!paid.ok) assert.fail(`${paid.reason}: ${paid.message}`);
  assert.equal(paid.payer, account.address);
  assert.equal(paid.paymentPayer, account.address);
});

test("pre-settlement verification accepts a valid intent without settlement", async () => {
  const fixture = await makeFixture();
  const result = await verifyPreSettlementExecutionIntent(
    preSettlementInput(fixture),
  );
  if (!result.ok) assert.fail(`${result.reason}: ${result.message}`);
  assert.equal(result.signer, account.address);
  assert.equal(result.intentHash, fixture.signedIntent.intentHash);
  assert.equal(result.intentTemplateHash, fixture.quote.intentTemplateHash);
});

test("pre-settlement verification rejects unpayable intents before funds move", async t => {
  const fixture = await makeFixture();

  function expectFailure(
    result: Awaited<ReturnType<typeof verifyPreSettlementExecutionIntent>>,
    reason: string,
  ) {
    assert.equal(result.ok, false);
    if (result.ok) assert.fail(`expected ${reason}, received success`);
    assert.equal(result.reason, reason);
  }

  await t.test("missing execution intent", async () => {
    const result = await verifyPreSettlementExecutionIntent({
      ...preSettlementInput(fixture),
      paymentPayload: { ...fixture.paymentPayload, extensions: {} },
    });
    expectFailure(result, "missing_execution_intent");
  });

  await t.test("trusted template mismatch", async () => {
    const result = await verifyPreSettlementExecutionIntent({
      ...preSettlementInput(fixture),
      expectedIntentTemplateHash: HASH_B,
    });
    expectFailure(result, "intent_template_hash_mismatch");
  });

  await t.test("payload selected different requirements", async () => {
    const paymentRequirements = structuredClone(fixture.paymentRequirements);
    paymentRequirements.amount = "1000001";
    const result = await verifyPreSettlementExecutionIntent({
      ...preSettlementInput(fixture),
      paymentRequirements,
    });
    expectFailure(result, "payment_payload_requirements_mismatch");
  });

  await t.test("signed payment action must match finalized requirements", async t => {
    async function expectActionMismatch(
      mutate: Parameters<typeof resignPaymentPayload>[1],
    ) {
      const paymentPayload = await resignPaymentPayload(
        fixture.paymentPayload,
        mutate,
      );
      const result = await verifyPreSettlementExecutionIntent({
        ...preSettlementInput(fixture),
        paymentPayload,
      });
      expectFailure(result, "payment_payload_requirements_mismatch");
    }

    await t.test("destination", () =>
      expectActionMismatch(exact => {
        exact.action.destination = OTHER_GATEWAY;
      }));
    await t.test("token", () =>
      expectActionMismatch(exact => {
        exact.action.token = `USDC:0x${"11".repeat(16)}`;
      }));
    await t.test("amount", () =>
      expectActionMismatch(exact => {
        exact.action.amount = "0.02";
      }));
    await t.test("Hyperliquid chain", () =>
      expectActionMismatch(exact => {
        exact.action.hyperliquidChain = "Mainnet";
      }));
    await t.test("action and outer nonce", () =>
      expectActionMismatch(exact => {
        exact.action.nonce = Number(exact.action.nonce) + 1;
      }));
    await t.test("payment TTL", () =>
      expectActionMismatch(exact => {
        const expiredNonce =
          Date.now() -
          (fixture.paymentRequirements.maxTimeoutSeconds + 1) * 1000;
        exact.action.nonce = expiredNonce;
        exact.nonce = expiredNonce;
      }));
  });

  await t.test("runtime-invalid payment requirements", async () => {
    const paymentRequirements = structuredClone(
      fixture.paymentRequirements,
    ) as unknown as { amount: unknown };
    paymentRequirements.amount = 1000000;
    const result = await verifyPreSettlementExecutionIntent({
      ...preSettlementInput(fixture),
      paymentRequirements: paymentRequirements as PaymentRequirements,
    });
    expectFailure(result, "malformed_extension_payload");
  });

  await t.test("payment payer differs from intent signer", async () => {
    const createdPayment = await new ExactHyperliquidClient(
      otherAccount,
    ).createPaymentPayload(2, fixture.paymentRequirements);
    const result = await verifyPreSettlementExecutionIntent({
      ...preSettlementInput(fixture),
      paymentPayload: {
        ...createdPayment,
        accepted: structuredClone(fixture.paymentRequirements),
        extensions: fixture.paymentPayload.extensions,
      },
    });
    expectFailure(result, "execution_intent_payer_mismatch");
  });

  await t.test("valid delegated payment payer is accepted", async () => {
    const createdPayment = await new ExactHyperliquidClient(
      otherAccount,
    ).createPaymentPayload(2, fixture.paymentRequirements);
    const result = await verifyPreSettlementExecutionIntent({
      ...preSettlementInput(fixture),
      requireSamePayer: false,
      paymentPayload: {
        ...createdPayment,
        accepted: structuredClone(fixture.paymentRequirements),
        extensions: fixture.paymentPayload.extensions,
      },
    });
    if (!result.ok) assert.fail(`${result.reason}: ${result.message}`);
    assert.equal(result.paymentPayer, otherAccount.address);
    assert.equal(result.signer, account.address);
  });

  await t.test("delegated mode still rejects an invalid payment signature", async () => {
    const paymentPayload = structuredClone(fixture.paymentPayload);
    (
      paymentPayload.payload as {
        signature: { r: string };
      }
    ).signature.r = `0x${"00".repeat(32)}`;
    const result = await verifyPreSettlementExecutionIntent({
      ...preSettlementInput(fixture),
      requireSamePayer: false,
      paymentPayload,
    });
    expectFailure(result, "malformed_extension_payload");
  });

  await t.test("a NaN verification clock fails closed", async () => {
    const result = await verifyPreSettlementExecutionIntent({
      ...preSettlementInput(fixture),
      now: Number.NaN,
    });
    expectFailure(result, "execution_intent_expired");
  });

  await t.test("expired deadline fails by default", async () => {
    const expired = await makeFixture({ deadline: 100 });
    const result = await verifyPreSettlementExecutionIntent({
      ...preSettlementInput(expired),
      now: 101,
    });
    expectFailure(result, "execution_intent_expired");
  });
});

test("executor verifyBeforeSettlement applies its configured domain", async () => {
  const fixture = await makeFixture();
  const executor = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore()),
  );
  const { expectedDomain: _expectedDomain, ...input } =
    preSettlementInput(fixture);

  const result = await executor.verifyBeforeSettlement(input);
  if (!result.ok) assert.fail(`${result.reason}: ${result.message}`);
  assert.equal(result.signer, account.address);

  const foreign = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore(), {
      domain: { application: DOMAIN.application, gateway: OTHER_GATEWAY },
    }),
  );
  const rejected = await foreign.verifyBeforeSettlement(input);
  assert.equal(rejected.ok, false);
  if (rejected.ok) assert.fail("expected gateway_mismatch, received success");
  assert.equal(rejected.reason, "gateway_mismatch");
});

test("verification rejects quote, template, and cross-domain replay", async t => {
  const fixture = await makeFixture();

  await t.test("quote mismatch", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      expectedQuoteId: "different-quote",
    });
    assertFailure(result, "quote_mismatch");
  });

  await t.test("trusted template mismatch", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      expectedIntentTemplateHash: HASH_B,
    });
    assertFailure(result, "intent_template_hash_mismatch");
  });

  await t.test("application replay", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      expectedDomain: {
        ...DOMAIN,
        application: "different.production.application",
      },
    });
    assertFailure(result, "application_mismatch");
  });

  await t.test("gateway replay", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      expectedDomain: {
        ...DOMAIN,
        gateway: OTHER_GATEWAY,
      },
    });
    assertFailure(result, "gateway_mismatch");
  });
});

test("verification reports each payment-to-intent binding mismatch", async t => {
  const fixture = await makeFixture();
  const cases: Array<{
    name: string;
    reason: string;
    mutate: (extra: Record<string, unknown>) => void;
  }> = [
    {
      name: "chain",
      reason: "chain_mismatch",
      mutate: extra => {
        extra.chainId = 999;
      },
    },
    {
      name: "target",
      reason: "target_mismatch",
      mutate: extra => {
        extra.target = OTHER_TARGET;
      },
    },
    {
      name: "recipient",
      reason: "recipient_mismatch",
      mutate: extra => {
        extra.recipient = OTHER_RECIPIENT;
      },
    },
    {
      name: "calldata",
      reason: "calldata_mismatch",
      mutate: extra => {
        extra.callDataHash = keccak256(OTHER_CALL_DATA);
      },
    },
  ];

  for (const mismatch of cases) {
    await t.test(mismatch.name, async () => {
      const changed = await mutatePaymentBinding(fixture, mismatch.mutate);
      const result = await verifyPaidExecutionIntent(
        verificationInput(changed),
      );
      assertFailure(result, mismatch.reason);
    });
  }
});

test("verification rejects payment requirements and intent hash mismatches", async t => {
  const fixture = await makeFixture();

  await t.test("payload selected different requirements", async () => {
    const changedRequirements = {
      ...fixture.paymentRequirements,
      amount: "2000000",
    };
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      paymentRequirements: changedRequirements,
      settleResponse: {
        ...fixture.settleResponse,
        amount: changedRequirements.amount,
      },
    });
    assertFailure(result, "payment_payload_requirements_mismatch");
  });

  await t.test("signature committed to different requirements", async () => {
    const changedRequirements = {
      ...fixture.paymentRequirements,
      amount: "2000000",
    };
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      paymentRequirements: changedRequirements,
      paymentPayload: {
        ...fixture.paymentPayload,
        accepted: structuredClone(changedRequirements),
      },
      settleResponse: {
        ...fixture.settleResponse,
        amount: changedRequirements.amount,
      },
    });
    assertFailure(result, "payment_requirements_hash_mismatch");
  });

  await t.test("declared intent hash differs from typed data", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      paymentPayload: {
        ...fixture.paymentPayload,
        extensions: {
          [X402_HL_INTENTS_EXTENSION]: {
            ...fixture.signedIntent,
            intentHash: HASH_B,
          },
        },
      },
    });
    assertFailure(result, "intent_hash_mismatch");
  });
});

test("malformed intent extension returns a typed failure", async t => {
  const fixture = await makeFixture();

  await t.test("known x402 client declaration echoes are accepted", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      paymentPayload: {
        ...fixture.paymentPayload,
        extensions: {
          [X402_HL_INTENTS_EXTENSION]: {
            ...fixture.quote.declaration,
            ...fixture.signedIntent,
          },
        },
      },
    });
    assert.equal(result.ok, true);
  });

  await t.test("missing required fields", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      paymentPayload: {
        ...fixture.paymentPayload,
        extensions: {
          [X402_HL_INTENTS_EXTENSION]: {
            intentHash: "not-a-hash",
            signature: "not-a-signature",
          },
        },
      },
    });
    assertFailure(result, "malformed_extension_payload");
  });

  await t.test("unknown signed-envelope field", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      paymentPayload: {
        ...fixture.paymentPayload,
        extensions: {
          [X402_HL_INTENTS_EXTENSION]: {
            ...fixture.signedIntent,
            uncommittedPolicy: true,
          },
        },
      },
    });
    assertFailure(result, "malformed_extension_payload");
  });

  await t.test("mismatched declaration echo", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      paymentPayload: {
        ...fixture.paymentPayload,
        extensions: {
          [X402_HL_INTENTS_EXTENSION]: {
            ...fixture.quote.declaration,
            ...fixture.signedIntent,
            quoteId: "different-quote",
          },
        },
      },
    });
    assertFailure(result, "malformed_extension_payload");
  });

  await t.test("unknown intent field", async () => {
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      paymentPayload: {
        ...fixture.paymentPayload,
        extensions: {
          [X402_HL_INTENTS_EXTENSION]: {
            ...fixture.signedIntent,
            intent: {
              ...fixture.signedIntent.intent,
              uncommittedPolicy: true,
            },
          },
        },
      },
    });
    assertFailure(result, "malformed_extension_payload");
  });
});

test("intent metadata mismatching its metadataHash returns a typed failure", async () => {
  const fixture = await makeFixture();
  const result = await verifyPaidExecutionIntent({
    ...verificationInput(fixture),
    paymentPayload: {
      ...fixture.paymentPayload,
      extensions: {
        [X402_HL_INTENTS_EXTENSION]: {
          ...fixture.signedIntent,
          intent: {
            ...fixture.signedIntent.intent,
            metadata: { note: "mismatched" },
          },
        },
      },
    },
  });
  assertFailure(result, "malformed_extension_payload");
});

test("intent schema rejects zero recipient and refund addresses", async t => {
  const intent = normalizeExecutionIntent(baseIntent() as never);

  await t.test("schema rejects a zero recipient", () => {
    const parsed = HyperEvmExecutionIntentSchema.safeParse({
      ...intent,
      recipient: ZERO_ADDRESS,
    });
    assert.equal(parsed.success, false);
  });

  await t.test("schema rejects a zero refundAddress", () => {
    const parsed = HyperEvmExecutionIntentSchema.safeParse({
      ...intent,
      refundAddress: ZERO_ADDRESS,
    });
    assert.equal(parsed.success, false);
  });

  await t.test("verification fails closed on a zero refundAddress", async () => {
    const fixture = await makeFixture();
    const result = await verifyPaidExecutionIntent({
      ...verificationInput(fixture),
      paymentPayload: {
        ...fixture.paymentPayload,
        extensions: {
          [X402_HL_INTENTS_EXTENSION]: {
            ...fixture.signedIntent,
            intent: {
              ...fixture.signedIntent.intent,
              refundAddress: ZERO_ADDRESS,
            },
          },
        },
      },
    });
    assertFailure(result, "malformed_extension_payload");
  });
});

test("intent numeric fields beyond uint256 fail closed instead of throwing", async t => {
  const overflowValue = (2n ** 256n).toString();
  const maxUint256 = (2n ** 256n - 1n).toString();
  const intent = normalizeExecutionIntent(baseIntent() as never);

  await t.test("schema rejects malformed and oversized decimal strings", () => {
    for (const value of ["abc", "1e2", "9".repeat(10_000), overflowValue]) {
      assert.doesNotThrow(() => {
        const parsed = HyperEvmExecutionIntentSchema.safeParse({
          ...intent,
          value,
        });
        assert.equal(parsed.success, false);
      });
    }
  });

  await t.test("schema rejects a maxGasCost above uint256", () => {
    const parsed = HyperEvmExecutionIntentSchema.safeParse({
      ...intent,
      maxGasCost: overflowValue,
    });
    assert.equal(parsed.success, false);
  });

  await t.test("uint256 max still normalizes and hashes", () => {
    const boundary = normalizeExecutionIntent(
      baseIntent({ value: maxUint256, maxGasCost: maxUint256 }) as never,
    );
    assert.match(
      hashExecutionIntent(boundary, { paymentRequirementsHash: HASH_A }),
      /^0x[0-9a-f]{64}$/,
    );
  });

  await t.test("schema rejects unsafe chain IDs and deadlines", () => {
    assert.equal(
      HyperEvmExecutionIntentSchema.safeParse({
        ...intent,
        chainId: Number.MAX_SAFE_INTEGER + 1,
      }).success,
      false,
    );
    assert.equal(
      HyperEvmExecutionIntentSchema.safeParse({
        ...intent,
        deadline: 1e100,
      }).success,
      false,
    );
    const paymentExtra = createIntentPaymentExtra(intent);
    assert.equal(
      IntentPaymentExtraSchema.safeParse({
        ...paymentExtra,
        chainId: Number.MAX_SAFE_INTEGER + 1,
      }).success,
      false,
    );
    assert.equal(
      IntentPaymentExtraSchema.safeParse({
        ...paymentExtra,
        deadline: 1e100,
      }).success,
      false,
    );
  });

  await t.test("verification fails closed on invalid decimal fields", async () => {
    const fixture = await makeFixture();
    for (const value of ["abc", overflowValue]) {
      const result = await verifyPaidExecutionIntent({
        ...verificationInput(fixture),
        paymentPayload: {
          ...fixture.paymentPayload,
          extensions: {
            [X402_HL_INTENTS_EXTENSION]: {
              ...fixture.signedIntent,
              intent: {
                ...fixture.signedIntent.intent,
                value,
              },
            },
          },
        },
      });
      assertFailure(result, "malformed_extension_payload");
    }
  });
});

function exactPolicy(context: IntentExecutionContext): IntentPolicyDecision {
  return {
    allowed: true,
    chainId: context.intent.chainId,
    target: context.intent.target,
    selector: context.intent.callData.slice(0, 10),
    callDataHash: keccak256(context.intent.callData as Hex),
    value: context.intent.value,
    recipient: context.intent.recipient,
  };
}

function exactSimulation(
  context: IntentExecutionContext,
): IntentSimulationResult {
  return {
    success: true,
    chainId: context.intent.chainId,
    target: context.intent.target,
    callDataHash: keccak256(context.intent.callData as Hex),
    value: context.intent.value,
    recipient: context.intent.recipient,
    gasCost: "1000",
    slippageBps: 5,
  };
}

function executorConfig(
  store: IntentExecutionStore,
  overrides: Partial<IntentExecutorConfig> = {},
) {
  let token = 0;
  return {
    store,
    domain: DOMAIN,
    policy: exactPolicy,
    simulate: exactSimulation,
    execute: async () =>
      ({
        success: true,
        confirmed: true,
        transaction: EXECUTION_TX,
        network: "eip155:998",
      }) as const,
    refund: async () =>
      ({
        success: true,
        confirmed: true,
        transaction: REFUND_TX,
        network: "hyperliquid:testnet",
      }) as const,
    createClaimToken: () => `claim-${++token}`,
    ...overrides,
  } satisfies IntentExecutorConfig;
}

test("payment transaction aliases return the terminal receipt without refunding", async () => {
  const fixture = await makeFixture();
  let executionCalls = 0;
  let refundCalls = 0;
  const executor = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore(), {
      execute: async () => {
        executionCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: EXECUTION_TX,
          network: "eip155:998",
        };
      },
      refund: async () => {
        refundCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const first = await executor.execute(executionInput(fixture));
  const replay = await executor.execute({
    ...executionInput(fixture),
    settleResponse: {
      ...fixture.settleResponse,
      transaction: `  ${PAYMENT_TX.toUpperCase()}\t`,
    },
  });

  assert.equal(first.status, "executed");
  assert.equal(replay.status, "executed");
  assert.equal(replay.intentHash, first.intentHash);
  assert.equal(replay.executionTransaction, EXECUTION_TX);
  assert.equal(replay.paymentTransaction, PAYMENT_TX);
  assert.equal(executionCalls, 1);
  assert.equal(refundCalls, 0);
});

test("the store canonicalizes payment transaction writes and lookups", async () => {
  const fixture = await makeFixture();
  const store = new InMemoryIntentExecutionStore();
  const receipt = await createIntentExecutor(executorConfig(store)).execute(
    executionInput(fixture),
  );

  const replay = await store.registerPaid({
    ...receipt,
    paymentTransaction: ` ${PAYMENT_TX.toUpperCase()}\t`,
  });
  assert.equal(replay.kind, "existing");
  assert.equal(replay.record.paymentTransaction, PAYMENT_TX);
  assert.equal(
    (
      await store.getPayment(
        "hyperliquid:testnet",
        ` ${PAYMENT_TX.toUpperCase()} `,
      )
    )?.paymentTransaction,
    PAYMENT_TX,
  );
});

test("a second settled payment for the same intent is durably refunded", async () => {
  const fixture = await makeFixture();
  const store = new InMemoryIntentExecutionStore();
  let executionCalls = 0;
  const refundedPayments: string[] = [];
  const refundKeys: string[] = [];
  const executor = createIntentExecutor(
    executorConfig(store, {
      execute: async () => {
        executionCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: EXECUTION_TX,
          network: "eip155:998",
        };
      },
      refund: async context => {
        refundedPayments.push(context.record.paymentTransaction);
        refundKeys.push(context.idempotencyKey);
        return {
          success: true,
          confirmed: true,
          transaction: SECOND_REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );
  const secondPaymentInput = {
    ...executionInput(fixture),
    settleResponse: {
      ...fixture.settleResponse,
      transaction: SECOND_PAYMENT_TX,
    },
  };

  const first = await executor.execute(executionInput(fixture));
  const duplicate = await executor.execute(secondPaymentInput);
  const replay = await executor.execute(secondPaymentInput);

  assert.equal(first.status, "executed");
  assert.equal(first.paymentTransaction, PAYMENT_TX);
  assert.equal(duplicate.status, "refunded");
  assert.equal(duplicate.duplicatePayment, true);
  assert.equal(duplicate.paymentTransaction, SECOND_PAYMENT_TX);
  assert.equal(duplicate.refundTransaction, SECOND_REFUND_TX);
  assert.equal(replay.status, "refunded");
  assert.equal(executionCalls, 1);
  assert.deepEqual(refundedPayments, [SECOND_PAYMENT_TX]);
  assert.equal(refundKeys.length, 1);
  assert.match(refundKeys[0]!, /:refund:hyperliquid:testnet:/);

  const primary = await store.get(first.intentHash);
  assert.equal(primary?.paymentTransaction, PAYMENT_TX);
  assert.equal(primary?.status, "executed");
  const trackedDuplicate = await store.getPayment(
    "hyperliquid:testnet",
    SECOND_PAYMENT_TX,
  );
  assert.equal(trackedDuplicate?.status, "refunded");
  assert.equal(trackedDuplicate?.refundTransaction, SECOND_REFUND_TX);
});

test("a settled alternate payment option for the same quote is durably refunded", async () => {
  const fixture = await makeFixture();
  const alternateRequirements = structuredClone(fixture.paymentRequirements);
  alternateRequirements.amount = "2000000";
  const alternateSignedIntent = await signExecutionIntent(
    fixture.quote.intent,
    account,
    { paymentRequirements: alternateRequirements },
  );
  const createdPayment = await new ExactHyperliquidClient(
    account,
  ).createPaymentPayload(2, alternateRequirements);
  const alternateFixture: Fixture = {
    ...fixture,
    signedIntent: alternateSignedIntent,
    paymentRequirements: alternateRequirements,
    paymentPayload: {
      ...createdPayment,
      accepted: structuredClone(alternateRequirements),
      extensions: {
        [X402_HL_INTENTS_EXTENSION]: alternateSignedIntent,
      },
    },
    settleResponse: {
      ...fixture.settleResponse,
      amount: alternateRequirements.amount,
      transaction: SECOND_PAYMENT_TX,
    },
  };
  assert.notEqual(
    alternateSignedIntent.paymentRequirementsHash,
    fixture.signedIntent.paymentRequirementsHash,
  );
  assert.notEqual(alternateSignedIntent.intentHash, fixture.signedIntent.intentHash);

  const store = new InMemoryIntentExecutionStore();
  let executionCalls = 0;
  let refundCalls = 0;
  const executor = createIntentExecutor(
    executorConfig(store, {
      execute: async () => {
        executionCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: EXECUTION_TX,
          network: "eip155:998",
        };
      },
      refund: async context => {
        refundCalls += 1;
        assert.equal(context.record.intentHash, alternateSignedIntent.intentHash);
        assert.equal(context.record.paymentAmount, alternateRequirements.amount);
        assert.equal(context.record.paymentTransaction, SECOND_PAYMENT_TX);
        return {
          success: true,
          confirmed: true,
          transaction: SECOND_REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const first = await executor.execute(executionInput(fixture));
  const alternate = await executor.execute(executionInput(alternateFixture));
  const replay = await executor.execute(executionInput(alternateFixture));

  assert.equal(first.status, "executed");
  assert.equal(alternate.status, "refunded");
  assert.equal(alternate.duplicatePayment, true);
  assert.equal(alternate.paymentTransaction, SECOND_PAYMENT_TX);
  assert.equal(alternate.refundTransaction, SECOND_REFUND_TX);
  assert.equal(replay.status, "refunded");
  assert.equal(executionCalls, 1);
  assert.equal(refundCalls, 1);
  assert.equal(
    (await store.getPayment("hyperliquid:testnet", SECOND_PAYMENT_TX))?.status,
    "refunded",
  );
});

test("a delegated payer's second settled payment is durably refunded", async () => {
  const fixture = await makeFixture();
  const delegatedPayment = await new ExactHyperliquidClient(
    otherAccount,
  ).createPaymentPayload(2, fixture.paymentRequirements);
  const store = new InMemoryIntentExecutionStore();
  const refundedPayers: string[] = [];
  const executor = createIntentExecutor(
    executorConfig(store, {
      refund: async context => {
        refundedPayers.push(context.record.payer);
        return {
          success: true,
          confirmed: true,
          transaction: SECOND_REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const primary = await executor.execute(executionInput(fixture));
  const duplicate = await executor.execute({
    ...executionInput(fixture),
    requireSamePayer: false,
    paymentPayload: {
      ...delegatedPayment,
      accepted: structuredClone(fixture.paymentRequirements),
      extensions: fixture.paymentPayload.extensions,
    },
    settleResponse: {
      ...fixture.settleResponse,
      payer: otherAccount.address,
      transaction: SECOND_PAYMENT_TX,
    },
  });

  assert.equal(primary.status, "executed");
  assert.equal(duplicate.status, "refunded");
  assert.equal(duplicate.duplicatePayment, true);
  assert.equal(duplicate.payer, otherAccount.address);
  assert.equal(duplicate.paymentTransaction, SECOND_PAYMENT_TX);
  assert.equal(duplicate.refundTransaction, SECOND_REFUND_TX);
  assert.deepEqual(refundedPayers, [otherAccount.address]);
  assert.equal(
    (await store.getPayment("hyperliquid:testnet", SECOND_PAYMENT_TX))?.status,
    "refunded",
  );
});

test("a failed duplicate-payment refund retries by payment identity", async () => {
  const fixture = await makeFixture();
  let refundCalls = 0;
  const executor = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore(), {
      refund: async () => {
        refundCalls += 1;
        if (refundCalls === 1) {
          return { success: false, retryable: true };
        }
        return {
          success: true,
          confirmed: true,
          transaction: SECOND_REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );
  await executor.execute(executionInput(fixture));
  const duplicate = await executor.execute({
    ...executionInput(fixture),
    settleResponse: {
      ...fixture.settleResponse,
      transaction: SECOND_PAYMENT_TX,
    },
  });
  assert.equal(duplicate.status, "refund_failed");

  const retried = await executor.retryPaymentRefund(
    "hyperliquid:testnet",
    SECOND_PAYMENT_TX,
  );
  assert.equal(retried.status, "refunded");
  assert.equal(retried.refundTransaction, SECOND_REFUND_TX);
  assert.equal(refundCalls, 2);
});

test("refund transaction uniqueness spans primary and duplicate payments", async () => {
  const fixture = await makeFixture();
  let refundCalls = 0;
  const executor = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore(), {
      execute: async () => ({ success: false, refundSafe: true }),
      refund: async () => {
        refundCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const primary = await executor.execute(executionInput(fixture));
  const duplicate = await executor.execute({
    ...executionInput(fixture),
    settleResponse: {
      ...fixture.settleResponse,
      transaction: SECOND_PAYMENT_TX,
    },
  });

  assert.equal(primary.status, "refunded");
  assert.equal(duplicate.status, "manual_intervention");
  assert.equal(duplicate.failure?.reason, "store_conflict");
  assert.equal(duplicate.refundTransaction, undefined);
  assert.equal(refundCalls, 2);
});

test("concurrent distinct payments execute once and refund the extra payment", async () => {
  const fixture = await makeFixture();
  const store = new InMemoryIntentExecutionStore();
  let executionCalls = 0;
  let refundCalls = 0;
  let releaseExecution!: () => void;
  const gate = new Promise<void>(resolve => {
    releaseExecution = resolve;
  });
  const executor = createIntentExecutor(
    executorConfig(store, {
      execute: async () => {
        executionCalls += 1;
        await gate;
        return {
          success: true,
          confirmed: true,
          transaction: EXECUTION_TX,
          network: "eip155:998",
        };
      },
      refund: async context => {
        refundCalls += 1;
        assert.equal(context.record.paymentTransaction, SECOND_PAYMENT_TX);
        return {
          success: true,
          confirmed: true,
          transaction: SECOND_REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const primary = executor.execute(executionInput(fixture));
  await new Promise(resolve => setImmediate(resolve));
  const duplicate = await executor.execute({
    ...executionInput(fixture),
    settleResponse: {
      ...fixture.settleResponse,
      transaction: SECOND_PAYMENT_TX,
    },
  });
  releaseExecution();
  const executed = await primary;

  assert.equal(executed.status, "executed");
  assert.equal(duplicate.status, "refunded");
  assert.equal(executionCalls, 1);
  assert.equal(refundCalls, 1);
});

test("concurrent duplicate execution atomically claims only once", async () => {
  const fixture = await makeFixture();
  let executionCalls = 0;
  let releaseExecution!: () => void;
  const gate = new Promise<void>(resolve => {
    releaseExecution = resolve;
  });
  const store = new InMemoryIntentExecutionStore();
  const executor = createIntentExecutor(
    executorConfig(store, {
      execute: async () => {
        executionCalls += 1;
        await gate;
        return {
          success: true,
          confirmed: true,
          transaction: EXECUTION_TX,
          network: "eip155:998",
        };
      },
    }),
  );

  const first = executor.execute(executionInput(fixture));
  const second = executor.execute(executionInput(fixture));
  await new Promise(resolve => setImmediate(resolve));
  releaseExecution();
  await Promise.all([first, second]);

  const terminal = await executor.execute(executionInput(fixture));
  assert.equal(terminal.status, "executed");
  assert.equal(executionCalls, 1);
});

test("partial payment transition identities cannot target the primary record", async () => {
  const fixture = await makeFixture();
  const backing = new InMemoryIntentExecutionStore();
  let crash = true;
  const store: IntentExecutionStore = {
    registerPaid: record => backing.registerPaid(record),
    get: intentHash => backing.get(intentHash),
    getPayment: (network, transaction) =>
      backing.getPayment(network, transaction),
    transition: transition => {
      if (crash) {
        crash = false;
        throw new Error("stop after registration");
      }
      return backing.transition(transition);
    },
  };
  const executor = createIntentExecutor(executorConfig(store));
  await assert.rejects(
    executor.execute(executionInput(fixture)),
    /stop after registration/,
  );
  const paid = await backing.get(fixture.signedIntent.intentHash);
  assert.equal(paid?.status, "paid");

  const malformed = await backing.transition({
    intentHash: paid!.intentHash,
    paymentNetwork: paid!.paymentNetwork,
    expectedRevision: paid!.revision,
    from: "paid",
    to: "execution_claimed",
  } as unknown as IntentExecutionTransition);
  assert.equal(malformed.kind, "not_found");
  assert.equal((await backing.get(paid!.intentHash))?.status, "paid");
});

class SharedTestStore implements IntentExecutionStore {
  constructor(private readonly shared: InMemoryIntentExecutionStore) {}

  registerPaid(
    record: Parameters<IntentExecutionStore["registerPaid"]>[0],
  ): Promise<IntentStoreRegistrationResult> {
    return this.shared.registerPaid(record);
  }

  get(intentHash: string) {
    return this.shared.get(intentHash);
  }

  getPayment(paymentNetwork: string, paymentTransaction: string) {
    return this.shared.getPayment(paymentNetwork, paymentTransaction);
  }

  transition(
    transition: IntentExecutionTransition,
  ): Promise<IntentStoreTransitionResult> {
    return this.shared.transition(transition);
  }
}

test("a new executor instance replays terminal state from shared durable backing", async () => {
  const fixture = await makeFixture();
  const durableBacking = new InMemoryIntentExecutionStore();
  let executionCalls = 0;
  const execute = async () => {
    executionCalls += 1;
    return {
      success: true as const,
      confirmed: true as const,
      transaction: EXECUTION_TX,
      network: "eip155:998",
    };
  };

  const beforeRestart = createIntentExecutor(
    executorConfig(new SharedTestStore(durableBacking), { execute }),
  );
  const first = await beforeRestart.execute(executionInput(fixture));
  assert.equal(first.status, "executed");

  const afterRestart = createIntentExecutor(
    executorConfig(new SharedTestStore(durableBacking), { execute }),
  );
  const replay = await afterRestart.execute(executionInput(fixture));
  assert.equal(replay.status, "executed");
  assert.equal(replay.executionTransaction, EXECUTION_TX);
  assert.equal(executionCalls, 1);
});

test("definitive execution failure transitions through a successful refund", async () => {
  const fixture = await makeFixture();
  let executionCalls = 0;
  let refundCalls = 0;
  const executor = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore(), {
      execute: async () => {
        executionCalls += 1;
        return { success: false, refundSafe: true };
      },
      refund: async () => {
        refundCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const receipt = await executor.execute(executionInput(fixture));
  assert.equal(receipt.status, "refunded");
  assert.equal(receipt.refundTransaction, REFUND_TX);
  assert.equal(receipt.executionAttempts, 1);
  assert.equal(receipt.refundAttempts, 1);
  assert.equal(executionCalls, 1);
  assert.equal(refundCalls, 1);
});

test("a confirmed refund on the wrong network requires manual intervention", async () => {
  const fixture = await makeFixture();
  let refundCalls = 0;
  const executor = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore(), {
      execute: async () => ({ success: false, refundSafe: true }),
      refund: async () => {
        refundCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: REFUND_TX,
          network: "hyperliquid:mainnet",
        };
      },
    }),
  );

  const receipt = await executor.execute(executionInput(fixture));
  assert.equal(receipt.status, "manual_intervention");
  assert.equal(receipt.failure?.reason, "refund_uncertain");
  assert.equal(receipt.refundNetwork, "hyperliquid:mainnet");
  assert.equal(receipt.refundTransaction, REFUND_TX);
  assert.equal(refundCalls, 1);

  const replay = await executor.retryRefund(receipt.intentHash);
  assert.equal(replay.status, "manual_intervention");
  assert.equal(refundCalls, 1);
});

test("retryable refund failure can be retried without re-executing", async () => {
  const fixture = await makeFixture();
  let executionCalls = 0;
  let refundCalls = 0;
  const executor = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore(), {
      execute: async () => {
        executionCalls += 1;
        return { success: false, refundSafe: true };
      },
      refund: async () => {
        refundCalls += 1;
        if (refundCalls === 1) {
          return { success: false, retryable: true };
        }
        return {
          success: true,
          confirmed: true,
          transaction: REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const failed = await executor.execute(executionInput(fixture));
  assert.equal(failed.status, "refund_failed");
  assert.equal(failed.failure?.reason, "refund_failed");
  assert.equal(failed.failure?.retryable, true);

  const retried = await executor.retryRefund(failed.intentHash);
  assert.equal(retried.status, "refunded");
  assert.equal(retried.refundTransaction, REFUND_TX);
  assert.equal(retried.refundAttempts, 2);
  assert.equal(executionCalls, 1);
  assert.equal(refundCalls, 2);
});

test("refunded terminal receipt replay invokes neither execution nor refund again", async () => {
  const fixture = await makeFixture();
  let executionCalls = 0;
  let refundCalls = 0;
  const executor = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore(), {
      execute: async () => {
        executionCalls += 1;
        return { success: false, refundSafe: true };
      },
      refund: async () => {
        refundCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const first = await executor.execute(executionInput(fixture));
  const replay = await executor.execute(executionInput(fixture));
  assert.equal(first.status, "refunded");
  assert.equal(replay.status, "refunded");
  assert.equal(replay.refundTransaction, first.refundTransaction);
  assert.equal(executionCalls, 1);
  assert.equal(refundCalls, 1);
});

test("policy and simulation constraints fail before destination execution", async t => {
  const fixture = await makeFixture();

  const cases: Array<{
    name: string;
    overrides: Partial<IntentExecutorConfig>;
  }> = [
    {
      name: "policy target mismatch",
      overrides: {
        policy: context => ({
          ...(exactPolicy(context) as Extract<
            IntentPolicyDecision,
            { allowed: true }
          >),
          target: OTHER_TARGET,
        }),
      },
    },
    {
      name: "gas cost exceeds signed maximum",
      overrides: {
        simulate: context => ({
          ...(exactSimulation(context) as Extract<
            IntentSimulationResult,
            { success: true }
          >),
          gasCost: "100001",
        }),
      },
    },
    {
      name: "negative gas cost is invalid simulation evidence",
      overrides: {
        simulate: context => ({
          ...(exactSimulation(context) as Extract<
            IntentSimulationResult,
            { success: true }
          >),
          gasCost: "-1",
        }),
      },
    },
    {
      name: "slippage exceeds signed maximum",
      overrides: {
        simulate: context => ({
          ...(exactSimulation(context) as Extract<
            IntentSimulationResult,
            { success: true }
          >),
          slippageBps: 51,
        }),
      },
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      let executionCalls = 0;
      let refundCalls = 0;
      const executor = createIntentExecutor(
        executorConfig(new InMemoryIntentExecutionStore(), {
          ...scenario.overrides,
          execute: async () => {
            executionCalls += 1;
            return {
              success: true,
              confirmed: true,
              transaction: EXECUTION_TX,
              network: "eip155:998",
            };
          },
          refund: async () => {
            refundCalls += 1;
            return {
              success: true,
              confirmed: true,
              transaction: REFUND_TX,
              network: "hyperliquid:testnet",
            };
          },
        }),
      );

      const receipt = await executor.execute(executionInput(fixture));
      assert.equal(receipt.status, "refunded");
      assert.equal(executionCalls, 0);
      assert.equal(refundCalls, 1);
    });
  }
});

test("adapter discriminants require runtime booleans", async t => {
  await t.test("policy allowed string false is denied", async () => {
    const fixture = await makeFixture();
    let executionCalls = 0;
    const executor = createIntentExecutor(
      executorConfig(new InMemoryIntentExecutionStore(), {
        policy: context =>
          ({ ...exactPolicy(context), allowed: "false" }) as unknown as IntentPolicyDecision,
        execute: async () => {
          executionCalls += 1;
          return {
            success: true,
            confirmed: true,
            transaction: EXECUTION_TX,
            network: "eip155:998",
          };
        },
      }),
    );

    const receipt = await executor.execute(executionInput(fixture));
    assert.equal(receipt.status, "refunded");
    assert.equal(receipt.failure, undefined);
    assert.equal(executionCalls, 0);
  });

  await t.test("simulation success string false is rejected", async () => {
    const fixture = await makeFixture();
    let executionCalls = 0;
    const executor = createIntentExecutor(
      executorConfig(new InMemoryIntentExecutionStore(), {
        simulate: context =>
          ({
            ...exactSimulation(context),
            success: "false",
          }) as unknown as IntentSimulationResult,
        execute: async () => {
          executionCalls += 1;
          return {
            success: true,
            confirmed: true,
            transaction: EXECUTION_TX,
            network: "eip155:998",
          };
        },
      }),
    );

    const receipt = await executor.execute(executionInput(fixture));
    assert.equal(receipt.status, "refunded");
    assert.equal(executionCalls, 0);
  });

  for (const executionResult of [
    {
      success: "false",
      confirmed: true,
      transaction: EXECUTION_TX,
      network: "eip155:998",
    },
    null,
  ]) {
    await t.test(
      `execution result ${executionResult == null ? "null" : "string false"} is uncertain`,
      async () => {
        const fixture = await makeFixture();
        let refundCalls = 0;
        const executor = createIntentExecutor(
          executorConfig(new InMemoryIntentExecutionStore(), {
            execute: async () => executionResult as unknown as IntentExecutionResult,
            refund: async () => {
              refundCalls += 1;
              return {
                success: true,
                confirmed: true,
                transaction: REFUND_TX,
                network: "hyperliquid:testnet",
              };
            },
          }),
        );

        const receipt = await executor.execute(executionInput(fixture));
        assert.equal(receipt.status, "manual_intervention");
        assert.equal(receipt.failure?.reason, "execution_uncertain");
        assert.equal(refundCalls, 0);
      },
    );
  }

  for (const refundResult of [
    {
      success: "false",
      confirmed: true,
      transaction: REFUND_TX,
      network: "hyperliquid:testnet",
    },
    null,
  ]) {
    await t.test(
      `refund result ${refundResult == null ? "null" : "string false"} is uncertain`,
      async () => {
        const fixture = await makeFixture();
        const executor = createIntentExecutor(
          executorConfig(new InMemoryIntentExecutionStore(), {
            execute: async () => ({ success: false, refundSafe: true }),
            refund: async () => refundResult as never,
          }),
        );

        const receipt = await executor.execute(executionInput(fixture));
        assert.equal(receipt.status, "manual_intervention");
        assert.equal(receipt.failure?.reason, "refund_uncertain");
      },
    );
  }

  await t.test("null execution uncertainty flag is invalid", async () => {
    const fixture = await makeFixture();
    const executor = createIntentExecutor(
      executorConfig(new InMemoryIntentExecutionStore(), {
        execute: async () =>
          ({
            success: false,
            refundSafe: true,
            mayHaveSucceeded: null,
          }) as unknown as IntentExecutionResult,
      }),
    );

    const receipt = await executor.execute(executionInput(fixture));
    assert.equal(receipt.status, "manual_intervention");
    assert.equal(receipt.failure?.reason, "execution_uncertain");
  });

  await t.test("null refund uncertainty flag is invalid", async () => {
    const fixture = await makeFixture();
    const executor = createIntentExecutor(
      executorConfig(new InMemoryIntentExecutionStore(), {
        execute: async () => ({ success: false, refundSafe: true }),
        refund: async () =>
          ({
            success: false,
            retryable: true,
            mayHaveSucceeded: null,
          }) as never,
      }),
    );

    const receipt = await executor.execute(executionInput(fixture));
    assert.equal(receipt.status, "manual_intervention");
    assert.equal(receipt.failure?.reason, "refund_uncertain");
  });
});

test("an intent that expires during simulation is refunded without execution", async () => {
  const start = 1_800_000_000;
  let currentTime = start;
  let executionCalls = 0;
  let refundCalls = 0;
  const fixture = await makeFixture({ deadline: start + 1 });
  const executor = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore(), {
      now: () => currentTime,
      simulate: context => {
        currentTime = start + 2;
        return exactSimulation(context);
      },
      execute: async () => {
        executionCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: EXECUTION_TX,
          network: "eip155:998",
        };
      },
      refund: async () => {
        refundCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const receipt = await executor.execute({
    ...executionInput(fixture),
    now: start,
  });

  assert.equal(receipt.status, "refunded");
  assert.equal(executionCalls, 0);
  assert.equal(refundCalls, 1);
});

test("a payment and intent that expire during settlement are registered and refunded", async () => {
  const start = 1_800_000_000;
  let executionCalls = 0;
  let refundCalls = 0;
  const fixture = await makeFixture({ deadline: start });
  const expiredNonce =
    Date.now() - (fixture.paymentRequirements.maxTimeoutSeconds + 1) * 1000;
  const paymentPayload = await resignPaymentPayload(
    fixture.paymentPayload,
    exact => {
      exact.action.nonce = expiredNonce;
      exact.nonce = expiredNonce;
    },
  );
  const store = new InMemoryIntentExecutionStore();
  const executor = createIntentExecutor(
    executorConfig(store, {
      now: () => start + 10,
      execute: async () => {
        executionCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: EXECUTION_TX,
          network: "eip155:998",
        };
      },
      refund: async () => {
        refundCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const strict = await executor.verify({
    ...executionInput(fixture),
    paymentPayload,
    now: start + 10,
  });
  assertFailure(strict, "execution_intent_expired");

  const receipt = await executor.execute({
    ...executionInput(fixture),
    paymentPayload,
    now: start + 10,
  });
  assert.equal(receipt.status, "refunded");
  assert.equal(receipt.refundTransaction, REFUND_TX);
  assert.equal(executionCalls, 0);
  assert.equal(refundCalls, 1);

  const stored = await store.get(receipt.intentHash);
  assert.equal(stored?.status, "refunded");
  assert.equal(stored?.paymentTransaction, PAYMENT_TX);
});

test("an uncertain destination outcome requires manual intervention without refund", async () => {
  const fixture = await makeFixture();
  let refundCalls = 0;
  const executor = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore(), {
      execute: async () => ({
        success: false,
        refundSafe: false,
        mayHaveSucceeded: true,
      }),
      refund: async () => {
        refundCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const receipt = await executor.execute(executionInput(fixture));
  assert.equal(receipt.status, "manual_intervention");
  assert.equal(receipt.failure?.reason, "execution_uncertain");
  assert.equal(refundCalls, 0);
});

function declaredPaymentRequired(
  fixture: Fixture,
  declaration: IntentDeclaration,
  plainRequirements: PaymentRequirements,
): PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: "https://example.com/x402/execute" },
    accepts: [
      structuredClone(plainRequirements),
      structuredClone(fixture.paymentRequirements),
    ],
    extensions: { [X402_HL_INTENTS_EXTENSION]: declaration },
  };
}

function selectionPayload(requirements: PaymentRequirements): PaymentPayload {
  return {
    x402Version: 2,
    accepted: structuredClone(requirements),
    payload: { user: account.address },
  };
}

test("the client honors optional and required intent declarations", async t => {
  const fixture = await makeFixture();
  const plainRequirements = structuredClone(fixture.paymentRequirements);
  delete plainRequirements.extra.x402HlIntent;

  await t.test("required: false lets a plain payment proceed unsigned", async () => {
    const declaration = createIntentDeclaration(fixture.quote.intent, {
      required: false,
    });
    let approveCalls = 0;
    const signed = await signDeclaredExecutionIntent(
      selectionPayload(plainRequirements),
      declaredPaymentRequired(fixture, declaration, plainRequirements),
      {
        signer: account,
        domain: DOMAIN,
        approve: () => {
          approveCalls += 1;
          return true;
        },
      },
    );
    assert.equal(signed, undefined);
    assert.equal(approveCalls, 0);
  });

  await t.test("required: false still signs an intent-bound selection", async () => {
    const declaration = createIntentDeclaration(fixture.quote.intent, {
      required: false,
    });
    const signed = await signDeclaredExecutionIntent(
      selectionPayload(fixture.paymentRequirements),
      declaredPaymentRequired(fixture, declaration, plainRequirements),
      { signer: account, domain: DOMAIN, approve: () => true },
    );
    assert.ok(signed);
    assert.equal(await recoverExecutionIntentSigner(signed), account.address);
  });

  await t.test("a required declaration rejects a plain selection", async () => {
    const declaration = createIntentDeclaration(fixture.quote.intent);
    assert.equal(declaration.required, true);
    await assert.rejects(
      signDeclaredExecutionIntent(
        selectionPayload(plainRequirements),
        declaredPaymentRequired(fixture, declaration, plainRequirements),
        { signer: account, domain: DOMAIN, approve: () => true },
      ),
      /missing_intent_requirement/,
    );
  });
});

class CrashingStore implements IntentExecutionStore {
  crashOnTransitionTo?: IntentExecutionStatus;
  private readonly shared = new InMemoryIntentExecutionStore();

  registerPaid(
    record: Parameters<IntentExecutionStore["registerPaid"]>[0],
  ): Promise<IntentStoreRegistrationResult> {
    return this.shared.registerPaid(record);
  }

  get(intentHash: string) {
    return this.shared.get(intentHash);
  }

  getPayment(paymentNetwork: string, paymentTransaction: string) {
    return this.shared.getPayment(paymentNetwork, paymentTransaction);
  }

  async transition(
    transition: IntentExecutionTransition,
  ): Promise<IntentStoreTransitionResult> {
    if (transition.to === this.crashOnTransitionTo) {
      this.crashOnTransitionTo = undefined;
      throw new Error("simulated crash");
    }
    return this.shared.transition(transition);
  }
}

test("recover resumes intents abandoned mid-transition by a crash", async t => {
  function crashFixture(overrides: Partial<IntentExecutorConfig> = {}) {
    const store = new CrashingStore();
    const calls = { execution: 0, refund: 0 };
    const executor = createIntentExecutor(
      executorConfig(store, {
        execute: async () => {
          calls.execution += 1;
          return {
            success: true,
            confirmed: true,
            transaction: EXECUTION_TX,
            network: "eip155:998",
          };
        },
        refund: async () => {
          calls.refund += 1;
          return {
            success: true,
            confirmed: true,
            transaction: REFUND_TX,
            network: "hyperliquid:testnet",
          };
        },
        ...overrides,
      }),
    );
    return { store, executor, calls };
  }

  await t.test("an abandoned execution claim is refunded without execution", async () => {
    const fixture = await makeFixture();
    const { store, executor, calls } = crashFixture();

    store.crashOnTransitionTo = "execution_submitted";
    await assert.rejects(executor.execute(executionInput(fixture)), /simulated crash/);
    const stuck = await store.get(fixture.signedIntent.intentHash);
    assert.equal(stuck?.status, "execution_claimed");

    const recovered = await executor.recover(fixture.signedIntent.intentHash);
    assert.equal(recovered.status, "refunded");
    assert.equal(recovered.refundTransaction, REFUND_TX);
    assert.equal(calls.execution, 0);
    assert.equal(calls.refund, 1);
  });

  await t.test("an abandoned execution submission parks in manual_intervention", async () => {
    const fixture = await makeFixture();
    const { store, executor, calls } = crashFixture();

    store.crashOnTransitionTo = "executed";
    await assert.rejects(executor.execute(executionInput(fixture)), /simulated crash/);
    const stuck = await store.get(fixture.signedIntent.intentHash);
    assert.equal(stuck?.status, "execution_submitted");

    const recovered = await executor.recover(fixture.signedIntent.intentHash);
    assert.equal(recovered.status, "manual_intervention");
    assert.equal(recovered.failure?.reason, "execution_uncertain");
    assert.equal(calls.execution, 1);
    assert.equal(calls.refund, 0);
  });

  await t.test("an abandoned execution failure is refunded", async () => {
    const fixture = await makeFixture();
    const { store, executor, calls } = crashFixture({
      execute: async () => ({ success: false, refundSafe: true }),
    });

    store.crashOnTransitionTo = "refund_pending";
    await assert.rejects(executor.execute(executionInput(fixture)), /simulated crash/);
    const stuck = await store.get(fixture.signedIntent.intentHash);
    assert.equal(stuck?.status, "execution_failed");

    const recovered = await executor.recover(fixture.signedIntent.intentHash);
    assert.equal(recovered.status, "refunded");
    assert.equal(calls.refund, 1);
  });

  await t.test("an abandoned refund claim retries the refund", async () => {
    const fixture = await makeFixture();
    const { store, executor, calls } = crashFixture({
      execute: async () => ({ success: false, refundSafe: true }),
    });

    store.crashOnTransitionTo = "refund_submitted";
    await assert.rejects(executor.execute(executionInput(fixture)), /simulated crash/);
    const stuck = await store.get(fixture.signedIntent.intentHash);
    assert.equal(stuck?.status, "refund_claimed");

    const recovered = await executor.recover(fixture.signedIntent.intentHash);
    assert.equal(recovered.status, "refunded");
    assert.equal(recovered.refundAttempts, 2);
    assert.equal(calls.refund, 1);
  });

  await t.test("an abandoned duplicate-payment refund claim is recovered", async () => {
    const fixture = await makeFixture();
    const { store, executor, calls } = crashFixture();
    await executor.execute(executionInput(fixture));

    store.crashOnTransitionTo = "refund_submitted";
    await assert.rejects(
      executor.execute({
        ...executionInput(fixture),
        settleResponse: {
          ...fixture.settleResponse,
          transaction: SECOND_PAYMENT_TX,
        },
      }),
      /simulated crash/,
    );
    const stuck = await store.getPayment(
      "hyperliquid:testnet",
      SECOND_PAYMENT_TX,
    );
    assert.equal(stuck?.status, "refund_claimed");

    const recovered = await executor.recoverPayment(
      "hyperliquid:testnet",
      SECOND_PAYMENT_TX,
    );
    assert.equal(recovered.status, "refunded");
    assert.equal(recovered.duplicatePayment, true);
    assert.equal(calls.execution, 1);
    assert.equal(calls.refund, 1);
  });

  await t.test("an abandoned duplicate-payment refund submission parks only that payment", async () => {
    const fixture = await makeFixture();
    const { store, executor, calls } = crashFixture();
    const primary = await executor.execute(executionInput(fixture));

    store.crashOnTransitionTo = "refunded";
    await assert.rejects(
      executor.execute({
        ...executionInput(fixture),
        settleResponse: {
          ...fixture.settleResponse,
          transaction: SECOND_PAYMENT_TX,
        },
      }),
      /simulated crash/,
    );
    const stuck = await store.getPayment(
      "hyperliquid:testnet",
      SECOND_PAYMENT_TX,
    );
    assert.equal(stuck?.status, "refund_submitted");

    const recovered = await executor.recoverPayment(
      "hyperliquid:testnet",
      SECOND_PAYMENT_TX,
    );
    assert.equal(recovered.status, "manual_intervention");
    assert.equal(recovered.failure?.reason, "refund_uncertain");
    assert.equal((await store.get(primary.intentHash))?.status, "executed");
    assert.equal(calls.execution, 1);
    assert.equal(calls.refund, 1);
  });

  await t.test("an abandoned refund submission parks in manual_intervention", async () => {
    const fixture = await makeFixture();
    const { store, executor, calls } = crashFixture({
      execute: async () => ({ success: false, refundSafe: true }),
    });

    store.crashOnTransitionTo = "refunded";
    await assert.rejects(executor.execute(executionInput(fixture)), /simulated crash/);
    const stuck = await store.get(fixture.signedIntent.intentHash);
    assert.equal(stuck?.status, "refund_submitted");

    const recovered = await executor.recover(fixture.signedIntent.intentHash);
    assert.equal(recovered.status, "manual_intervention");
    assert.equal(recovered.failure?.reason, "refund_uncertain");
    assert.equal(calls.refund, 1);
  });

  await t.test("paid, terminal, and unknown records are untouched", async () => {
    const fixture = await makeFixture();
    const { store, executor } = crashFixture();

    store.crashOnTransitionTo = "execution_claimed";
    await assert.rejects(executor.execute(executionInput(fixture)), /simulated crash/);
    const paid = await executor.recover(fixture.signedIntent.intentHash);
    assert.equal(paid.status, "paid");

    const executed = await executor.execute(executionInput(fixture));
    assert.equal(executed.status, "executed");
    const terminal = await executor.recover(fixture.signedIntent.intentHash);
    assert.equal(terminal.status, "executed");
    assert.equal(terminal.executionTransaction, EXECUTION_TX);

    await assert.rejects(
      executor.recover(`0x${"55".repeat(32)}`),
      /invalid_state/,
    );
  });
});

test("a confirmed execution without a transaction string requires manual intervention", async () => {
  const fixture = await makeFixture();
  let refundCalls = 0;
  const executor = createIntentExecutor(
    executorConfig(new InMemoryIntentExecutionStore(), {
      // A plain-JS adapter can violate the typed contract at runtime.
      execute: async () =>
        ({
          success: true,
          confirmed: true,
          network: "eip155:998",
        }) as unknown as IntentExecutionResult,
      refund: async () => {
        refundCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: REFUND_TX,
          network: "hyperliquid:testnet",
        };
      },
    }),
  );

  const receipt = await executor.execute(executionInput(fixture));
  assert.equal(receipt.status, "manual_intervention");
  assert.equal(receipt.failure?.reason, "execution_uncertain");
  assert.equal(refundCalls, 0);
});

test("a confirmed execution on the wrong network preserves receipt evidence", async () => {
  const fixture = await makeFixture();
  const store = new InMemoryIntentExecutionStore();
  let executionCalls = 0;
  let refundCalls = 0;
  const executor = createIntentExecutor(
    executorConfig(store, {
      execute: async () => {
        executionCalls += 1;
        return {
          success: true,
          confirmed: true,
          transaction: ` ${EXECUTION_TX.toUpperCase()}\t`,
          network: "eip155:999",
          metadata: { provider: "destination" },
        };
      },
      refund: async () => {
        refundCalls += 1;
        return { success: false, retryable: false };
      },
    }),
  );

  const receipt = await executor.execute(executionInput(fixture));
  assert.equal(receipt.status, "manual_intervention");
  assert.equal(receipt.failure?.reason, "execution_uncertain");
  assert.equal(receipt.executionNetwork, "eip155:999");
  assert.equal(receipt.executionTransaction, EXECUTION_TX);
  assert.deepEqual(receipt.metadata, { provider: "destination" });
  assert.equal(refundCalls, 0);

  const durable = await store.get(receipt.intentHash);
  assert.equal(durable?.executionNetwork, "eip155:999");
  assert.equal(durable?.executionTransaction, EXECUTION_TX);
  assert.deepEqual(durable?.metadata, { provider: "destination" });

  const replay = await executor.execute(executionInput(fixture));
  assert.equal(replay.status, "manual_intervention");
  assert.equal(executionCalls, 1);
  assert.equal(refundCalls, 0);
});

test("invalid execution adapter metadata does not discard a confirmed receipt", async () => {
  const fixture = await makeFixture();
  const store = new InMemoryIntentExecutionStore();
  const executor = createIntentExecutor(
    executorConfig(store, {
      execute: async () =>
        ({
          success: true,
          confirmed: true,
          transaction: `  ${EXECUTION_TX.toUpperCase()} `,
          network: "eip155:998",
          metadata: { bad: undefined },
        }) as unknown as IntentExecutionResult,
    }),
  );

  const receipt = await executor.execute(executionInput(fixture));
  assert.equal(receipt.status, "executed");
  assert.equal(receipt.executionTransaction, EXECUTION_TX);
  assert.equal(receipt.metadata, undefined);
  assert.equal((await store.get(receipt.intentHash))?.status, "executed");
});

test("invalid refund adapter metadata does not discard a confirmed receipt", async () => {
  const fixture = await makeFixture();
  const store = new InMemoryIntentExecutionStore();
  const executor = createIntentExecutor(
    executorConfig(store, {
      execute: async () => ({ success: false, refundSafe: true }),
      refund: async () =>
        ({
          success: true,
          confirmed: true,
          transaction: ` ${REFUND_TX.toUpperCase()}\t`,
          network: "hyperliquid:testnet",
          metadata: { bad: undefined },
        }) as never,
    }),
  );

  const receipt = await executor.execute(executionInput(fixture));
  assert.equal(receipt.status, "refunded");
  assert.equal(receipt.refundTransaction, REFUND_TX);
  assert.equal(receipt.metadata, undefined);
  assert.equal((await store.get(receipt.intentHash))?.status, "refunded");
});

test("a store conflict on the executed transition preserves the confirmed receipt", async () => {
  const fixture = await makeFixture();
  const backing = new InMemoryIntentExecutionStore();
  let rejectedExecuted = false;
  const store: IntentExecutionStore = {
    registerPaid: record => backing.registerPaid(record),
    get: intentHash => backing.get(intentHash),
    getPayment: (network, transaction) =>
      backing.getPayment(network, transaction),
    async transition(transition) {
      if (transition.to === "executed" && !rejectedExecuted) {
        rejectedExecuted = true;
        const current = await backing.get(transition.intentHash);
        return {
          kind: "conflict",
          key: "execution_transaction",
          record: current!,
        };
      }
      return backing.transition(transition);
    },
  };
  const executor = createIntentExecutor(
    executorConfig(store, {
      execute: async () => ({
        success: true,
        confirmed: true,
        transaction: EXECUTION_TX,
        network: "eip155:998",
        metadata: { provider: "destination" },
      }),
    }),
  );

  const receipt = await executor.execute(executionInput(fixture));
  assert.equal(receipt.status, "manual_intervention");
  assert.equal(receipt.failure?.reason, "store_conflict");
  assert.equal(receipt.executionTransaction, EXECUTION_TX);
  assert.equal(receipt.executionNetwork, "eip155:998");
  assert.deepEqual(receipt.metadata, { provider: "destination" });
});

test("a record still parks manually when the store also rejects the receipt evidence", async () => {
  const fixture = await makeFixture();
  const backing = new InMemoryIntentExecutionStore();
  const store: IntentExecutionStore = {
    registerPaid: record => backing.registerPaid(record),
    get: intentHash => backing.get(intentHash),
    getPayment: (network, transaction) =>
      backing.getPayment(network, transaction),
    async transition(transition) {
      if (transition.patch?.executionTransaction) {
        const current = await backing.get(transition.intentHash);
        return {
          kind: "conflict",
          key: "execution_transaction",
          record: current!,
        };
      }
      return backing.transition(transition);
    },
  };
  const executor = createIntentExecutor(executorConfig(store));

  const receipt = await executor.execute(executionInput(fixture));
  assert.equal(receipt.status, "manual_intervention");
  assert.equal(receipt.failure?.reason, "store_conflict");
  assert.equal(receipt.executionTransaction, undefined);
});

test("a store conflict on the refunded transition preserves the refund receipt", async () => {
  const fixture = await makeFixture();
  const backing = new InMemoryIntentExecutionStore();
  let rejectedRefunded = false;
  const store: IntentExecutionStore = {
    registerPaid: record => backing.registerPaid(record),
    get: intentHash => backing.get(intentHash),
    getPayment: (network, transaction) =>
      backing.getPayment(network, transaction),
    async transition(transition) {
      if (transition.to === "refunded" && !rejectedRefunded) {
        rejectedRefunded = true;
        const current = await backing.get(transition.intentHash);
        return {
          kind: "conflict",
          key: "refund_transaction",
          record: current!,
        };
      }
      return backing.transition(transition);
    },
  };
  const executor = createIntentExecutor(
    executorConfig(store, {
      execute: async () => ({ success: false, refundSafe: true }),
      refund: async () => ({
        success: true,
        confirmed: true,
        transaction: REFUND_TX,
        network: "hyperliquid:testnet",
        metadata: { provider: "payment" },
      }),
    }),
  );

  const receipt = await executor.execute(executionInput(fixture));
  assert.equal(receipt.status, "manual_intervention");
  assert.equal(receipt.failure?.reason, "store_conflict");
  assert.equal(receipt.refundTransaction, REFUND_TX);
  assert.equal(receipt.refundNetwork, "hyperliquid:testnet");
  assert.deepEqual(receipt.metadata, { provider: "payment" });
});
