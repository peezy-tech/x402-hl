import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  PaymentPayload,
  PaymentRequirements,
} from "@x402/core/types";
import { SendAssetTypes } from "@nktkas/hyperliquid/api/exchange";
import { signUserSignedAction } from "@nktkas/hyperliquid/signing";
import { privateKeyToAccount } from "viem/accounts";
import { ExactHyperliquidScheme as ExactHyperliquidClient } from "../src/exact/client/index";
import { ExactHyperliquidScheme as ExactHyperliquidFacilitator } from "../src/exact/facilitator/index";

const PRIVATE_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const OTHER_USER = "0x0000000000000000000000000000000000000002";
const PAY_TO = "0x0000000000000000000000000000000000004020";
const account = privateKeyToAccount(PRIVATE_KEY);

const requirements: PaymentRequirements = {
  scheme: "exact",
  network: "hyperliquid:testnet",
  amount: "1000000",
  asset: "USDC:0xeb62eee3685fc4c43992febcd9e75443",
  payTo: PAY_TO,
  maxTimeoutSeconds: 300,
  extra: {
    decimals: 8,
    tokenSymbol: "USDC",
  },
};

async function signedPaymentPayload(
  paymentRequirements: PaymentRequirements = requirements,
): Promise<PaymentPayload> {
  const created = await new ExactHyperliquidClient(
    account,
  ).createPaymentPayload(2, paymentRequirements);
  return {
    ...created,
    accepted: structuredClone(paymentRequirements),
  };
}

async function resignPaymentPayload(
  payload: PaymentPayload,
  mutate: (action: Record<string, unknown>) => void,
): Promise<PaymentPayload> {
  const resigned = structuredClone(payload);
  const exact = resigned.payload as {
    action: Parameters<typeof signUserSignedAction>[0]["action"] &
      Record<string, unknown>;
    signature: unknown;
  };
  mutate(exact.action);
  exact.signature = await signUserSignedAction({
    wallet: account,
    action: exact.action,
    types: SendAssetTypes,
  });
  return resigned;
}

test("facilitator verify recovers the signed Hyperliquid payer without network access", async () => {
  const payload = await signedPaymentPayload();
  const result = await new ExactHyperliquidFacilitator().verify(
    payload,
    requirements,
  );

  assert.equal(result.isValid, true);
  assert.equal(result.payer, account.address);
});

test("facilitator accepts a valid non-Arbitrum signature chain ID", async () => {
  const payload = await resignPaymentPayload(
    await signedPaymentPayload(),
    action => {
      action.signatureChainId = "0x1";
    },
  );

  const result = await new ExactHyperliquidFacilitator().verify(
    payload,
    requirements,
  );
  assert.equal(result.isValid, true);
  assert.equal(result.payer, account.address);
});

test("client and facilitator accept a valid token name ending in a space", async () => {
  const trailingSpaceRequirements: PaymentRequirements = {
    ...requirements,
    asset: "JPL :0x68046c075c2c34873fd465c76804ef90",
  };
  const payload = await signedPaymentPayload(trailingSpaceRequirements);
  const exact = payload.payload as { action: { token: string } };
  assert.equal(exact.action.token, trailingSpaceRequirements.asset);

  const result = await new ExactHyperliquidFacilitator().verify(
    payload,
    trailingSpaceRequirements,
  );
  assert.equal(result.isValid, true);
  assert.equal(result.payer, account.address);
});

test("facilitator rejects signed amounts exceeding token precision", async () => {
  const payload = await resignPaymentPayload(
    await signedPaymentPayload(),
    action => {
      action.amount = "0.010000009";
    },
  );

  const result = await new ExactHyperliquidFacilitator().verify(
    payload,
    requirements,
  );
  assert.equal(result.isValid, false);
  assert.equal(
    result.invalidReason,
    "invalid_exact_hl_payload_amount_mismatch",
  );
});

test("facilitator accepts redundant zero digits beyond token precision", async () => {
  const payload = await resignPaymentPayload(
    await signedPaymentPayload(),
    action => {
      action.amount = "0.010000000";
    },
  );

  const result = await new ExactHyperliquidFacilitator().verify(
    payload,
    requirements,
  );
  assert.equal(result.isValid, true);
  assert.equal(result.payer, account.address);
});

