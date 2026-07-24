import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import type { Address, Hex } from "viem";
import { getAddress } from "viem";
import { verifyExactHyperliquidPayment } from "../../exact/facilitator/verification";
import {
  ExecutionIntentDomain,
  ExecutionIntentDomainSchema,
  HyperEvmExecutionIntent,
  IntentFailureReason,
  SignedHyperEvmExecutionIntent,
} from "../types";
import { hashPaymentRequirements, verifyIntentPaymentExtra } from "../payment";
import {
  hashExecutionIntent,
  hashExecutionIntentTemplate,
  normalizeExecutionIntent,
} from "../typed-data";
import { readSignedExecutionIntent } from "../extension";
import { verifyExecutionIntentSignature } from "../signature";

export interface PreSettlementIntentVerificationInput {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  expectedDomain: ExecutionIntentDomain;
  expectedQuoteId: string;
  expectedIntentTemplateHash: Hex | string;
  now?: number;
  /**
   * When false, an expired deadline alone does not fail verification; every
   * other check still applies. Reserved for the executor, which must durably
   * register a settled payment before routing an intent that expired during
   * settlement latency into the refund state machine. Defaults to true.
   */
  enforceDeadline?: boolean;
  /** Defaults to true and binds the signed intent to the Hyperliquid payer. */
  requireSamePayer?: boolean;
}

export interface PaidIntentVerificationInput
  extends PreSettlementIntentVerificationInput {
  settleResponse?: SettleResponse;
}

export interface VerifiedPreSettlementExecutionIntent {
  intent: HyperEvmExecutionIntent;
  intentHash: Hex;
  intentTemplateHash: Hex;
  paymentRequirementsHash: Hex;
  paymentPayer: Address;
  signer: Address;
}

export interface VerifiedPaidExecutionIntent
  extends VerifiedPreSettlementExecutionIntent {
  payer: Address;
  settlement: SettleResponse;
}

export type PreSettlementIntentVerificationResult =
  | ({ ok: true } & VerifiedPreSettlementExecutionIntent)
  | {
      ok: false;
      reason: IntentFailureReason;
      message: string;
    };

export type PaidIntentVerificationResult =
  | ({ ok: true } & VerifiedPaidExecutionIntent)
  | {
      ok: false;
      reason: IntentFailureReason;
      message: string;
    };

/**
 * Runs every settlement-independent check — intent presence, canonical shape,
 * payment-requirements hash, domain, quote, template hash, payment binding,
 * deadline, and signature — so a resource server can reject an unpayable
 * intent before settling the HyperCore payment and burning the user's funds.
 * The intent signer is also bound to the payer declared by the independently
 * signed Hyperliquid payment. Settlement receipt checks still require
 * `verifyPaidExecutionIntent` after settlement.
 */
export async function verifyPreSettlementExecutionIntent(
  input: PreSettlementIntentVerificationInput,
): Promise<PreSettlementIntentVerificationResult> {
  return verifyExecutionIntent(input, { allowExpiredPayment: false });
}

