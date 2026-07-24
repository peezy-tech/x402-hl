import { z } from "zod";

export const X402_HL_INTENTS_EXTENSION = "x402-hl/intents";
export const X402_HL_INTENTS_EXTRA_KEY = "x402HlIntent";

/**
 * Version 2 is the first production-oriented intent format. Version 1 was an
 * unpublished draft and did not bind an application, gateway, or exact payment
 * requirements.
 */
export const X402_HL_INTENT_VERSION = 2;
export const X402_HL_INTENT_DOMAIN_NAME = "x402-hl Execution Intent";
export const X402_HL_INTENT_DOMAIN_VERSION = "2";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const HexRegex = /^0x(?:[0-9a-fA-F]{2})*$/;
const Bytes32Regex = /^0x[0-9a-fA-F]{64}$/;
const EvmAddressRegex = /^0x[0-9a-fA-F]{40}$/;
const DecimalIntegerRegex = /^(0|[1-9]\d*)$/;

export function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

const WellFormedTextOptions = {
  message: "Text must contain well-formed Unicode",
} as const;
const IntentTextIdentifierSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(isWellFormedUnicode, WellFormedTextOptions);

export const HexSchema = z.string().regex(HexRegex);
export const Bytes32Schema = z.string().regex(Bytes32Regex);
export const EvmAddressSchema = z.string().regex(EvmAddressRegex);
export const NonZeroEvmAddressSchema = EvmAddressSchema.refine(
  value => value.toLowerCase() !== ZERO_ADDRESS,
  "Address must not be the zero address",
);
/**
 * Every decimal-integer field is committed as a uint256 in the EIP-712
 * message, so values beyond uint256 must fail schema validation here rather
 * than surface later as a viem IntegerOutOfRangeError during hashing. The
 * length cap bounds validation work; 2^256 - 1 has 78 decimal digits.
 */
export const UINT256_MAX = (1n << 256n) - 1n;
const UINT256_MAX_DECIMAL = UINT256_MAX.toString();
export const DecimalIntegerStringSchema = z
  .string()
  .max(UINT256_MAX_DECIMAL.length)
  .regex(DecimalIntegerRegex)
  .refine(
    value =>
      !DecimalIntegerRegex.test(value) ||
      value.length !== UINT256_MAX_DECIMAL.length ||
      value <= UINT256_MAX_DECIMAL,
    { message: "Value exceeds the uint256 range" },
  );
export const IntentApplicationSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine(isWellFormedUnicode, WellFormedTextOptions);
export const PositiveSafeIntegerSchema = z.number().int().positive().safe();

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const MAX_JSON_NESTING_DEPTH = 64;

function createJsonValueSchema(remainingDepth: number): z.ZodType<JsonValue> {
  const scalar = z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
  ]);
  if (remainingDepth === 0) return scalar;

  const child = createJsonValueSchema(remainingDepth - 1);
  return z.union([scalar, z.array(child), z.record(child)]);
}

export const JsonValueSchema = createJsonValueSchema(MAX_JSON_NESTING_DEPTH);
export const JsonRecordSchema = z.record(
  createJsonValueSchema(MAX_JSON_NESTING_DEPTH - 1),
);

/** The only execution mode implemented by the TypeScript executor. */
export const IntentExecutionModeSchema = z.literal("brokered");
export type IntentExecutionMode = z.infer<typeof IntentExecutionModeSchema>;

/**
 * A deployment identity that both clients and servers must configure locally.
 * `gateway` is also used as the EIP-712 verifying contract value.
 */
export const ExecutionIntentDomainSchema = z.object({
  application: IntentApplicationSchema,
  gateway: NonZeroEvmAddressSchema,
});
export type ExecutionIntentDomain = z.infer<typeof ExecutionIntentDomainSchema>;

export const HyperEvmExecutionIntentSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  application: IntentApplicationSchema,
  gateway: NonZeroEvmAddressSchema,
  user: EvmAddressSchema,
  chainId: PositiveSafeIntegerSchema,
  target: EvmAddressSchema,
  callData: HexSchema,
  value: DecimalIntegerStringSchema,
  recipient: NonZeroEvmAddressSchema,
  refundAddress: NonZeroEvmAddressSchema,
  maxGasCost: DecimalIntegerStringSchema,
  maxSlippageBps: z.number().int().min(0).max(10_000),
  deadline: PositiveSafeIntegerSchema,
  nonce: IntentTextIdentifierSchema,
  quoteId: IntentTextIdentifierSchema,
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
  paymentRequirementsHash: Bytes32Schema,
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
  mode: IntentExecutionModeSchema,
  intent: HyperEvmExecutionIntentSchema,
  intentTemplateHash: Bytes32Schema,
  quoteId: IntentTextIdentifierSchema,
});

export type IntentDeclaration = z.infer<typeof IntentDeclarationSchema>;