test("facilitator rejects malformed accepted.payTo without throwing", async () => {
  const payload = await signedPaymentPayload();
  const accepted = payload.accepted as unknown as { payTo: unknown };
  accepted.payTo = null;
  const facilitator = new ExactHyperliquidFacilitator();

  const verification = await facilitator.verify(payload, requirements);
  assert.equal(verification.isValid, false);
  assert.equal(verification.invalidReason, "invalid_exact_hl_payload");

  const settlement = await facilitator.settle(payload, requirements);
  assert.equal(settlement.success, false);
  assert.equal(settlement.errorReason, "invalid_exact_hl_payload");
});

test("facilitator still rejects the wrong Hyperliquid environment", async () => {
  const payload = await resignPaymentPayload(
    await signedPaymentPayload(),
    action => {
      action.hyperliquidChain = "Mainnet";
    },
  );

  const result = await new ExactHyperliquidFacilitator().verify(
    payload,
    requirements,
  );
  assert.equal(result.isValid, false);
  assert.equal(
    result.invalidReason,
    "invalid_exact_hl_payload_chain_mismatch",
  );
});

test("facilitator verify rejects a spoofed declared payer", async () => {
  const payload = await signedPaymentPayload();
  const tampered = structuredClone(payload);
  tampered.payload.user = OTHER_USER;

  const result = await new ExactHyperliquidFacilitator().verify(
    tampered,
    requirements,
  );
  assert.equal(result.isValid, false);
  assert.equal(
    result.invalidReason,
    "invalid_exact_hl_payload_signer_mismatch",
  );
});

test("facilitator verify rejects action tampering after signature", async () => {
  const payload = await signedPaymentPayload();
  const tampered = structuredClone(payload);
  const action = tampered.payload.action as { nonce: number };
  action.nonce += 1;
  tampered.payload.nonce = action.nonce;

  const result = await new ExactHyperliquidFacilitator().verify(
    tampered,
    requirements,
  );
  assert.equal(result.isValid, false);
  assert.ok(
    result.invalidReason === "invalid_exact_hl_payload_signature" ||
      result.invalidReason === "invalid_exact_hl_payload_signer_mismatch",
  );
});

test("facilitator verify rejects a malformed cryptographic signature", async () => {
  const payload = await signedPaymentPayload();
  const tampered = structuredClone(payload);
  tampered.payload.signature = {
    r: `0x${"00".repeat(32)}`,
    s: `0x${"00".repeat(32)}`,
    v: 27,
  };

  const result = await new ExactHyperliquidFacilitator().verify(
    tampered,
    requirements,
  );
  assert.equal(result.isValid, false);
  assert.ok(
    result.invalidReason === "invalid_exact_hl_payload_signature" ||
      result.invalidReason === "invalid_exact_hl_payload_signer_mismatch",
  );
});

type FacilitatorInternals = {
  findConfirmedTransaction(...args: unknown[]): Promise<string | undefined>;
  submitToExchange(...args: unknown[]): Promise<unknown>;
  validateTtl(...args: unknown[]): boolean;
};

test("settlement cache distinguishes signed action chain IDs", async () => {
  const original = await signedPaymentPayload();
  const alternate = await resignPaymentPayload(original, action => {
    action.signatureChainId = "0x1";
  });
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as FacilitatorInternals;
  const originalHash = `0x${"66".repeat(32)}`;
  const alternateHash = `0x${"67".repeat(32)}`;
  let reconciliationCalls = 0;
  internals.findConfirmedTransaction = async (...args: unknown[]) => {
    reconciliationCalls += 1;
    const payload = args[2] as { action: { signatureChainId: string } };
    return payload.action.signatureChainId === "0x1"
      ? alternateHash
      : originalHash;
  };
  internals.submitToExchange = async () => {
    throw new Error("a reconciled payment must not be submitted");
  };

  const first = await facilitator.settle(original, requirements);
  const second = await facilitator.settle(alternate, requirements);

  assert.equal(first.success, true);
  assert.equal(first.transaction, originalHash);
  assert.equal(second.success, true);
  assert.equal(second.transaction, alternateHash);
  assert.equal(reconciliationCalls, 2);
});

test("concurrent settlement coalesces equivalent signature chain ID encodings", async () => {
  const original = await signedPaymentPayload();
  const equivalent = structuredClone(original);
  const action = equivalent.payload.action as { signatureChainId: string };
  action.signatureChainId = `0x0${action.signatureChainId.slice(2)}`;

  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as FacilitatorInternals;
  const confirmedHash = `0x${"68".repeat(32)}`;
  let reconciliationCalls = 0;
  let submissionCalls = 0;
  internals.findConfirmedTransaction = async (...args: unknown[]) => {
    reconciliationCalls += 1;
    const attempts = args[4] as number | undefined;
    return attempts === undefined ? confirmedHash : undefined;
  };
  internals.submitToExchange = async () => {
    submissionCalls += 1;
    return { status: "ok" };
  };

  const [first, second] = await Promise.all([
    facilitator.settle(original, requirements),
    facilitator.settle(equivalent, requirements),
  ]);

  assert.equal(first.success, true);
  assert.equal(first.transaction, confirmedHash);
  assert.equal(second.success, true);
  assert.equal(second.transaction, confirmedHash);
  assert.equal(submissionCalls, 1);
  assert.equal(reconciliationCalls, 2);
});