async function verifyExecutionIntent(
  input: PreSettlementIntentVerificationInput,
  options: { allowExpiredPayment: boolean },
): Promise<PreSettlementIntentVerificationResult> {
  let paymentRequirementsHash: Hex;
  let acceptedHash: Hex;
  try {
    paymentRequirementsHash = hashPaymentRequirements(input.paymentRequirements);
    acceptedHash = hashPaymentRequirements(input.paymentPayload.accepted);
  } catch {
    return failure(
      "malformed_extension_payload",
      "Payment requirements contain non-canonical JSON data",
    );
  }
  if (acceptedHash.toLowerCase() !== paymentRequirementsHash.toLowerCase()) {
    return failure(
      "payment_payload_requirements_mismatch",
      "Payment payload accepted different requirements than the server finalized",
    );
  }

  let signedIntent: SignedHyperEvmExecutionIntent | undefined;
  try {
    signedIntent = readSignedExecutionIntent(input.paymentPayload);
  } catch {
    return failure(
      "malformed_extension_payload",
      "Payment payload contains a malformed x402-hl execution intent",
    );
  }
  if (!signedIntent) {
    return failure(
      "missing_execution_intent",
      "Payment payload does not include an x402-hl execution intent",
    );
  }
  const intent = signedIntent.intent;

  // Untrusted intents must fail closed rather than throw: normalization
  // rejects a metadataHash that does not commit to the supplied metadata and
  // any field the later hashing calls would reject.
  try {
    normalizeExecutionIntent(intent);
  } catch {
    return failure(
      "malformed_extension_payload",
      "Payment payload contains a non-canonical x402-hl execution intent",
    );
  }

  if (
    signedIntent.paymentRequirementsHash.toLowerCase() !==
    paymentRequirementsHash.toLowerCase()
  ) {
    return failure(
      "payment_requirements_hash_mismatch",
      "Execution intent was signed for different payment requirements",
    );
  }

  let expectedDomain: ExecutionIntentDomain;
  try {
    expectedDomain = ExecutionIntentDomainSchema.parse(input.expectedDomain);
  } catch {
    return failure(
      "application_mismatch",
      "Server expected-domain configuration is invalid",
    );
  }
  if (intent.application !== expectedDomain.application) {
    return failure(
      "application_mismatch",
      "Execution intent application does not match server configuration",
    );
  }
  if (getAddress(intent.gateway) !== getAddress(expectedDomain.gateway)) {
    return failure(
      "gateway_mismatch",
      "Execution intent gateway does not match server configuration",
    );
  }

  if (intent.quoteId !== input.expectedQuoteId) {
    return failure(
      "quote_mismatch",
      "Execution intent does not match the server-side quote",
    );
  }

  // Normalization is expected to reject anything hashing would reject, but
  // this function's contract is to never throw on untrusted intents, so the
  // hashing calls stay guarded regardless.
  let intentTemplateHash: Hex;
  try {
    intentTemplateHash = hashExecutionIntentTemplate(intent);
  } catch {
    return failure(
      "malformed_extension_payload",
      "Execution intent contains fields outside the hashable range",
    );
  }
  if (
    intentTemplateHash.toLowerCase() !==
    input.expectedIntentTemplateHash.toLowerCase()
  ) {
    return failure(
      "intent_template_hash_mismatch",
      "Execution intent does not match the server-side quote template",
    );
  }

  const binding = verifyIntentPaymentExtra(intent, input.paymentRequirements);
  if (!binding.ok) return binding;
  if (
    binding.intentTemplateHash.toLowerCase() !==
    input.expectedIntentTemplateHash.toLowerCase()
  ) {
    return failure(
      "intent_template_hash_mismatch",
      "Payment requirements do not match the server-side quote template",
    );
  }

  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (
    input.enforceDeadline !== false &&
    (!Number.isInteger(now) || intent.deadline < now)
  ) {
    return failure(
      "execution_intent_expired",
      "Execution intent deadline has passed",
    );
  }

  let expectedHash: Hex;
  try {
    expectedHash = hashExecutionIntent(intent, {
      paymentRequirementsHash,
    });
  } catch {
    return failure(
      "malformed_extension_payload",
      "Execution intent contains fields outside the hashable range",
    );
  }
  if (expectedHash.toLowerCase() !== signedIntent.intentHash.toLowerCase()) {
    return failure(
      "intent_hash_mismatch",
      "Execution intent hash does not match its signed typed data",
    );
  }

  let signature: Awaited<ReturnType<typeof verifyExecutionIntentSignature>>;
  try {
    signature = await verifyExecutionIntentSignature(signedIntent);
  } catch {
    return failure(
      "invalid_execution_intent_signature",
      "Execution intent signature could not be recovered",
    );
  }
  if (!signature.valid) {
    return failure(
      "invalid_execution_intent_signature",
      "Execution intent signature is invalid",
    );
  }

  const paymentVerification = await verifyExactHyperliquidPayment(
    input.paymentPayload,
    input.paymentRequirements,
    { allowExpired: options.allowExpiredPayment },
  );
  if (!paymentVerification.isValid) {
    if (
      paymentVerification.invalidReason === "invalid_exact_hl_payload" ||
      paymentVerification.invalidReason === "invalid_exact_hl_payload_signature" ||
      paymentVerification.invalidReason ===
        "invalid_exact_hl_payload_signer_mismatch"
    ) {
      return failure(
        "malformed_extension_payload",
        "Hyperliquid payment payload does not contain a valid payer signature",
      );
    }
    return failure(
      "payment_payload_requirements_mismatch",
      "Signed Hyperliquid payment action does not satisfy the finalized requirements",
    );
  }

  let paymentPayer: Address;
  try {
    paymentPayer = getAddress(paymentVerification.payer as string);
  } catch {
    return failure(
      "malformed_extension_payload",
      "Hyperliquid payment verification did not identify a valid payer",
    );
  }
  if (
    input.requireSamePayer !== false &&
    paymentPayer !== getAddress(signature.signer)
  ) {
    return failure(
      "execution_intent_payer_mismatch",
      "Execution intent signer does not match the signed Hyperliquid payer",
    );
  }

  return {
    ok: true,
    intent,
    intentHash: expectedHash,
    intentTemplateHash,
    paymentRequirementsHash,
    paymentPayer,
    signer: signature.signer,
  };
}

