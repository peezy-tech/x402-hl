import assert from "node:assert/strict";
import { test } from "node:test";
import type { PaymentPayload, SettleResponse } from "@x402/core/types";
import { PAYMENT_IDENTIFIER } from "@x402/extensions/payment-identifier";
import { privateKeyToAccount } from "viem/accounts";
import {
  createOfflineChainAdapter,
  createProductionExecutor,
  POSTGRES_INTENT_STORE_CANONICALIZATION_MIGRATION_DDL,
  POSTGRES_INTENT_STORE_DDL,
  PostgresIntentExecutionStore,
  createTransferQuote,
  executeSettledIntent,
  signClientIntent,
  verifyIntentBeforeSettlement,
} from "../examples/intents/production";
import type { PostgresIntentDatabase } from "../examples/intents/production";
import { ExactHyperliquidScheme as ExactHyperliquidClient } from "../src/exact/client/index";
import { InMemoryIntentExecutionStore } from "../src/intents/server/index";

const PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const account = privateKeyToAccount(PRIVATE_KEY);
const RECIPIENT = "0x0000000000000000000000000000000000009999";
const NOW = 1_900_000_000;

async function basePaymentPayload(
  paymentRequirements: ReturnType<typeof createTransferQuote>["paymentRequirements"],
): Promise<PaymentPayload> {
  const created = await new ExactHyperliquidClient(
    account,
  ).createPaymentPayload(2, paymentRequirements);
  return {
    ...created,
    accepted: structuredClone(paymentRequirements),
  };
}

test("production Postgres quote uniqueness folds gateway address case", () => {
  assert.match(
    POSTGRES_INTENT_STORE_DDL,
    /ON x402_intent_payment \(application, lower\(gateway\), quote_id\)\s+WHERE primary_payment;/,
  );
});

test("production Postgres transaction identities share one durable canonical form", async () => {
  assert.match(
    POSTGRES_INTENT_STORE_DDL,
    /btrim\(value, U&'\\0009.*\\FEFF'\)/,
  );
  assert.match(
    POSTGRES_INTENT_STORE_DDL,
    /CREATE UNIQUE INDEX x402_intent_payment_tx_canonical[\s\S]*x402_canonical_transaction\(payment_transaction\)/,
  );
  assert.match(
    POSTGRES_INTENT_STORE_CANONICALIZATION_MIGRATION_DDL,
    /LOCK TABLE x402_intent_payment IN ACCESS EXCLUSIVE MODE;/,
  );
  assert.match(
    POSTGRES_INTENT_STORE_CANONICALIZATION_MIGRATION_DDL,
    /canonical payment transaction aliases require manual reconciliation/,
  );
  assert.match(
    POSTGRES_INTENT_STORE_CANONICALIZATION_MIGRATION_DDL,
    /record - 'paymentTransaction' - 'executionTransaction' - 'refundTransaction'/,
  );

  let lookupTransaction: string | undefined;
  const database: PostgresIntentDatabase = {
    async transaction<T>(): Promise<T> {
      throw new Error("transaction not expected");
    },
    async findByIntentHash() {
      return undefined;
    },
    async findByPayment(_paymentNetwork, paymentTransaction) {
      lookupTransaction = paymentTransaction;
      return undefined;
    },
  };
  const store = new PostgresIntentExecutionStore(database);
  const padding = [
    0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680,
    0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
    0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
    0xfeff,
  ]
    .map(codePoint => String.fromCodePoint(codePoint))
    .join("");

  await store.getPayment("hyperliquid:testnet", `${padding}0xABC${padding}`);
  assert.equal(lookupTransaction, "0xabc");
});

async function productionFixture(paymentIdentifier: string) {
  const transfer = createTransferQuote({
    quoteId: "production-payment-identifier-test",
    paymentIdentifier,
    user: account.address,
    recipient: RECIPIENT,
    tokenAmount: 1n,
    nowSeconds: NOW,
  });
  return { transfer, store: new InMemoryIntentExecutionStore() };
}

