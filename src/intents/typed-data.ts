import type { Address, Hex } from "viem";
import { hashTypedData, isHex, keccak256, toBytes } from "viem";
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
    { name: "user", type: "address" },
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
  ],
} as const;

export interface ExecutionIntentTypedDataOptions {
  domainName?: string;
  domainVersion?: string;
  verifyingContract?: Address;
}

export function normalizeExecutionIntent(
  input: HyperEvmExecutionIntentInput,
): HyperEvmExecutionIntent {
  const metadataHash = input.metadataHash ?? hashIntentMetadata(input.metadata);
  const intent: HyperEvmExecutionIntent = {
    ...input,
    version: X402_HL_INTENT_VERSION,
    callData: input.callData ?? "0x",
    value: input.value ?? "0",
    recipient: input.recipient ?? input.user,
    refundAddress: input.refundAddress ?? input.recipient ?? input.user,
    maxGasCost: input.maxGasCost ?? "0",
    maxSlippageBps: input.maxSlippageBps ?? 0,
    quoteId: input.quoteId ?? input.nonce,
    metadataHash,
  };

  return HyperEvmExecutionIntentSchema.parse(intent);
}

export function hashIntentMetadata(metadata: unknown): Hex {
  if (metadata == null) return ZERO_BYTES32;
  return keccak256(toBytes(stableJson(metadata)));
}

export function hashIntentText(value: string): Hex {
  return keccak256(toBytes(value));
}

export function normalizeBytes32(value: string | undefined): Hex {
  if (!value) return ZERO_BYTES32;
  if (isHex(value) && value.length === 66) return value as Hex;
  return hashIntentText(value);
}

export function buildExecutionIntentTypedData(
  input: HyperEvmExecutionIntentInput,
  options: ExecutionIntentTypedDataOptions = {},
) {
  const intent = normalizeExecutionIntent(input);
  const domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract?: Address;
  } = {
    name: options.domainName ?? X402_HL_INTENT_DOMAIN_NAME,
    version: options.domainVersion ?? X402_HL_INTENT_DOMAIN_VERSION,
    chainId: intent.chainId,
  };

  if (options.verifyingContract) {
    domain.verifyingContract = options.verifyingContract;
  }

  return {
    domain,
    types: X402_HL_INTENT_TYPES,
    primaryType: X402_HL_INTENT_PRIMARY_TYPE,
    message: {
      user: intent.user as Address,
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
    },
  } as const;
}

export function hashExecutionIntent(
  input: HyperEvmExecutionIntentInput,
  options: ExecutionIntentTypedDataOptions = {},
): Hex {
  return hashTypedData(buildExecutionIntentTypedData(input, options));
}