test("settle retried after the TTL lapsed still recovers an already-settled payment", async t => {
  const payload = await signedPaymentPayload();
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as FacilitatorInternals;
  const confirmedHash = `0x${"55".repeat(32)}`;
  let submitted = false;
  internals.findConfirmedTransaction = async () => confirmedHash;
  internals.submitToExchange = async () => {
    submitted = true;
    throw new Error("an expired payment must never be resubmitted");
  };

  const ttlMs = requirements.maxTimeoutSeconds * 1000;
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + ttlMs + 60_000 });

  const verification = await facilitator.verify(payload, requirements);
  assert.equal(verification.isValid, false);
  assert.equal(verification.invalidReason, "payment_expired");

  const settled = await facilitator.settle(payload, requirements);
  assert.equal(settled.success, true);
  assert.equal(settled.transaction, confirmedHash);
  assert.equal(settled.payer, account.address);
  assert.equal(submitted, false);
});

test("settle of an expired payment with no ledger match fails closed without submitting", async t => {
  const payload = await signedPaymentPayload();
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as FacilitatorInternals;
  let submitted = false;
  internals.findConfirmedTransaction = async () => undefined;
  internals.submitToExchange = async () => {
    submitted = true;
    return { status: "ok" };
  };

  const ttlMs = requirements.maxTimeoutSeconds * 1000;
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + ttlMs + 60_000 });

  const settled = await facilitator.settle(payload, requirements);
  assert.equal(settled.success, false);
  assert.equal(settled.errorReason, "payment_expired");
  assert.equal(submitted, false);
});

test("settle rejects a far-future nonce before ledger reconciliation", async () => {
  const futureNonce = Date.now() + 60_000;
  const payload = await resignPaymentPayload(
    await signedPaymentPayload(),
    action => {
      action.nonce = futureNonce;
    },
  );
  (payload.payload as { nonce: number }).nonce = futureNonce;
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as FacilitatorInternals;
  let reconciliationCalls = 0;
  let submissionCalls = 0;
  internals.findConfirmedTransaction = async () => {
    reconciliationCalls += 1;
    return undefined;
  };
  internals.submitToExchange = async () => {
    submissionCalls += 1;
    return { status: "ok" };
  };

  const settled = await facilitator.settle(payload, requirements);
  assert.equal(settled.success, false);
  assert.equal(settled.errorReason, "payment_expired");
  assert.equal(reconciliationCalls, 0);
  assert.equal(submissionCalls, 0);
});

test("settle does not submit when TTL expires during pre-submit reconciliation", async () => {
  const payload = await signedPaymentPayload();
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as FacilitatorInternals;
  let ttlChecks = 0;
  let submitted = false;
  internals.validateTtl = () => ++ttlChecks < 3;
  internals.findConfirmedTransaction = async () => undefined;
  internals.submitToExchange = async () => {
    submitted = true;
    return { status: "ok" };
  };

  const settled = await facilitator.settle(payload, requirements);
  assert.equal(settled.success, false);
  assert.equal(settled.errorReason, "payment_expired");
  assert.equal(ttlChecks, 3);
  assert.equal(submitted, false);
});

test("settle reconciles after a replay submission error", async () => {
  const payload = await signedPaymentPayload();
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as FacilitatorInternals;
  const confirmedHash = `0x${"77".repeat(32)}`;
  let reconciliationCalls = 0;
  internals.findConfirmedTransaction = async () =>
    ++reconciliationCalls === 1 ? undefined : confirmedHash;
  internals.submitToExchange = async () => {
    throw new Error("nonce already used");
  };

  const settled = await facilitator.settle(payload, requirements);
  assert.equal(settled.success, true);
  assert.equal(settled.transaction, confirmedHash);
  assert.equal(settled.payer, account.address);
  assert.equal(reconciliationCalls, 2);
});

