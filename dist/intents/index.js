// src/intents/types.ts
import { z } from "zod";
var X402_HL_INTENTS_EXTENSION = "x402-hl/intents";
var X402_HL_INTENTS_EXTRA_KEY = "x402HlIntent";
var X402_HL_INTENT_VERSION = 2;
var X402_HL_INTENT_DOMAIN_NAME = "x402-hl Execution Intent";
var X402_HL_INTENT_DOMAIN_VERSION = "2";
var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
var ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
var HexRegex = /^0x(?:[0-9a-fA-F]{2})*$/;
var Bytes32Regex = /^0x[0-9a-fA-F]{64}$/;
var EvmAddressRegex = /^0x[0-9a-fA-F]{40}$/;
var DecimalIntegerRegex = /^(0|[1-9]\d*)$/;
var HexSchema = z.string().regex(HexRegex);
var Bytes32Schema = z.string().regex(Bytes32Regex);
var EvmAddressSchema = z.string().regex(EvmAddressRegex);
var NonZeroEvmAddressSchema = EvmAddressSchema.refine(
  (value) => value.toLowerCase() !== ZERO_ADDRESS,
  "Address must not be the zero address"
);
var DecimalIntegerStringSchema = z.string().regex(DecimalIntegerRegex);
var IntentApplicationSchema = z.string().trim().min(1).max(256);
var JsonValueSchema = z.lazy(
  () => z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema)
  ])
);
var JsonRecordSchema = z.record(JsonValueSchema);
var IntentExecutionModeSchema = z.literal("brokered");
var ExecutionIntentDomainSchema = z.object({
  application: IntentApplicationSchema,
  gateway: NonZeroEvmAddressSchema
});
var HyperEvmExecutionIntentSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  application: IntentApplicationSchema,
  gateway: NonZeroEvmAddressSchema,
  user: EvmAddressSchema,
  chainId: z.number().int().positive(),
  target: EvmAddressSchema,
  callData: HexSchema,
  value: DecimalIntegerStringSchema,
  recipient: NonZeroEvmAddressSchema,
  refundAddress: NonZeroEvmAddressSchema,
  maxGasCost: DecimalIntegerStringSchema,
  maxSlippageBps: z.number().int().min(0).max(1e4),
  deadline: z.number().int().positive(),
  nonce: z.string().min(1).max(256),
  quoteId: z.string().min(1).max(256),
  metadataHash: Bytes32Schema,
  metadata: JsonRecordSchema.optional()
});
var SignedHyperEvmExecutionIntentSchema = z.object({
  intent: HyperEvmExecutionIntentSchema,
  paymentRequirementsHash: Bytes32Schema,
  intentHash: Bytes32Schema,
  signature: HexSchema,
  signer: EvmAddressSchema.optional()
});
var IntentDeclarationSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  required: z.boolean(),
  mode: IntentExecutionModeSchema,
  intent: HyperEvmExecutionIntentSchema,
  intentTemplateHash: Bytes32Schema,
  quoteId: z.string().min(1).max(256)
});
var IntentPaymentExtraSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  mode: IntentExecutionModeSchema,
  intentTemplateHash: Bytes32Schema,
  quoteId: z.string().min(1).max(256),
  applicationHash: Bytes32Schema,
  gateway: EvmAddressSchema,
  chainId: z.number().int().positive(),
  target: EvmAddressSchema,
  callDataHash: Bytes32Schema,
  value: DecimalIntegerStringSchema,
  recipient: EvmAddressSchema,
  refundAddress: EvmAddressSchema,
  maxGasCost: DecimalIntegerStringSchema,
  maxSlippageBps: z.number().int().min(0).max(1e4),
  deadline: z.number().int().positive(),
  nonceHash: Bytes32Schema,
  metadataHash: Bytes32Schema
});
var IntentExecutionStatusSchema = z.enum([
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
  "manual_intervention"
]);
var IntentFailureReasonSchema = z.enum([
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
  "invalid_state"
]);
var IntentFailureSchema = z.object({
  reason: IntentFailureReasonSchema,
  message: z.string().min(1).max(512),
  retryable: z.boolean()
});
var IntentExecutionReceiptSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  revision: z.number().int().nonnegative(),
  status: IntentExecutionStatusSchema,
  intentHash: Bytes32Schema,
  intentTemplateHash: Bytes32Schema,
  paymentRequirementsHash: Bytes32Schema,
  quoteId: z.string().min(1).max(256),
  application: IntentApplicationSchema,
  gateway: EvmAddressSchema,
  payer: EvmAddressSchema,
  paymentScheme: z.string().min(1),
  paymentNetwork: z.string().min(1),
  paymentAsset: z.string().min(1),
  paymentAmount: z.string().min(1),
  paymentPayTo: z.string().min(1),
  paymentTransaction: z.string().min(1),
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
  metadata: JsonRecordSchema.optional()
});
var TERMINAL_INTENT_EXECUTION_STATUSES = [
  "executed",
  "refunded",
  "manual_intervention"
];
function isTerminalIntentExecutionStatus(status) {
  return TERMINAL_INTENT_EXECUTION_STATUSES.includes(status);
}

