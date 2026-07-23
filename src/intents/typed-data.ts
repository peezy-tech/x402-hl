import type { Address, Hex } from "viem";
import {
  getAddress,
  hashTypedData,
  isHex,
  keccak256,
  stringToBytes,
} from "viem";
import {
  HyperEvmExecutionIntent,
  HyperEvmExecutionIntentInput,
  HyperEvmExecutionIntentSchema,
  X402_HL_INTENT_DOMAIN_NAME,
  X402_HL_INTENT_DOMAIN_VERSION,
  X402_HL_INTENT_VERSION,
  ZERO_BYTES32,
} from "./types";
import { stableJson } from "./json";

export const X402_HL_INTENT_PRIMARY_TYPE = "X402HyperEvmIntent";

export const X402_HL_INTENT_TYPES = {
  [X402_HL_INTENT_PRIMARY_TYPE]: [
    { name: "version", type: "uint16" },
    { name: "applicationHash", type: "bytes32" },
    { name: "gateway", type: "address" },
    { name: "user", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "callDataHash", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "refundAddress", type: "address" },
    { name: "maxGasCost", type: "uint256" },
    { name: "maxSlippageBps", type: "uint16" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "quoteId", type: "bytes32" },
    { name: "metadataHash", type: "bytes32" },
    { name: "paymentRequirementsHash", type: "bytes32" },
  ],
} as const;

export interface ExecutionIntentPaymentBinding {
  paymentRequirementsHash: Hex | string;
}

export function normalizeExecutionIntent(
  input: HyperEvmExecutionIntentInput,
): HyperEvmExecutionIntent {
  const calculatedMetadataHash = hashIntentMetadata(input.metadata);
  if (
    input.metadata != null &&
    input.metadataHash != null &&
    input.metadataHash.toLowerCase() !== calculatedMetadataHash.toLowerCase()
  ) {
    throw new Error("Intent metadataHash does not match canonical metadata");
  }

  const intent: HyperEvmExecutionIntent = {
    ...input,
    version: X402_HL_INTENT_VERSION,
    application: input.application,
    gateway: getAddress(input.gateway),
    user: getAddress(input.user),
    target: getAddress(input.target),
    callData: input.callData ?? "0x",
    value: input.value ?? "0",
    recipient: getAddress(input.recipient ?? input.user),
    refundAddress: getAddress(input.refundAddress ?? input.recipient ?? input.user),
    maxGasCost: input.maxGasCost ?? "0",
    maxSlippageBps: input.maxSlippageBps ?? 0,
    quoteId: input.quoteId ?? input.nonce,
    metadataHash: input.metadataHash ?? calculatedMetadataHash,
  };

  return HyperEvmExecutionIntentSchema.parse(intent);
}

export function hashIntentMetadata(metadata: unknown): Hex {
  if (metadata == null) return ZERO_BYTES32;
  return keccak256(stringToBytes(stableJson(metadata)));
}

/**
 * Text commitments always hash the UTF-8 bytes of the value. `toBytes` would
 * hex-decode a `0x`-prefixed value instead, letting two distinct text values
 * (for example the nonce `"A"` and the nonce `"0x41"`) collide in the signed
 * typed data.
 */
export function hashIntentText(value: string): Hex {
  return keccak256(stringToBytes(value));
}

export function normalizeBytes32(value: string | undefined): Hex {
  if (!value) return ZERO_BYTES32;
  if (isHex(value) && value.length === 66) return value as Hex;
  return hashIntentText(value);
}

/**
 * Construct the fixed version-2 EIP-712 payload.
 *
 * The domain is intentionally not caller-customizable. The gateway address is
 * the verifying-contract domain component, while the application is committed
 * in the message. Deployments must compare both values to local configuration.
 */
export function buildExecutionIntentTypedData(
  input: HyperEvmExecutionIntentInput,
  binding: ExecutionIntentPaymentBinding,
) {
  const intent = normalizeExecutionIntent(input);
  const paymentRequirementsHash = normalizeBytes32(binding.paymentRequirementsHash);

  return {
    domain: {
      name: X402_HL_INTENT_DOMAIN_NAME,
      version: X402_HL_INTENT_DOMAIN_VERSION,
      chainId: intent.chainId,
      verifyingContract: intent.gateway as Address,
    },
    types: X402_HL_INTENT_TYPES,
    primaryType: X402_HL_INTENT_PRIMARY_TYPE,
    message: {
      version: intent.version,
      applicationHash: hashIntentText(intent.application),
      gateway: intent.gateway as Address,
      user: intent.user as Address,
      chainId: BigInt(intent.chainId),
      target: intent.target as Address,
      value: BigInt(intent.value),
      callDataHash: keccak256(intent.callData as Hex),
      recipient: intent.recipient as Address,
      refundAddress: intent.refundAddress as Address,
      maxGasCost: BigInt(intent.maxGasCost),
      maxSlippageBps: intent.maxSlippageBps,
      deadline: BigInt(intent.deadline),
      nonce: normalizeBytes32(intent.nonce),
      quoteId: normalizeBytes32(intent.quoteId),
      metadataHash: intent.metadataHash as Hex,
      paymentRequirementsHash,
    },
  } as const;
}

export function hashExecutionIntent(
  input: HyperEvmExecutionIntentInput,
  binding: ExecutionIntentPaymentBinding,
): Hex {
  return hashTypedData(buildExecutionIntentTypedData(input, binding));
}

/**
 * Hash the immutable quote template before finalized payment requirements
 * exist. A zero payment hash is reserved for this purpose and is never valid in
 * a signed payment payload.
 */
export function hashExecutionIntentTemplate(
  input: HyperEvmExecutionIntentInput,
): Hex {
  return hashExecutionIntent(input, { paymentRequirementsHash: ZERO_BYTES32 });
}
