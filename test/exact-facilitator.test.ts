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