test("settle keeps an unreconciled submission error as hl_exchange_error", async () => {
  const payload = await signedPaymentPayload();
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as FacilitatorInternals;
  internals.findConfirmedTransaction = async () => undefined;
  internals.submitToExchange = async () => {
    throw new Error("exchange unavailable");
  };

  const settled = await facilitator.settle(payload, requirements);
  assert.equal(settled.success, false);
  assert.equal(settled.errorReason, "hl_exchange_error");
});

test("submission and confirmation share one absolute timeout budget", async () => {
  const payload = await signedPaymentPayload();
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as FacilitatorInternals & {
    runBeforeDeadline<T>(
      deadline: number,
      operation: (signal: AbortSignal) => Promise<T>,
    ): Promise<T>;
  };
  let reconciliationDeadline: number | undefined;
  let submitDeadline: number | undefined;
  let confirmationDeadline: number | undefined;
  let reconciliationCalls = 0;
  internals.runBeforeDeadline = async (deadline, operation) => {
    submitDeadline = deadline;
    return operation(new AbortController().signal);
  };
  internals.findConfirmedTransaction = async (...args: unknown[]) => {
    reconciliationCalls += 1;
    if (reconciliationCalls === 1) reconciliationDeadline = args[5] as number;
    if (reconciliationCalls === 2) confirmationDeadline = args[5] as number;
    return undefined;
  };
  internals.submitToExchange = async () => ({ status: "ok" });

  const before = Date.now();
  const settled = await facilitator.settle(payload, requirements);
  const after = Date.now();

  assert.equal(settled.success, false);
  assert.equal(settled.errorReason, "hl_transfer_not_confirmed");
  assert.equal(reconciliationCalls, 2);
  assert.ok(reconciliationDeadline != null);
  assert.ok(reconciliationDeadline >= before + 30_000);
  assert.ok(reconciliationDeadline <= after + 30_000);
  assert.equal(confirmationDeadline, submitDeadline);
  assert.ok(submitDeadline != null);
  assert.ok(submitDeadline >= before + 30_000);
  assert.ok(submitDeadline <= after + 30_000);
});

test("the timeout budget aborts a stalled exchange response body", async t => {
  const payload = await signedPaymentPayload();
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as {
    runBeforeDeadline<T>(
      deadline: number,
      operation: (signal: AbortSignal) => Promise<T>,
    ): Promise<T>;
    submitToExchange(
      endpoint: string,
      payload: unknown,
      signal?: AbortSignal,
    ): Promise<unknown>;
  };
  let requestSignal: AbortSignal | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    (async (_input, init) => {
      requestSignal = init?.signal ?? undefined;
      return {
        ok: true,
        status: 200,
        text: () => new Promise<string>(() => {}),
      } as Response;
    }) as typeof fetch,
  );

  const started = Date.now();
  await assert.rejects(
    internals.runBeforeDeadline(started + 50, signal =>
      internals.submitToExchange(
        "https://api.hyperliquid-testnet.xyz/exchange",
        payload.payload,
        signal,
      ),
    ),
    /confirmation deadline exceeded/,
  );
  assert.equal(requestSignal?.aborted, true);
  assert.ok(Date.now() - started < 1_000);
});

test("the timeout budget aborts an in-flight fixed-attempt ledger lookup", async () => {
  const payload = await signedPaymentPayload();
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as {
    findConfirmedTransaction(
      client: unknown,
      payer: string,
      payload: unknown,
      requirements: PaymentRequirements,
      attempts: number,
      deadline: number,
    ): Promise<string | undefined>;
  };
  let requestSignal: AbortSignal | undefined;
  const client = {
    userNonFundingLedgerUpdates(
      _parameters: unknown,
      signal?: AbortSignal,
    ): Promise<never> {
      requestSignal = signal;
      return new Promise(() => {});
    },
  };

  const started = Date.now();
  const found = await internals.findConfirmedTransaction(
    client,
    account.address,
    payload.payload,
    requirements,
    1,
    started + 50,
  );
  assert.equal(found, undefined);
  assert.equal(requestSignal?.aborted, true);
  assert.ok(Date.now() - started < 1_000);
});