test("production pre-settlement verification validates the payment identifier", async t => {
  const expectedIdentifier = "AAAAAAAAAAAAAAAA";

  await t.test("the expected identifier passes", async () => {
    const { transfer, store } = await productionFixture(expectedIdentifier);
    const paymentPayload = await signClientIntent({
      basePaymentPayload: await basePaymentPayload(transfer.paymentRequirements),
      paymentRequired: transfer.paymentRequired,
      quote: transfer.quote,
      paymentIdentifier: expectedIdentifier,
      signer: account,
    });
    const executor = createProductionExecutor({
      store,
      chain: createOfflineChainAdapter("success"),
    });

    await verifyIntentBeforeSettlement({
      executor,
      paymentPayload,
      paymentRequirements: transfer.paymentRequirements,
      quote: transfer.quote,
      nowSeconds: NOW,
    });
  });

  await t.test("a missing identifier is rejected before settlement", async () => {
    const { transfer, store } = await productionFixture(expectedIdentifier);
    const paymentPayload = await signClientIntent({
      basePaymentPayload: await basePaymentPayload(transfer.paymentRequirements),
      paymentRequired: transfer.paymentRequired,
      quote: transfer.quote,
      paymentIdentifier: expectedIdentifier,
      signer: account,
    });
    delete paymentPayload.extensions?.[PAYMENT_IDENTIFIER];
    const executor = createProductionExecutor({
      store,
      chain: createOfflineChainAdapter("success"),
    });

    await assert.rejects(
      verifyIntentBeforeSettlement({
        executor,
        paymentPayload,
        paymentRequirements: transfer.paymentRequirements,
        quote: transfer.quote,
        nowSeconds: NOW,
      }),
      /Payment identifier is required|missing/i,
    );
  });

  await t.test("a valid hex-text alias is rejected before settlement", async () => {
    const aliasIdentifier = `0x${"41".repeat(16)}`;
    const { transfer, store } = await productionFixture(expectedIdentifier);
    const paymentPayload = await signClientIntent({
      basePaymentPayload: await basePaymentPayload(transfer.paymentRequirements),
      paymentRequired: transfer.paymentRequired,
      quote: transfer.quote,
      paymentIdentifier: aliasIdentifier,
      signer: account,
    });
    const executor = createProductionExecutor({
      store,
      chain: createOfflineChainAdapter("success"),
    });

    await assert.rejects(
      verifyIntentBeforeSettlement({
        executor,
        paymentPayload,
        paymentRequirements: transfer.paymentRequirements,
        quote: transfer.quote,
        nowSeconds: NOW,
      }),
      /Payment identifier does not match the signed quote/,
    );
  });
});

test("post-settlement identifier defense rejects aliases before registration", async () => {
  const expectedIdentifier = "AAAAAAAAAAAAAAAA";
  const aliasIdentifier = `0x${"41".repeat(16)}`;
  const { transfer, store } = await productionFixture(expectedIdentifier);
  const paymentPayload = await signClientIntent({
    basePaymentPayload: await basePaymentPayload(transfer.paymentRequirements),
    paymentRequired: transfer.paymentRequired,
    quote: transfer.quote,
    paymentIdentifier: aliasIdentifier,
    signer: account,
  });
  const executor = createProductionExecutor({
    store,
    chain: createOfflineChainAdapter("success"),
  });
  const settleResponse: SettleResponse = {
    success: true,
    payer: account.address,
    transaction: `0x${"88".repeat(32)}`,
    network: transfer.paymentRequirements.network,
    amount: transfer.paymentRequirements.amount,
  };

  await assert.rejects(
    executeSettledIntent({
      executor,
      paymentPayload,
      paymentRequirements: transfer.paymentRequirements,
      settleResponse,
      quote: transfer.quote,
      nowSeconds: NOW,
      logger: { info() {} },
    }),
    /Payment identifier does not match the signed quote/,
  );
  assert.equal(
    await store.getPayment(
      transfer.paymentRequirements.network,
      settleResponse.transaction,
    ),
    undefined,
  );
});