/**
 * Public payment-requirement commitment. It deliberately contains the intent
 * template hash rather than the final signed intent hash, avoiding a circular
 * dependency while still letting the signature commit to the entire finalized
 * `PaymentRequirements` object.
 */
export const IntentPaymentExtraSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  mode: IntentExecutionModeSchema,
  intentTemplateHash: Bytes32Schema,
  quoteId: IntentTextIdentifierSchema,
  applicationHash: Bytes32Schema,
  gateway: EvmAddressSchema,
  chainId: PositiveSafeIntegerSchema,
  target: EvmAddressSchema,
  callDataHash: Bytes32Schema,
  value: DecimalIntegerStringSchema,
  recipient: EvmAddressSchema,
  refundAddress: EvmAddressSchema,
  maxGasCost: DecimalIntegerStringSchema,
  maxSlippageBps: z.number().int().min(0).max(10_000),
  deadline: PositiveSafeIntegerSchema,
  nonceHash: Bytes32Schema,
  metadataHash: Bytes32Schema,
});

export type IntentPaymentExtra = z.infer<typeof IntentPaymentExtraSchema>;

export const IntentExecutionStatusSchema = z.enum([
  "paid",
  "execution_claimed",
  "execution_submitted",
  "executed",
  "execution_failed",
  "refund_pending",
  "refund_claimed",
  "refund_submitted",
  "refunded",
  "refund_failed",
  "manual_intervention",
]);

export type IntentExecutionStatus = z.infer<typeof IntentExecutionStatusSchema>;

export const IntentFailureReasonSchema = z.enum([
  "malformed_extension_payload",
  "missing_execution_intent",
  "missing_intent_requirement",
  "missing_settlement",
  "unsuccessful_settlement",
  "missing_settled_payer",
  "missing_settlement_transaction",
  "settlement_network_mismatch",
  "settlement_amount_mismatch",
  "payment_payload_requirements_mismatch",
  "payment_requirements_hash_mismatch",
  "intent_template_hash_mismatch",
  "intent_hash_mismatch",
  "quote_mismatch",
  "application_mismatch",
  "gateway_mismatch",
  "chain_mismatch",
  "target_mismatch",
  "calldata_mismatch",
  "value_mismatch",
  "recipient_mismatch",
  "refund_address_mismatch",
  "gas_limit_mismatch",
  "slippage_limit_mismatch",
  "deadline_mismatch",
  "nonce_mismatch",
  "metadata_mismatch",
  "execution_intent_expired",
  "invalid_execution_intent_signature",
  "execution_intent_payer_mismatch",
  "duplicate_payment",
  "store_conflict",
  "policy_denied",
  "policy_binding_mismatch",
  "simulation_failed",
  "gas_cost_exceeded",
  "slippage_exceeded",
  "execution_failed",
  "execution_uncertain",
  "refund_failed",
  "refund_uncertain",
  "invalid_state",
]);

export type IntentFailureReason = z.infer<typeof IntentFailureReasonSchema>;

export const IntentFailureSchema = z.object({
  reason: IntentFailureReasonSchema,
  message: z.string().min(1).max(512),
  retryable: z.boolean(),
});
export type IntentFailure = z.infer<typeof IntentFailureSchema>;

export const IntentExecutionReceiptSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  revision: z.number().int().nonnegative(),
  status: IntentExecutionStatusSchema,
  intentHash: Bytes32Schema,
  intentTemplateHash: Bytes32Schema,
  paymentRequirementsHash: Bytes32Schema,
  quoteId: IntentTextIdentifierSchema,
  application: IntentApplicationSchema,
  gateway: EvmAddressSchema,
  payer: EvmAddressSchema,
  paymentScheme: z.string().min(1),
  paymentNetwork: z.string().min(1),
  paymentAsset: z.string().min(1),
  paymentAmount: z.string().min(1),
  paymentPayTo: z.string().min(1),
  paymentTransaction: z.string().min(1),
  duplicatePayment: z.literal(true).optional(),
  executionNetwork: z.string().optional(),
  executionTransaction: z.string().optional(),
  refundNetwork: z.string().optional(),
  refundTransaction: z.string().optional(),
  executionAttempts: z.number().int().nonnegative(),
  refundAttempts: z.number().int().nonnegative(),
  failure: IntentFailureSchema.optional(),
  claimToken: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: JsonRecordSchema.optional(),
});

export type IntentExecutionReceipt = z.infer<typeof IntentExecutionReceiptSchema>;

export const TERMINAL_INTENT_EXECUTION_STATUSES: readonly IntentExecutionStatus[] = [
  "executed",
  "refunded",
  "manual_intervention",
];

export function isTerminalIntentExecutionStatus(
  status: IntentExecutionStatus,
): boolean {
  return TERMINAL_INTENT_EXECUTION_STATUSES.includes(status);
}
