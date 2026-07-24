import assert from "node:assert/strict";
import { test } from "node:test";
import type { PaymentPayload, SettleResponse } from "@x402/core/types";
import { PAYMENT_IDENTIFIER } from "@x402/extensions/payment-identifier";
import { privateKeyToAccount } from "viem/accounts";
import {
  createOfflineChainAdapter,
  createProductionExecutor,
  createTransferQuote,
  executeSettledIntent,
  signClientIntent,
  verifyIntentBeforeSettlement,
} from "../examples/intents/production";
import { InMemoryIntentExecutionStore } from "../src/intents/server/index";

const PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const account = privateKeyToAccount(PRIVATE_KEY);
const RECIPIENT = "0x0000000000000000000000000000000000009999";
const NOW = 1_900_000_000;

function basePaymentPayload(
  paymentRequirements: ReturnType<typeof createTransferQuote>["paymentRequirements"],
): PaymentPayload {
  return {
    x402Version: 2,
    accepted: structuredClone(paymentRequirements),
    payload: { user: account.address },
  };
}

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
      basePaymentPayload: basePaymentPayload(transfer.paymentRequirements),
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
      basePaymentPayload: basePaymentPayload(transfer.paymentRequirements),
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
      basePaymentPayload: basePaymentPayload(transfer.paymentRequirements),
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
    basePaymentPayload: basePaymentPayload(transfer.paymentRequirements),
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
