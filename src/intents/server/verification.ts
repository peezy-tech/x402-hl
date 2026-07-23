import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import type { Address, Hex } from "viem";
import { getAddress } from "viem";
import {
  ExecutionIntentDomain,
  ExecutionIntentDomainSchema,
  HyperEvmExecutionIntent,
  IntentFailureReason,
  SignedHyperEvmExecutionIntentSchema,
} from "../types";
import { hashPaymentRequirements, verifyIntentPaymentExtra } from "../payment";
import {
  hashExecutionIntent,
  hashExecutionIntentTemplate,
  normalizeExecutionIntent,
} from "../typed-data";
import { verifyExecutionIntentSignature } from "../signature";

export interface PaidIntentVerificationInput {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  settleResponse?: SettleResponse;
  expectedDomain: ExecutionIntentDomain;
  expectedQuoteId: string;
  expectedIntentTemplateHash: Hex | string;
  requireSamePayer?: boolean;
  now?: number;
  /**
   * When false, an expired deadline alone does not fail verification; every
   * other check still applies. Reserved for the executor, which must durably
   * register a settled payment before routing an intent that expired during
   * settlement latency into the refund state machine. Defaults to true.
   */
  enforceDeadline?: boolean;
}

export interface VerifiedPaidExecutionIntent {
  intent: HyperEvmExecutionIntent;
  intentHash: Hex;
  intentTemplateHash: Hex;
  paymentRequirementsHash: Hex;
  signer: Address;
  payer: Address;
  settlement: SettleResponse;
}

export type PaidIntentVerificationResult =
  | ({ ok: true } & VerifiedPaidExecutionIntent)
  | {
      ok: false;
      reason: IntentFailureReason;
      message: string;
    };

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
      "Payment payload accepted different requirements than the settled payment",
    );
  }

  const rawSignedIntent =
    input.paymentPayload.extensions?.["x402-hl/intents"];
  if (rawSignedIntent == null) {
    return failure(
      "missing_execution_intent",
      "Payment payload does not include an x402-hl execution intent",
    );
  }

  const parsedSignedIntent = SignedHyperEvmExecutionIntentSchema.safeParse(
    rawSignedIntent,
  );
  if (!parsedSignedIntent.success) {
    return failure(
      "malformed_extension_payload",
      "Payment payload contains a malformed x402-hl execution intent",
    );
  }
  const signedIntent = parsedSignedIntent.data;
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

  const intentTemplateHash = hashExecutionIntentTemplate(intent);
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
  if (input.enforceDeadline !== false && intent.deadline < now) {
    return failure(
      "execution_intent_expired",
      "Execution intent deadline has passed",
    );
  }

  const expectedHash = hashExecutionIntent(intent, {
    paymentRequirementsHash,
  });
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

  if (
    input.requireSamePayer !== false &&
    payer !== getAddress(signature.signer)
  ) {
    return failure(
      "execution_intent_payer_mismatch",
      "Execution intent signer does not match the settled Hyperliquid payer",
    );
  }

  return {
    ok: true,
    intent,
    intentHash: expectedHash,
    intentTemplateHash,
    paymentRequirementsHash,
    signer: signature.signer,
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
  if (!settlement.payer?.trim()) {
    return failure(
      "missing_settled_payer",
      "Successful settlement must identify the payer",
    );
  }
  if (!settlement.transaction?.trim()) {
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
): PaidIntentVerificationResult {
  return { ok: false, reason, message };
}