// src/intents/json.ts
function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function stableJson(value) {
  return serializeJson(value, /* @__PURE__ */ new Set());
}
function serializeJson(value, ancestors) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("JSON numbers must be finite");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`Value of type ${typeof value} is not valid JSON`);
  }
  if (ancestors.has(value)) {
    throw new TypeError("Cyclic values are not valid JSON");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => serializeJson(item, ancestors)).join(",")}]`;
    }
    if (!isPlainObject(value)) {
      throw new TypeError("Only plain objects are valid JSON objects");
    }
    const entries = Object.entries(value).sort(
      ([left], [right]) => left < right ? -1 : left > right ? 1 : 0
    );
    return `{${entries.map(([key, entryValue]) => {
      if (entryValue === void 0) {
        throw new TypeError(`JSON object property ${key} is undefined`);
      }
      return `${JSON.stringify(key)}:${serializeJson(entryValue, ancestors)}`;
    }).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

// src/intents/typed-data.ts
import {
  getAddress,
  hashTypedData,
  isHex,
  keccak256,
  stringToBytes
} from "viem";
var X402_HL_INTENT_PRIMARY_TYPE = "X402HyperEvmIntent";
var X402_HL_INTENT_TYPES = {
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
    { name: "paymentRequirementsHash", type: "bytes32" }
  ]
};
function normalizeExecutionIntent(input) {
  const calculatedMetadataHash = hashIntentMetadata(input.metadata);
  if (input.metadata != null && input.metadataHash != null && input.metadataHash.toLowerCase() !== calculatedMetadataHash.toLowerCase()) {
    throw new Error("Intent metadataHash does not match canonical metadata");
  }
  const intent = {
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
    metadataHash: input.metadataHash ?? calculatedMetadataHash
  };
  return HyperEvmExecutionIntentSchema.parse(intent);
}
function hashIntentMetadata(metadata) {
  if (metadata == null) return ZERO_BYTES32;
  return keccak256(stringToBytes(stableJson(metadata)));
}
function hashIntentText(value) {
  return keccak256(stringToBytes(value));
}
function normalizeBytes32(value) {
  if (!value) return ZERO_BYTES32;
  if (isHex(value) && value.length === 66) return value;
  return hashIntentText(value);
}
function buildExecutionIntentTypedData(input, binding) {
  const intent = normalizeExecutionIntent(input);
  const paymentRequirementsHash = normalizeBytes32(binding.paymentRequirementsHash);
  return {
    domain: {
      name: X402_HL_INTENT_DOMAIN_NAME,
      version: X402_HL_INTENT_DOMAIN_VERSION,
      chainId: intent.chainId,
      verifyingContract: intent.gateway
    },
    types: X402_HL_INTENT_TYPES,
    primaryType: X402_HL_INTENT_PRIMARY_TYPE,
    message: {
      version: intent.version,
      applicationHash: hashIntentText(intent.application),
      gateway: intent.gateway,
      user: intent.user,
      chainId: BigInt(intent.chainId),
      target: intent.target,
      value: BigInt(intent.value),
      callDataHash: keccak256(intent.callData),
      recipient: intent.recipient,
      refundAddress: intent.refundAddress,
      maxGasCost: BigInt(intent.maxGasCost),
      maxSlippageBps: intent.maxSlippageBps,
      deadline: BigInt(intent.deadline),
      nonce: normalizeBytes32(intent.nonce),
      quoteId: normalizeBytes32(intent.quoteId),
      metadataHash: intent.metadataHash,
      paymentRequirementsHash
    }
  };
}
function hashExecutionIntent(input, binding) {
  return hashTypedData(buildExecutionIntentTypedData(input, binding));
}
function hashExecutionIntentTemplate(input) {
  return hashExecutionIntent(input, { paymentRequirementsHash: ZERO_BYTES32 });
}

// src/intents/payment.ts
import { getAddress as getAddress2, keccak256 as keccak2562, toBytes } from "viem";
function canonicalizePaymentRequirements(requirements) {
  const canonical = {
    scheme: requirements.scheme,
    network: requirements.network,
    asset: requirements.asset,
    amount: requirements.amount,
    payTo: requirements.payTo,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    extra: requirements.extra ?? {}
  };
  stableJson(canonical);
  return canonical;
}
function hashPaymentRequirements(requirements) {
  return keccak2562(toBytes(stableJson(canonicalizePaymentRequirements(requirements))));
}
function createIntentPaymentExtra(intent, intentTemplateHash = hashExecutionIntentTemplate(intent)) {
  return IntentPaymentExtraSchema.parse({
    version: X402_HL_INTENT_VERSION,
    mode: "brokered",
    intentTemplateHash,
    quoteId: intent.quoteId,
    applicationHash: hashIntentText(intent.application),
    gateway: intent.gateway,
    chainId: intent.chainId,
    target: intent.target,
    callDataHash: keccak2562(intent.callData),
    value: intent.value,
    recipient: intent.recipient,
    refundAddress: intent.refundAddress,
    maxGasCost: intent.maxGasCost,
    maxSlippageBps: intent.maxSlippageBps,
    deadline: intent.deadline,
    nonceHash: normalizeBytes32(intent.nonce),
    metadataHash: intent.metadataHash
  });
}
function readIntentPaymentExtra(requirements) {
  const extra = requirements.extra?.[X402_HL_INTENTS_EXTRA_KEY];
  if (extra == null) return void 0;
  return IntentPaymentExtraSchema.parse(extra);
}
function verifyIntentPaymentExtra(intent, requirements) {
  let extra;
  try {
    const parsed = readIntentPaymentExtra(requirements);
    if (!parsed) {
      return bindingFailure(
        "missing_intent_requirement",
        "Payment requirements are not bound to an x402-hl execution intent"
      );
    }
    extra = parsed;
  } catch {
    return bindingFailure(
      "malformed_extension_payload",
      "Payment requirements contain a malformed x402-hl intent commitment"
    );
  }
  const intentTemplateHash = hashExecutionIntentTemplate(intent);
  const comparisons = [
    [
      extra.intentTemplateHash.toLowerCase() === intentTemplateHash.toLowerCase(),
      "intent_template_hash_mismatch",
      "Payment requirements are bound to a different intent template"
    ],
    [
      extra.quoteId === intent.quoteId,
      "quote_mismatch",
      "Payment requirements are bound to a different quote"
    ],
    [
      extra.applicationHash.toLowerCase() === hashIntentText(intent.application).toLowerCase(),
      "application_mismatch",
      "Payment requirements are bound to a different application"
    ],
    [
      addressesEqual(extra.gateway, intent.gateway),
      "gateway_mismatch",
      "Payment requirements are bound to a different gateway"
    ],
    [
      extra.chainId === intent.chainId,
      "chain_mismatch",
      "Payment requirements are bound to a different execution chain"
    ],
    [
      addressesEqual(extra.target, intent.target),
      "target_mismatch",
      "Payment requirements are bound to a different execution target"
    ],
    [
      extra.callDataHash.toLowerCase() === keccak2562(intent.callData).toLowerCase(),
      "calldata_mismatch",
      "Payment requirements are bound to different calldata"
    ],
    [
      extra.value === intent.value,
      "value_mismatch",
      "Payment requirements are bound to a different native value"
    ],
    [
      addressesEqual(extra.recipient, intent.recipient),
      "recipient_mismatch",
      "Payment requirements are bound to a different recipient"
    ],
    [
      addressesEqual(extra.refundAddress, intent.refundAddress),
      "refund_address_mismatch",
      "Payment requirements are bound to a different refund address"
    ],
    [
      extra.maxGasCost === intent.maxGasCost,
      "gas_limit_mismatch",
      "Payment requirements contain a different maximum gas cost"
    ],
    [
      extra.maxSlippageBps === intent.maxSlippageBps,
      "slippage_limit_mismatch",
      "Payment requirements contain a different slippage limit"
    ],
    [
      extra.deadline === intent.deadline,
      "deadline_mismatch",
      "Payment requirements contain a different execution deadline"
    ],
    [
      extra.nonceHash.toLowerCase() === normalizeBytes32(intent.nonce).toLowerCase(),
      "nonce_mismatch",
      "Payment requirements contain a different execution nonce"
    ],
    [
      extra.metadataHash.toLowerCase() === intent.metadataHash.toLowerCase(),
      "metadata_mismatch",
      "Payment requirements contain a different metadata commitment"
    ]
  ];
  for (const [matches, reason, message] of comparisons) {
    if (!matches) return bindingFailure(reason, message);
  }
  return { ok: true, extra, intentTemplateHash };
}
function addressesEqual(left, right) {
  try {
    return getAddress2(left) === getAddress2(right);
  } catch {
    return false;
  }
}
function bindingFailure(reason, message) {
  return { ok: false, reason, message };
}

// src/intents/signature.ts
import { getAddress as getAddress3, recoverTypedDataAddress } from "viem";
function getIntentSignerAddress(signer) {
  const account = signer.account;
  const address = signer.address ?? (typeof account === "string" ? account : account?.address);
  if (!address) {
    throw new Error("Intent signer is missing an EVM address");
  }
  return getAddress3(address);
}
async function signExecutionIntent(input, signer, options) {
  const signerAddress = getIntentSignerAddress(signer);
  const intent = normalizeExecutionIntent(input);
  if (getAddress3(intent.user) !== signerAddress) {
    throw new Error("Execution intent user must match the EIP-712 signer");
  }
  const paymentRequirementsHash = resolvePaymentRequirementsHash(options);
  if (paymentRequirementsHash.toLowerCase() === ZERO_BYTES32) {
    throw new Error("A signed execution intent requires finalized payment requirements");
  }
  const typedData = buildExecutionIntentTypedData(intent, {
    paymentRequirementsHash
  });
  const signature = await signTypedDataWithSigner(signer, typedData);
  const signed = {
    intent,
    paymentRequirementsHash,
    intentHash: hashExecutionIntent(intent, { paymentRequirementsHash }),
    signature,
    signer: signerAddress
  };
  return SignedHyperEvmExecutionIntentSchema.parse(signed);
}
async function recoverExecutionIntentSigner(signedIntent) {
  const parsed = SignedHyperEvmExecutionIntentSchema.parse(signedIntent);
  const recovered = await recoverTypedDataAddress({
    ...buildExecutionIntentTypedData(parsed.intent, {
      paymentRequirementsHash: parsed.paymentRequirementsHash
    }),
    signature: parsed.signature
  });
  return getAddress3(recovered);
}
async function verifyExecutionIntentSignature(signedIntent) {
  const parsed = SignedHyperEvmExecutionIntentSchema.parse(signedIntent);
  const expectedHash = hashExecutionIntent(parsed.intent, {
    paymentRequirementsHash: parsed.paymentRequirementsHash
  });
  const signer = await recoverExecutionIntentSigner(parsed);
  const valid = expectedHash.toLowerCase() === parsed.intentHash.toLowerCase() && signer === getAddress3(parsed.intent.user);
  return { valid, signer, intentHash: expectedHash };
}
function resolvePaymentRequirementsHash(options) {
  if ("paymentRequirements" in options && options.paymentRequirements) {
    return hashPaymentRequirements(options.paymentRequirements);
  }
  return normalizeBytes32(options.paymentRequirementsHash);
}
async function signTypedDataWithSigner(signer, typedData) {
  try {
    return await signer.signTypedData(typedData);
  } catch (error) {
    const account = signer.account;
    if (!account) throw error;
    return await signer.signTypedData({
      ...typedData,
      account
    });
  }
}

// src/intents/extension.ts
function createIntentDeclaration(input, options = {}) {
  const intent = normalizeExecutionIntent(input);
  return IntentDeclarationSchema.parse({
    version: X402_HL_INTENT_VERSION,
    required: options.required ?? true,
    mode: "brokered",
    intent,
    intentTemplateHash: hashExecutionIntentTemplate(intent),
    quoteId: intent.quoteId
  });
}
function readIntentDeclaration(paymentRequired) {
  const declaration = paymentRequired.extensions?.[X402_HL_INTENTS_EXTENSION];
  if (declaration == null) return void 0;
  const parsed = IntentDeclarationSchema.parse(declaration);
  const expectedTemplateHash = hashExecutionIntentTemplate(parsed.intent);
  if (parsed.intentTemplateHash.toLowerCase() !== expectedTemplateHash.toLowerCase()) {
    throw new Error("Intent declaration template hash is invalid");
  }
  if (parsed.quoteId !== parsed.intent.quoteId) {
    throw new Error("Intent declaration quote id is invalid");
  }
  return parsed;
}
function attachSignedExecutionIntent(paymentPayload, signedIntent) {
  return {
    ...paymentPayload,
    extensions: {
      ...paymentPayload.extensions ?? {},
      [X402_HL_INTENTS_EXTENSION]: SignedHyperEvmExecutionIntentSchema.parse(signedIntent)
    }
  };
}
function readSignedExecutionIntent(paymentPayload) {
  const signedIntent = paymentPayload.extensions?.[X402_HL_INTENTS_EXTENSION];
  if (signedIntent == null) return void 0;
  return SignedHyperEvmExecutionIntentSchema.parse(signedIntent);
}
export {
  Bytes32Schema,
  DecimalIntegerStringSchema,
  EvmAddressSchema,
  ExecutionIntentDomainSchema,
  HexSchema,
  HyperEvmExecutionIntentSchema,
  IntentApplicationSchema,
  IntentDeclarationSchema,
  IntentExecutionModeSchema,
  IntentExecutionReceiptSchema,
  IntentExecutionStatusSchema,
  IntentFailureReasonSchema,
  IntentFailureSchema,
  IntentPaymentExtraSchema,
  JsonRecordSchema,
  JsonValueSchema,
  NonZeroEvmAddressSchema,
  SignedHyperEvmExecutionIntentSchema,
  TERMINAL_INTENT_EXECUTION_STATUSES,
  X402_HL_INTENTS_EXTENSION,
  X402_HL_INTENTS_EXTRA_KEY,
  X402_HL_INTENT_DOMAIN_NAME,
  X402_HL_INTENT_DOMAIN_VERSION,
  X402_HL_INTENT_PRIMARY_TYPE,
  X402_HL_INTENT_TYPES,
  X402_HL_INTENT_VERSION,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  attachSignedExecutionIntent,
  buildExecutionIntentTypedData,
  canonicalizePaymentRequirements,
  createIntentDeclaration,
  createIntentPaymentExtra,
  getIntentSignerAddress,
  hashExecutionIntent,
  hashExecutionIntentTemplate,
  hashIntentMetadata,
  hashIntentText,
  hashPaymentRequirements,
  isTerminalIntentExecutionStatus,
  normalizeBytes32,
  normalizeExecutionIntent,
  readIntentDeclaration,
  readIntentPaymentExtra,
  readSignedExecutionIntent,
  recoverExecutionIntentSigner,
  signExecutionIntent,
  stableJson,
  verifyExecutionIntentSignature,
  verifyIntentPaymentExtra
};
//# sourceMappingURL=index.js.map