export async function verifyPaidExecutionIntent(
  input: PaidIntentVerificationInput,
): Promise<PaidIntentVerificationResult> {
  const settlementFailure = verifySettlement(input);
  if (settlementFailure) return settlementFailure;
  const settlement = input.settleResponse as SettleResponse;

  let payer: Address;
  try {
    payer = getAddress(settlement.payer as string);
  } catch {
    return failure(
      "missing_settled_payer",
      "Successful settlement must identify a valid EVM payer",
    );
  }

  // A successful settlement can arrive after the signed payment TTL lapses.
  // Re-run every binding and signature check, but do not orphan confirmed funds
  // solely because settlement or reconciliation crossed that TTL.
  const verified = await verifyExecutionIntent(input, {
    allowExpiredPayment: true,
  });
  if (!verified.ok) return verified;

  if (payer !== verified.paymentPayer) {
    return failure(
      "execution_intent_payer_mismatch",
      "Settled payer does not match the signed Hyperliquid payment payer",
    );
  }

  if (
    input.requireSamePayer !== false &&
    payer !== getAddress(verified.signer)
  ) {
    return failure(
      "execution_intent_payer_mismatch",
      "Execution intent signer does not match the settled Hyperliquid payer",
    );
  }

  return {
    ...verified,
    payer,
    settlement,
  };
}

export async function assertPaidExecutionIntent(
  input: PaidIntentVerificationInput,
): Promise<VerifiedPaidExecutionIntent> {
  const result = await verifyPaidExecutionIntent(input);
  if (!result.ok) {
    throw new Error(`${result.reason}: ${result.message}`);
  }
  return result;
}

function verifySettlement(
  input: PaidIntentVerificationInput,
): PaidIntentVerificationResult | undefined {
  const settlement = input.settleResponse;
  if (!settlement) {
    return failure(
      "missing_settlement",
      "Execution requires a successful settlement response",
    );
  }
  if (settlement.success !== true) {
    return failure(
      "unsuccessful_settlement",
      "Execution requires confirmed successful settlement",
    );
  }
  if (
    typeof settlement.payer !== "string" ||
    !settlement.payer.trim()
  ) {
    return failure(
      "missing_settled_payer",
      "Successful settlement must identify the payer",
    );
  }
  if (
    typeof settlement.transaction !== "string" ||
    !settlement.transaction.trim()
  ) {
    return failure(
      "missing_settlement_transaction",
      "Successful settlement must include a transaction identifier",
    );
  }
  if (settlement.network !== input.paymentRequirements.network) {
    return failure(
      "settlement_network_mismatch",
      "Settlement network does not match payment requirements",
    );
  }
  if (
    settlement.amount != null &&
    settlement.amount !== input.paymentRequirements.amount
  ) {
    return failure(
      "settlement_amount_mismatch",
      "Settled amount does not match exact payment requirements",
    );
  }
  return undefined;
}

function failure(
  reason: IntentFailureReason,
  message: string,
): { ok: false; reason: IntentFailureReason; message: string } {
  return { ok: false, reason, message };
}