test("facilitator recognizes the public spotTransfer ledger candidate shape", () => {
  const nonce = Date.now();
  const facilitator = new ExactHyperliquidFacilitator() as unknown as {
    ledgerUpdateMatchesPayment(
      update: unknown,
      expected: {
        payer: string;
        destination: string;
        token: string;
        amount: string;
        requirements: PaymentRequirements;
        decimals?: number;
        nonce?: number;
      },
    ): boolean;
  };
  const update = {
    time: nonce,
    hash: `0x${"11".repeat(32)}`,
    delta: {
      type: "spotTransfer",
      token: "USDC",
      amount: "0.01",
      usdcValue: "0.01",
      user: account.address,
      destination: PAY_TO,
      fee: "0",
      nativeTokenFee: "0",
      nonce: null,
      feeToken: "USDC",
    },
  };
  const expected = {
    payer: account.address,
    destination: PAY_TO,
    token: requirements.asset,
    amount: "0.01",
    requirements,
    decimals: 8,
    nonce,
  };

  assert.equal(
    facilitator.ledgerUpdateMatchesPayment(update, expected),
    true,
  );
  assert.equal(
    facilitator.ledgerUpdateMatchesPayment(
      {
        ...update,
        delta: { ...update.delta, destination: OTHER_USER },
      },
      expected,
    ),
    false,
  );
  assert.equal(
    facilitator.ledgerUpdateMatchesPayment(
      {
        ...update,
        delta: { ...update.delta, amount: "0.010000009" },
      },
      expected,
    ),
    false,
  );

  const ttlMs = requirements.maxTimeoutSeconds * 1000;
  // A transfer that executes just after the TTL (verify passed at the last
  // millisecond, then submit and confirmation latency) must still match.
  assert.equal(
    facilitator.ledgerUpdateMatchesPayment(
      { ...update, time: nonce + ttlMs + 5_000 },
      expected,
    ),
    true,
  );
  assert.equal(
    facilitator.ledgerUpdateMatchesPayment(
      { ...update, time: nonce + ttlMs + 120_000 },
      expected,
    ),
    false,
  );
});

test("ledger reconciliation finds a transfer when the client clock runs ahead of the exchange", async () => {
  const payload = await signedPaymentPayload();
  const inner = payload.payload as { nonce: number };
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as {
    findConfirmedTransaction(
      client: unknown,
      payer: string,
      payload: unknown,
      requirements: PaymentRequirements,
      attempts?: number,
    ): Promise<string | undefined>;
    confirmTransaction(...args: unknown[]): Promise<boolean>;
  };
  internals.confirmTransaction = async () => true;

  // The nonce is the client's wall clock, which verify accepts up to 30s
  // ahead of ours; the exchange then records the transfer at its own earlier
  // time. The query lookback must cover that skew or the settled transfer is
  // never returned by the ledger API.
  const transferTime = inner.nonce - 20_000;
  const hash = `0x${"66".repeat(32)}`;
  const client = {
    async userNonFundingLedgerUpdates(args: {
      startTime: number;
      endTime?: number;
    }) {
      const updates = [
        {
          time: transferTime,
          hash,
          delta: {
            type: "spotTransfer",
            token: "USDC",
            amount: "0.01",
            usdcValue: "0.01",
            user: account.address,
            destination: PAY_TO,
            fee: "0",
            nativeTokenFee: "0",
            nonce: null,
            feeToken: "USDC",
          },
        },
      ];
      return updates.filter(
        update =>
          update.time >= args.startTime &&
          (args.endTime == null || update.time <= args.endTime),
      );
    },
  };

  const found = await internals.findConfirmedTransaction(
    client,
    account.address,
    payload.payload,
    requirements,
    1,
  );
  assert.equal(found, hash);
});

test("post-submit confirmation outlasts the former five-attempt limit", async () => {
  const payload = await signedPaymentPayload();
  const exact = payload.payload as {
    nonce: number;
    action: { destination: string; token: string; amount: string };
  };
  const facilitator = new ExactHyperliquidFacilitator();
  const internals = facilitator as unknown as {
    findConfirmedTransaction(
      client: unknown,
      payer: string,
      payload: unknown,
      requirements: PaymentRequirements,
    ): Promise<string | undefined>;
    confirmTransaction(...args: unknown[]): Promise<boolean>;
  };
  internals.confirmTransaction = async () => true;

  const hash = `0x${"88".repeat(32)}`;
  let calls = 0;
  const client = {
    async userNonFundingLedgerUpdates() {
      calls += 1;
      if (calls <= 5) return [];
      return [
        {
          time: exact.nonce,
          hash,
          delta: {
            type: "spotTransfer",
            token: exact.action.token,
            amount: exact.action.amount,
            user: account.address,
            destination: exact.action.destination,
            nonce: null,
          },
        },
      ];
    },
  };

  const found = await internals.findConfirmedTransaction(
    client,
    account.address,
    payload.payload,
    requirements,
  );
  assert.equal(found, hash);
  assert.equal(calls, 6);
});
