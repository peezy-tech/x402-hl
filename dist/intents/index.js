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
var WellFormedUnicodeRegex = /^(?:[^\uD800-\uDFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/;
function isWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 55296 && codeUnit <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343)) return false;
      index += 1;
    } else if (codeUnit >= 56320 && codeUnit <= 57343) {
      return false;
    }
  }
  return true;
}
var WellFormedTextOptions = {
  message: "Text must contain well-formed Unicode"
};
var IntentTextIdentifierSchema = z.string().min(1).max(256).refine(isWellFormedUnicode, WellFormedTextOptions);
var HexSchema = z.string().regex(HexRegex);
var Bytes32Schema = z.string().regex(Bytes32Regex);
var EvmAddressSchema = z.string().regex(EvmAddressRegex);
var NonZeroEvmAddressSchema = EvmAddressSchema.refine(
  (value) => value.toLowerCase() !== ZERO_ADDRESS,
  "Address must not be the zero address"
);
var UINT256_MAX = (1n << 256n) - 1n;
var UINT256_MAX_DECIMAL = UINT256_MAX.toString();
var DecimalIntegerStringSchema = z.string().max(UINT256_MAX_DECIMAL.length).regex(DecimalIntegerRegex).refine(
  (value) => !DecimalIntegerRegex.test(value) || value.length !== UINT256_MAX_DECIMAL.length || value <= UINT256_MAX_DECIMAL,
  { message: "Value exceeds the uint256 range" }
);
var IntentApplicationSchema = z.string().trim().min(1).max(256).regex(WellFormedUnicodeRegex, WellFormedTextOptions);
var PositiveSafeIntegerSchema = z.number().int().positive().safe();
var MAX_JSON_NESTING_DEPTH = 64;
function createJsonValueSchema(remainingDepth) {
  const scalar = z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string()
  ]);
  if (remainingDepth === 0) return scalar;
  const child = createJsonValueSchema(remainingDepth - 1);
  return z.union([scalar, z.array(child), z.record(child)]);
}
var JsonValueSchema = createJsonValueSchema(MAX_JSON_NESTING_DEPTH);
var JsonRecordSchema = z.record(
  createJsonValueSchema(MAX_JSON_NESTING_DEPTH - 1)
);
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
  chainId: PositiveSafeIntegerSchema,
  target: EvmAddressSchema,
  callData: HexSchema,
  value: DecimalIntegerStringSchema,
  recipient: NonZeroEvmAddressSchema,
  refundAddress: NonZeroEvmAddressSchema,
  maxGasCost: DecimalIntegerStringSchema,
  maxSlippageBps: z.number().int().min(0).max(1e4),
  deadline: PositiveSafeIntegerSchema,
  nonce: IntentTextIdentifierSchema,
  quoteId: IntentTextIdentifierSchema,
  metadataHash: Bytes32Schema,
  metadata: JsonRecordSchema.optional()
}).strict();
var SignedHyperEvmExecutionIntentSchema = z.object({
  intent: HyperEvmExecutionIntentSchema,
  paymentRequirementsHash: Bytes32Schema,
  intentHash: Bytes32Schema,
  signature: HexSchema,
  signer: EvmAddressSchema.optional()
}).strict();
var IntentDeclarationSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  required: z.boolean(),
  mode: IntentExecutionModeSchema,
  intent: HyperEvmExecutionIntentSchema,
  intentTemplateHash: Bytes32Schema,
  quoteId: IntentTextIdentifierSchema
});
var IntentPaymentExtraSchema = z.object({
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
  maxSlippageBps: z.number().int().min(0).max(1e4),
  deadline: PositiveSafeIntegerSchema,
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
  return serializeJson(value, /* @__PURE__ */ new Set(), 0);
}
function serializeJson(value, ancestors, depth) {
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
  if (depth >= MAX_JSON_NESTING_DEPTH) {
    throw new TypeError(
      `JSON nesting exceeds the maximum depth of ${MAX_JSON_NESTING_DEPTH}`
    );
  }
  if (ancestors.has(value)) {
    throw new TypeError("Cyclic values are not valid JSON");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError("Sparse arrays are not valid JSON");
        }
      }
      return `[${value.map((item) => serializeJson(item, ancestors, depth + 1)).join(",")}]`;
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
      return `${JSON.stringify(key)}:${serializeJson(entryValue, ancestors, depth + 1)}`;
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
  const metadata = input.metadata == null ? void 0 : JsonRecordSchema.parse(input.metadata);
  if (input.metadata != null && stableJson(input.metadata) !== stableJson(metadata)) {
    throw new Error("Intent metadata is not canonical JSON");
  }
  const calculatedMetadataHash = hashIntentMetadata(metadata);
  if (metadata != null && input.metadataHash != null && input.metadataHash.toLowerCase() !== calculatedMetadataHash.toLowerCase()) {
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
    metadataHash: input.metadataHash ?? calculatedMetadataHash,
    metadata
  };
  return HyperEvmExecutionIntentSchema.parse(intent);
}
function hashIntentMetadata(metadata) {
  if (metadata == null) return ZERO_BYTES32;
  return keccak256(stringToBytes(stableJson(metadata)));
}
function hashIntentText(value) {
  if (!isWellFormedUnicode(value)) {
    throw new TypeError("Intent text must contain well-formed Unicode");
  }
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
      nonce: hashIntentText(intent.nonce),
      quoteId: hashIntentText(intent.quoteId),
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
import { PaymentRequirementsV2Schema } from "@x402/core/schemas";
import { getAddress as getAddress2, keccak256 as keccak2562, toBytes } from "viem";
function canonicalizePaymentRequirements(requirements) {
  const parsed = PaymentRequirementsV2Schema.parse(requirements);
  const extra = requirements.extra == null ? {} : Object.fromEntries(Object.entries(requirements.extra));
  const canonical = {
    scheme: parsed.scheme,
    network: parsed.network,
    asset: parsed.asset,
    amount: parsed.amount,
    payTo: parsed.payTo,
    maxTimeoutSeconds: parsed.maxTimeoutSeconds,
    extra
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
    nonceHash: hashIntentText(intent.nonce),
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
      extra.nonceHash.toLowerCase() === hashIntentText(intent.nonce).toLowerCase(),
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
  const explicitAddress = signer.address ? getAddress3(signer.address) : void 0;
  const account = signer.account;
  const accountValue = typeof account === "string" ? account : account?.address;
  const accountAddress = accountValue ? getAddress3(accountValue) : void 0;
  if (explicitAddress && accountAddress && explicitAddress !== accountAddress) {
    throw new Error(
      "Intent signer address must match the configured signing account"
    );
  }
  const address = explicitAddress ?? accountAddress;
  if (!address) {
    throw new Error("Intent signer is missing an EVM address");
  }
  return address;
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
  const valid = expectedHash.toLowerCase() === parsed.intentHash.toLowerCase() && signer === getAddress3(parsed.intent.user) && (parsed.signer == null || signer.toLowerCase() === parsed.signer.toLowerCase());
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
    if (!signer.account || typeof error !== "object" || error == null || !("name" in error) || error.name !== "AccountNotFoundError") {
      throw error;
    }
  }
  return await signer.signTypedData({
    ...typedData,
    account: signer.account
  });
}

// src/intents/extension.ts
import { z as z2 } from "zod";
var PaymentSignedExecutionIntentSchema = SignedHyperEvmExecutionIntentSchema.extend({
  version: z2.literal(X402_HL_INTENT_VERSION).optional(),
  required: z2.boolean().optional(),
  mode: z2.literal("brokered").optional(),
  intentTemplateHash: Bytes32Schema.optional(),
  quoteId: z2.string().optional()
}).strict();
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
  const extension = paymentPayload.extensions?.[X402_HL_INTENTS_EXTENSION];
  if (extension == null) return void 0;
  const parsed = PaymentSignedExecutionIntentSchema.parse(extension);
  if (parsed.intentTemplateHash != null && parsed.intentTemplateHash.toLowerCase() !== hashExecutionIntentTemplate(parsed.intent).toLowerCase()) {
    throw new Error("Intent declaration template hash is invalid");
  }
  if (parsed.quoteId != null && parsed.quoteId !== parsed.intent.quoteId) {
    throw new Error("Intent declaration quote id is invalid");
  }
  return SignedHyperEvmExecutionIntentSchema.parse({
    intent: parsed.intent,
    paymentRequirementsHash: parsed.paymentRequirementsHash,
    intentHash: parsed.intentHash,
    signature: parsed.signature,
    signer: parsed.signer
  });
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
  MAX_JSON_NESTING_DEPTH,
  NonZeroEvmAddressSchema,
  PositiveSafeIntegerSchema,
  SignedHyperEvmExecutionIntentSchema,
  TERMINAL_INTENT_EXECUTION_STATUSES,
  UINT256_MAX,
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
  isWellFormedUnicode,
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