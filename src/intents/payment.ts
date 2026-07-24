import { PaymentRequirementsV2Schema } from "@x402/core/schemas";
import type { PaymentRequirements } from "@x402/core/types";
import type { Hex } from "viem";
import { getAddress, keccak256, toBytes } from "viem";
import { stableJson } from "./json";
import {
  HyperEvmExecutionIntent,
  IntentFailureReason,
  IntentPaymentExtra,
  IntentPaymentExtraSchema,
  X402_HL_INTENTS_EXTRA_KEY,
  X402_HL_INTENT_VERSION,
} from "./types";
import {
  hashIntentText,
  hashExecutionIntentTemplate,
} from "./typed-data";

export interface CanonicalPaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface IntentBindingFailure {
  reason: IntentFailureReason;
  message: string;
}

export type IntentBindingResult =
  | { ok: true; extra: IntentPaymentExtra; intentTemplateHash: Hex }
  | ({ ok: false } & IntentBindingFailure);

/**
 * Preserve every finalized payment-requirement field in a deterministic
 * commitment. `extra` is included in full; the v2 intent extra contains only a
 * template hash, so no circular final-intent hash exists.
 */
export function canonicalizePaymentRequirements(
  requirements: PaymentRequirements,
): CanonicalPaymentRequirements {
  const parsed = PaymentRequirementsV2Schema.parse(requirements);
  const canonical: CanonicalPaymentRequirements = {
    scheme: parsed.scheme,
    network: parsed.network,
    asset: parsed.asset,
    amount: parsed.amount,
    payTo: parsed.payTo,
    maxTimeoutSeconds: parsed.maxTimeoutSeconds,
    extra: parsed.extra ?? {},
  };

  // Validate JSON portability before signing.
  stableJson(canonical);
  return canonical;
}

export function hashPaymentRequirements(requirements: PaymentRequirements): Hex {
  return keccak256(toBytes(stableJson(canonicalizePaymentRequirements(requirements))));
}

export function createIntentPaymentExtra(
  intent: HyperEvmExecutionIntent,
  intentTemplateHash = hashExecutionIntentTemplate(intent),
): IntentPaymentExtra {
  return IntentPaymentExtraSchema.parse({
    version: X402_HL_INTENT_VERSION,
    mode: "brokered",
    intentTemplateHash,
    quoteId: intent.quoteId,
    applicationHash: hashIntentText(intent.application),
    gateway: intent.gateway,
    chainId: intent.chainId,
    target: intent.target,
    callDataHash: keccak256(intent.callData as Hex),
    value: intent.value,
    recipient: intent.recipient,
    refundAddress: intent.refundAddress,
    maxGasCost: intent.maxGasCost,
    maxSlippageBps: intent.maxSlippageBps,
    deadline: intent.deadline,
    nonceHash: hashIntentText(intent.nonce),
    metadataHash: intent.metadataHash,
  });
}

export function readIntentPaymentExtra(
  requirements: PaymentRequirements,
): IntentPaymentExtra | undefined {
  const extra = requirements.extra?.[X402_HL_INTENTS_EXTRA_KEY];
  if (extra == null) return undefined;
  return IntentPaymentExtraSchema.parse(extra);
}

export function verifyIntentPaymentExtra(
  intent: HyperEvmExecutionIntent,
  requirements: PaymentRequirements,
): IntentBindingResult {
  let extra: IntentPaymentExtra;
  try {
    const parsed = readIntentPaymentExtra(requirements);
    if (!parsed) {
      return bindingFailure(
        "missing_intent_requirement",
        "Payment requirements are not bound to an x402-hl execution intent",
      );
    }
    extra = parsed;
  } catch {
    return bindingFailure(
      "malformed_extension_payload",
      "Payment requirements contain a malformed x402-hl intent commitment",
    );
  }

  const intentTemplateHash = hashExecutionIntentTemplate(intent);
  const comparisons: Array<
    [boolean, IntentFailureReason, string]
  > = [
    [
      extra.intentTemplateHash.toLowerCase() === intentTemplateHash.toLowerCase(),
      "intent_template_hash_mismatch",
      "Payment requirements are bound to a different intent template",
    ],
    [
      extra.quoteId === intent.quoteId,
      "quote_mismatch",
      "Payment requirements are bound to a different quote",
    ],
    [
      extra.applicationHash.toLowerCase() === hashIntentText(intent.application).toLowerCase(),
      "application_mismatch",
      "Payment requirements are bound to a different application",
    ],
    [
      addressesEqual(extra.gateway, intent.gateway),
      "gateway_mismatch",
      "Payment requirements are bound to a different gateway",
    ],
    [
      extra.chainId === intent.chainId,
      "chain_mismatch",
      "Payment requirements are bound to a different execution chain",
    ],
    [
      addressesEqual(extra.target, intent.target),
      "target_mismatch",
      "Payment requirements are bound to a different execution target",
    ],
    [
      extra.callDataHash.toLowerCase() ===
        keccak256(intent.callData as Hex).toLowerCase(),
      "calldata_mismatch",
      "Payment requirements are bound to different calldata",
    ],
    [
      extra.value === intent.value,
      "value_mismatch",
      "Payment requirements are bound to a different native value",
    ],
    [
      addressesEqual(extra.recipient, intent.recipient),
      "recipient_mismatch",
      "Payment requirements are bound to a different recipient",
    ],
    [
      addressesEqual(extra.refundAddress, intent.refundAddress),
      "refund_address_mismatch",
      "Payment requirements are bound to a different refund address",
    ],
    [
      extra.maxGasCost === intent.maxGasCost,
      "gas_limit_mismatch",
      "Payment requirements contain a different maximum gas cost",
    ],
    [
      extra.maxSlippageBps === intent.maxSlippageBps,
      "slippage_limit_mismatch",
      "Payment requirements contain a different slippage limit",
    ],
    [
      extra.deadline === intent.deadline,
      "deadline_mismatch",
      "Payment requirements contain a different execution deadline",
    ],
    [
      extra.nonceHash.toLowerCase() === hashIntentText(intent.nonce).toLowerCase(),
      "nonce_mismatch",
      "Payment requirements contain a different execution nonce",
    ],
    [
      extra.metadataHash.toLowerCase() === intent.metadataHash.toLowerCase(),
      "metadata_mismatch",
      "Payment requirements contain a different metadata commitment",
    ],
  ];

  for (const [matches, reason, message] of comparisons) {
    if (!matches) return bindingFailure(reason, message);
  }

  return { ok: true, extra, intentTemplateHash };
}

function addressesEqual(left: string, right: string): boolean {
  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return false;
  }
}

function bindingFailure(
  reason: IntentFailureReason,
  message: string,
): IntentBindingResult {
  return { ok: false, reason, message };
}
