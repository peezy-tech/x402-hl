import { z } from "zod";

export const X402_HL_INTENTS_EXTENSION = "x402-hl/intents";
export const X402_HL_INTENTS_EXTRA_KEY = "x402HlIntent";
export const X402_HL_INTENT_VERSION = 1;
export const X402_HL_INTENT_DOMAIN_NAME = "x402-hl Intents";
export const X402_HL_INTENT_DOMAIN_VERSION = "1";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const HexRegex = /^0x(?:[0-9a-fA-F]{2})*$/;
const Bytes32Regex = /^0x[0-9a-fA-F]{64}$/;
const EvmAddressRegex = /^0x[0-9a-fA-F]{40}$/;
const DecimalIntegerRegex = /^(0|[1-9]\d*)$/;

export const HexSchema = z.string().regex(HexRegex);
export const Bytes32Schema = z.string().regex(Bytes32Regex);
export const EvmAddressSchema = z.string().regex(EvmAddressRegex);
export const DecimalIntegerStringSchema = z.string().regex(DecimalIntegerRegex);
export const JsonRecordSchema = z.record(z.unknown());

export const IntentExecutionModeSchema = z.enum([
  "brokered",
  "contract",
  "smart-account",
]);

export type IntentExecutionMode = z.infer<typeof IntentExecutionModeSchema>;

export const HyperEvmExecutionIntentSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  user: EvmAddressSchema,
  chainId: z.number().int().positive(),
  target: EvmAddressSchema,
  callData: HexSchema,
  value: DecimalIntegerStringSchema,
  recipient: EvmAddressSchema,
  refundAddress: EvmAddressSchema,
  maxGasCost: DecimalIntegerStringSchema,
  maxSlippageBps: z.number().int().min(0).max(10_000),
  deadline: z.number().int().positive(),
  nonce: z.string().min(1),
  quoteId: z.string().min(1),
  metadataHash: Bytes32Schema,
  metadata: JsonRecordSchema.optional(),
});

export type HyperEvmExecutionIntent = z.infer<typeof HyperEvmExecutionIntentSchema>;

export type HyperEvmExecutionIntentInput = Omit<
  HyperEvmExecutionIntent,
  | "version"
  | "callData"
  | "value"
  | "recipient"
  | "refundAddress"
  | "maxGasCost"
  | "maxSlippageBps"
  | "quoteId"
  | "metadataHash"
> &
  Partial<
    Pick<
      HyperEvmExecutionIntent,
      | "version"
      | "callData"
      | "value"
      | "recipient"
      | "refundAddress"
      | "maxGasCost"
      | "maxSlippageBps"
      | "quoteId"
      | "metadataHash"
    >
  >;

export const SignedHyperEvmExecutionIntentSchema = z.object({
  intent: HyperEvmExecutionIntentSchema,
  intentHash: Bytes32Schema,
  signature: HexSchema,
  signer: EvmAddressSchema.optional(),
});

export type SignedHyperEvmExecutionIntent = z.infer<
  typeof SignedHyperEvmExecutionIntentSchema
>;

export const IntentDeclarationSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  required: z.boolean(),
  mode: IntentExecutionModeSchema.default("brokered"),
  intent: HyperEvmExecutionIntentSchema,
  intentHash: Bytes32Schema,
  quoteId: z.string().min(1),
  expiresAt: z.number().int().positive().optional(),
});

export type IntentDeclaration = z.infer<typeof IntentDeclarationSchema>;

export const IntentPaymentExtraSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  mode: IntentExecutionModeSchema.default("brokered"),
  intentHash: Bytes32Schema,
  quoteId: z.string().min(1),
  chainId: z.number().int().positive(),
  target: EvmAddressSchema,
  deadline: z.number().int().positive(),
});

export type IntentPaymentExtra = z.infer<typeof IntentPaymentExtraSchema>;

export const IntentExecutionStatusSchema = z.enum([
  "quoted",
  "paid",
  "executing",
  "executed",
  "failed",
  "refunded",
]);

export type IntentExecutionStatus = z.infer<typeof IntentExecutionStatusSchema>;

export const IntentExecutionReceiptSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  status: IntentExecutionStatusSchema,
  intentHash: Bytes32Schema,
  quoteId: z.string().min(1),
  payer: EvmAddressSchema.optional(),
  paymentNetwork: z.string().optional(),
  paymentTransaction: z.string().optional(),
  executionNetwork: z.string().optional(),
  executionTransaction: z.string().optional(),
  errorReason: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: JsonRecordSchema.optional(),
});

export type IntentExecutionReceipt = z.infer<typeof IntentExecutionReceiptSchema>;
