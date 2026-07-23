import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  PaymentPayload,
  PaymentRequirements,
} from "@x402/core/types";
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

async function signedPaymentPayload(): Promise<PaymentPayload> {
  const created = await new ExactHyperliquidClient(
    account,
  ).createPaymentPayload(2, requirements);
  return {
    ...created,
    accepted: structuredClone(requirements),
  };
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
});
