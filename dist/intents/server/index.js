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
var IntentApplicationSchema = z.string().trim().min(1).max(256).refine(isWellFormedUnicode, WellFormedTextOptions);
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
  const canonical = {
    scheme: parsed.scheme,
    network: parsed.network,
    asset: parsed.asset,
    amount: parsed.amount,
    payTo: parsed.payTo,
    maxTimeoutSeconds: parsed.maxTimeoutSeconds,
    extra: parsed.extra ?? {}
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
  const parameters = signer.account ? { ...typedData, account: signer.account } : typedData;
  return await signer.signTypedData(parameters);
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

// src/intents/server/quote.ts
function createIntentQuote(input) {
  if (input.intent.quoteId !== void 0 && input.intent.quoteId !== input.id) {
    throw new Error("Intent quoteId must match the quote id");
  }
  const intent = normalizeExecutionIntent({
    ...input.intent,
    quoteId: input.id
  });
  const declaration = createIntentDeclaration(intent);
  const paymentExtra = createIntentPaymentExtra(
    intent,
    declaration.intentTemplateHash
  );
  const routeConfig = {
    accepts: {
      scheme: "exact",
      network: input.network,
      price: input.price,
      payTo: input.payTo,
      maxTimeoutSeconds: input.maxTimeoutSeconds,
      extra: {
        ...input.extra ?? {},
        [X402_HL_INTENTS_EXTRA_KEY]: paymentExtra
      }
    },
    description: input.description,
    mimeType: input.mimeType ?? "application/json",
    serviceName: input.serviceName,
    tags: input.tags,
    iconUrl: input.iconUrl,
    extensions: {
      [X402_HL_INTENTS_EXTENSION]: declaration
    }
  };
  return {
    id: input.id,
    intent,
    intentTemplateHash: declaration.intentTemplateHash,
    declaration,
    paymentExtra,
    routeConfig
  };
}

// src/intents/server/verification.ts
import { SendAssetTypes } from "@nktkas/hyperliquid/api/exchange";
import { getAddress as getAddress4, recoverTypedDataAddress as recoverTypedDataAddress2 } from "viem";

// src/types.ts
import { z as z3 } from "zod";
var HyperliquidTokenIdRegex = /^[^:]+:0x[0-9a-fA-F]{32,40}$/;
var Bytes32Regex2 = /^0x[0-9a-fA-F]{64}$/;
var EvmAddressRegex2 = /^0x[0-9a-fA-F]{40}$/;
var HexIntegerRegex = /^0x[0-9a-fA-F]+$/;
var DecimalAmountRegex = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
var ExactHyperliquidPayloadSchema = z3.object({
  action: z3.object({
    type: z3.literal("sendAsset"),
    signatureChainId: z3.string().regex(HexIntegerRegex),
    hyperliquidChain: z3.enum(["Mainnet", "Testnet"]),
    destination: z3.string().regex(EvmAddressRegex2),
    sourceDex: z3.literal("spot"),
    destinationDex: z3.literal("spot"),
    token: z3.string().regex(HyperliquidTokenIdRegex),
    amount: z3.string().regex(DecimalAmountRegex),
    fromSubAccount: z3.literal(""),
    nonce: z3.number().int().nonnegative().safe()
  }).strict(),
  signature: z3.object({
    r: z3.string().regex(Bytes32Regex2),
    s: z3.string().regex(Bytes32Regex2),
    v: z3.union([z3.literal(27), z3.literal(28)])
  }).strict(),
  nonce: z3.number().int().nonnegative().safe(),
  user: z3.string().regex(EvmAddressRegex2)
}).strict();

// src/intents/server/verification.ts
async function verifyPreSettlementExecutionIntent(input) {
  let paymentRequirementsHash;
  let acceptedHash;
  try {
    paymentRequirementsHash = hashPaymentRequirements(input.paymentRequirements);
    acceptedHash = hashPaymentRequirements(input.paymentPayload.accepted);
  } catch {
    return failure(
      "malformed_extension_payload",
      "Payment requirements contain non-canonical JSON data"
    );
  }
  if (acceptedHash.toLowerCase() !== paymentRequirementsHash.toLowerCase()) {
    return failure(
      "payment_payload_requirements_mismatch",
      "Payment payload accepted different requirements than the server finalized"
    );
  }
  const rawSignedIntent = input.paymentPayload.extensions?.["x402-hl/intents"];
  if (rawSignedIntent == null) {
    return failure(
      "missing_execution_intent",
      "Payment payload does not include an x402-hl execution intent"
    );
  }
  let signedIntent;
  try {
    signedIntent = readSignedExecutionIntent(input.paymentPayload);
  } catch {
    return failure(
      "malformed_extension_payload",
      "Payment payload contains a malformed x402-hl execution intent"
    );
  }
  const intent = signedIntent.intent;
  try {
    normalizeExecutionIntent(intent);
  } catch {
    return failure(
      "malformed_extension_payload",
      "Payment payload contains a non-canonical x402-hl execution intent"
    );
  }
  if (signedIntent.paymentRequirementsHash.toLowerCase() !== paymentRequirementsHash.toLowerCase()) {
    return failure(
      "payment_requirements_hash_mismatch",
      "Execution intent was signed for different payment requirements"
    );
  }
  let expectedDomain;
  try {
    expectedDomain = ExecutionIntentDomainSchema.parse(input.expectedDomain);
  } catch {
    return failure(
      "application_mismatch",
      "Server expected-domain configuration is invalid"
    );
  }
  if (intent.application !== expectedDomain.application) {
    return failure(
      "application_mismatch",
      "Execution intent application does not match server configuration"
    );
  }
  if (getAddress4(intent.gateway) !== getAddress4(expectedDomain.gateway)) {
    return failure(
      "gateway_mismatch",
      "Execution intent gateway does not match server configuration"
    );
  }
  if (intent.quoteId !== input.expectedQuoteId) {
    return failure(
      "quote_mismatch",
      "Execution intent does not match the server-side quote"
    );
  }
  let intentTemplateHash;
  try {
    intentTemplateHash = hashExecutionIntentTemplate(intent);
  } catch {
    return failure(
      "malformed_extension_payload",
      "Execution intent contains fields outside the hashable range"
    );
  }
  if (intentTemplateHash.toLowerCase() !== input.expectedIntentTemplateHash.toLowerCase()) {
    return failure(
      "intent_template_hash_mismatch",
      "Execution intent does not match the server-side quote template"
    );
  }
  const binding = verifyIntentPaymentExtra(intent, input.paymentRequirements);
  if (!binding.ok) return binding;
  if (binding.intentTemplateHash.toLowerCase() !== input.expectedIntentTemplateHash.toLowerCase()) {
    return failure(
      "intent_template_hash_mismatch",
      "Payment requirements do not match the server-side quote template"
    );
  }
  const now = input.now ?? Math.floor(Date.now() / 1e3);
  if (input.enforceDeadline !== false && (!Number.isInteger(now) || intent.deadline < now)) {
    return failure(
      "execution_intent_expired",
      "Execution intent deadline has passed"
    );
  }
  let expectedHash;
  try {
    expectedHash = hashExecutionIntent(intent, {
      paymentRequirementsHash
    });
  } catch {
    return failure(
      "malformed_extension_payload",
      "Execution intent contains fields outside the hashable range"
    );
  }
  if (expectedHash.toLowerCase() !== signedIntent.intentHash.toLowerCase()) {
    return failure(
      "intent_hash_mismatch",
      "Execution intent hash does not match its signed typed data"
    );
  }
  let signature;
  try {
    signature = await verifyExecutionIntentSignature(signedIntent);
  } catch {
    return failure(
      "invalid_execution_intent_signature",
      "Execution intent signature could not be recovered"
    );
  }
  if (!signature.valid) {
    return failure(
      "invalid_execution_intent_signature",
      "Execution intent signature is invalid"
    );
  }
  let paymentPayer;
  try {
    const parsedPayment = ExactHyperliquidPayloadSchema.parse(
      input.paymentPayload.payload
    );
    const recoveredPayer = await recoverTypedDataAddress2({
      domain: {
        name: "HyperliquidSignTransaction",
        version: "1",
        chainId: Number.parseInt(parsedPayment.action.signatureChainId),
        verifyingContract: "0x0000000000000000000000000000000000000000"
      },
      types: SendAssetTypes,
      primaryType: "HyperliquidTransaction:SendAsset",
      message: parsedPayment.action,
      signature: {
        r: parsedPayment.signature.r,
        s: parsedPayment.signature.s,
        yParity: parsedPayment.signature.v - 27
      }
    });
    paymentPayer = getAddress4(recoveredPayer);
    if (paymentPayer !== getAddress4(parsedPayment.user)) throw new Error();
  } catch {
    return failure(
      "malformed_extension_payload",
      "Hyperliquid payment payload does not contain a valid payer signature"
    );
  }
  if (input.requireSamePayer !== false && paymentPayer !== getAddress4(signature.signer)) {
    return failure(
      "execution_intent_payer_mismatch",
      "Execution intent signer does not match the signed Hyperliquid payer"
    );
  }
  return {
    ok: true,
    intent,
    intentHash: expectedHash,
    intentTemplateHash,
    paymentRequirementsHash,
    paymentPayer,
    signer: signature.signer
  };
}
async function verifyPaidExecutionIntent(input) {
  const settlementFailure = verifySettlement(input);
  if (settlementFailure) return settlementFailure;
  const settlement = input.settleResponse;
  let payer;
  try {
    payer = getAddress4(settlement.payer);
  } catch {
    return failure(
      "missing_settled_payer",
      "Successful settlement must identify a valid EVM payer"
    );
  }
  const verified = await verifyPreSettlementExecutionIntent(input);
  if (!verified.ok) return verified;
  if (payer !== verified.paymentPayer) {
    return failure(
      "execution_intent_payer_mismatch",
      "Settled payer does not match the signed Hyperliquid payment payer"
    );
  }
  if (input.requireSamePayer !== false && payer !== getAddress4(verified.signer)) {
    return failure(
      "execution_intent_payer_mismatch",
      "Execution intent signer does not match the settled Hyperliquid payer"
    );
  }
  return {
    ...verified,
    payer,
    settlement
  };
}
async function assertPaidExecutionIntent(input) {
  const result = await verifyPaidExecutionIntent(input);
  if (!result.ok) {
    throw new Error(`${result.reason}: ${result.message}`);
  }
  return result;
}
function verifySettlement(input) {
  const settlement = input.settleResponse;
  if (!settlement) {
    return failure(
      "missing_settlement",
      "Execution requires a successful settlement response"
    );
  }
  if (settlement.success !== true) {
    return failure(
      "unsuccessful_settlement",
      "Execution requires confirmed successful settlement"
    );
  }
  if (typeof settlement.payer !== "string" || !settlement.payer.trim()) {
    return failure(
      "missing_settled_payer",
      "Successful settlement must identify the payer"
    );
  }
  if (typeof settlement.transaction !== "string" || !settlement.transaction.trim()) {
    return failure(
      "missing_settlement_transaction",
      "Successful settlement must include a transaction identifier"
    );
  }
  if (settlement.network !== input.paymentRequirements.network) {
    return failure(
      "settlement_network_mismatch",
      "Settlement network does not match payment requirements"
    );
  }
  if (settlement.amount != null && settlement.amount !== input.paymentRequirements.amount) {
    return failure(
      "settlement_amount_mismatch",
      "Settled amount does not match exact payment requirements"
    );
  }
  return void 0;
}
function failure(reason, message) {
  return { ok: false, reason, message };
}

// src/intents/server/identifiers.ts
function canonicalizeTransactionIdentifier(value) {
  return value.trim().toLowerCase();
}

// src/intents/server/store.ts
var IntentExecutionRecordSchema = IntentExecutionReceiptSchema.extend({
  intent: HyperEvmExecutionIntentSchema
});
var InMemoryIntentExecutionStore = class {
  records = /* @__PURE__ */ new Map();
  duplicatePayments = /* @__PURE__ */ new Map();
  quotes = /* @__PURE__ */ new Map();
  payments = /* @__PURE__ */ new Map();
  executions = /* @__PURE__ */ new Map();
  refunds = /* @__PURE__ */ new Map();
  async registerPaid(input) {
    const record = IntentExecutionRecordSchema.parse({
      ...input,
      paymentTransaction: canonicalizeTransactionIdentifier(
        input.paymentTransaction
      ),
      executionTransaction: input.executionTransaction ? canonicalizeTransactionIdentifier(input.executionTransaction) : void 0,
      refundTransaction: input.refundTransaction ? canonicalizeTransactionIdentifier(input.refundTransaction) : void 0
    });
    const intentKey = normalizeHash(record.intentHash);
    const paymentKey = transactionIndex(
      record.paymentNetwork,
      record.paymentTransaction
    );
    const paymentOwner = this.payments.get(paymentKey);
    if (paymentOwner) {
      const paymentRecord = this.recordForLocator(paymentOwner);
      if (paymentRecord && samePaymentRegistration(paymentRecord, record)) {
        return paymentRecord.duplicatePayment ? { kind: "duplicate_payment", record: cloneRecord(paymentRecord) } : { kind: "existing", record: cloneRecord(paymentRecord) };
      }
      return {
        kind: "conflict",
        key: "payment_transaction",
        record: paymentRecord ? cloneRecord(paymentRecord) : void 0
      };
    }
    const existing = this.records.get(intentKey);
    if (existing) {
      if (!sameIntentRegistration(existing, record)) {
        return {
          kind: "conflict",
          key: "intent_hash",
          record: cloneRecord(existing)
        };
      }
      return this.insertDuplicatePayment(record, paymentKey);
    }
    const quoteKey = quoteIndex(record);
    const quoteOwner = this.quotes.get(quoteKey);
    if (quoteOwner) {
      const quoteRecord = this.records.get(quoteOwner);
      if (!quoteRecord || !sameQuotedExecution(quoteRecord, record)) {
        return {
          kind: "conflict",
          key: "quote_id",
          record: quoteRecord ? cloneRecord(quoteRecord) : void 0
        };
      }
      return this.insertDuplicatePayment(record, paymentKey);
    }
    const stored = cloneRecord(record);
    this.records.set(intentKey, stored);
    this.quotes.set(quoteKey, intentKey);
    this.payments.set(paymentKey, { kind: "primary", intentKey });
    return { kind: "created", record: cloneRecord(stored) };
  }
  async get(intentHash) {
    const record = this.records.get(normalizeHash(intentHash));
    return record ? cloneRecord(record) : void 0;
  }
  async getPayment(paymentNetwork, paymentTransaction) {
    const locator = this.payments.get(
      transactionIndex(paymentNetwork, paymentTransaction)
    );
    const record = locator ? this.recordForLocator(locator) : void 0;
    return record ? cloneRecord(record) : void 0;
  }
  async transition(input) {
    const locator = this.transitionLocator(input);
    const current = locator ? this.recordForLocator(locator) : void 0;
    if (!locator || !current) return { kind: "not_found" };
    if (normalizeHash(current.intentHash) !== normalizeHash(input.intentHash)) {
      return { kind: "not_found" };
    }
    if (current.revision !== input.expectedRevision) {
      return {
        kind: "conflict",
        key: "revision",
        record: cloneRecord(current)
      };
    }
    if (current.status !== input.from) {
      return {
        kind: "conflict",
        key: "status",
        record: cloneRecord(current)
      };
    }
    if (current.claimToken && current.claimToken !== input.claimToken) {
      return {
        kind: "conflict",
        key: "claim_token",
        record: cloneRecord(current)
      };
    }
    if (!isLegalTransition(input.from, input.to)) {
      return {
        kind: "conflict",
        key: "status",
        record: cloneRecord(current)
      };
    }
    const patch = input.patch ?? {};
    const next = IntentExecutionRecordSchema.parse({
      ...current,
      ...patch,
      executionTransaction: patch.executionTransaction ? canonicalizeTransactionIdentifier(patch.executionTransaction) : current.executionTransaction,
      refundTransaction: patch.refundTransaction ? canonicalizeTransactionIdentifier(patch.refundTransaction) : current.refundTransaction,
      status: input.to,
      revision: current.revision + 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const ownerKey = locatorKey(locator);
    const transactionConflict = this.transactionConflict(ownerKey, current, next);
    if (transactionConflict) {
      return {
        kind: "conflict",
        key: transactionConflict,
        record: cloneRecord(current)
      };
    }
    this.storeForLocator(locator, next);
    if (next.executionNetwork && next.executionTransaction) {
      this.executions.set(
        transactionIndex(next.executionNetwork, next.executionTransaction),
        ownerKey
      );
    }
    if (next.refundNetwork && next.refundTransaction) {
      this.refunds.set(
        transactionIndex(next.refundNetwork, next.refundTransaction),
        ownerKey
      );
    }
    return { kind: "updated", record: cloneRecord(next) };
  }
  transitionLocator(input) {
    const hasPaymentNetwork = typeof input.paymentNetwork === "string";
    const hasPaymentTransaction = typeof input.paymentTransaction === "string";
    if (hasPaymentNetwork !== hasPaymentTransaction) return void 0;
    if (hasPaymentNetwork && hasPaymentTransaction) {
      return this.payments.get(
        transactionIndex(input.paymentNetwork, input.paymentTransaction)
      );
    }
    const intentKey = normalizeHash(input.intentHash);
    return this.records.has(intentKey) ? { kind: "primary", intentKey } : void 0;
  }
  recordForLocator(locator) {
    return locator.kind === "primary" ? this.records.get(locator.intentKey) : this.duplicatePayments.get(locator.paymentKey);
  }
  storeForLocator(locator, record) {
    if (locator.kind === "primary") {
      this.records.set(locator.intentKey, cloneRecord(record));
    } else {
      this.duplicatePayments.set(locator.paymentKey, cloneRecord(record));
    }
  }
  insertDuplicatePayment(record, paymentKey) {
    const duplicate = IntentExecutionRecordSchema.parse({
      ...record,
      revision: 0,
      status: "refund_pending",
      duplicatePayment: true,
      executionNetwork: void 0,
      executionTransaction: void 0,
      refundNetwork: void 0,
      refundTransaction: void 0,
      executionAttempts: 0,
      refundAttempts: 0,
      claimToken: void 0,
      failure: {
        reason: "duplicate_payment",
        message: "An additional settled payment for this quoted execution must be refunded",
        retryable: true
      },
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    this.duplicatePayments.set(paymentKey, cloneRecord(duplicate));
    this.payments.set(paymentKey, { kind: "duplicate", paymentKey });
    return { kind: "duplicate_payment", record: cloneRecord(duplicate) };
  }
  transactionConflict(ownerKey, current, next) {
    if (next.executionNetwork && next.executionTransaction && (next.executionNetwork !== current.executionNetwork || next.executionTransaction !== current.executionTransaction)) {
      const owner = this.executions.get(
        transactionIndex(next.executionNetwork, next.executionTransaction)
      );
      if (owner && owner !== ownerKey) return "execution_transaction";
    }
    if (next.refundNetwork && next.refundTransaction && (next.refundNetwork !== current.refundNetwork || next.refundTransaction !== current.refundTransaction)) {
      const owner = this.refunds.get(
        transactionIndex(next.refundNetwork, next.refundTransaction)
      );
      if (owner && owner !== ownerKey) return "refund_transaction";
    }
    return void 0;
  }
};
var LEGAL_TRANSITIONS = {
  paid: ["execution_claimed"],
  execution_claimed: [
    "execution_submitted",
    "execution_failed",
    "manual_intervention"
  ],
  execution_submitted: [
    "executed",
    "execution_failed",
    "manual_intervention"
  ],
  executed: [],
  execution_failed: ["refund_pending", "manual_intervention"],
  refund_pending: ["refund_claimed", "manual_intervention"],
  refund_claimed: ["refund_submitted", "refund_failed", "manual_intervention"],
  refund_submitted: ["refunded", "refund_failed", "manual_intervention"],
  refunded: [],
  refund_failed: ["refund_claimed", "manual_intervention"],
  manual_intervention: []
};
function isLegalIntentExecutionTransition(from, to) {
  return isLegalTransition(from, to);
}
function isLegalTransition(from, to) {
  return LEGAL_TRANSITIONS[from].includes(to);
}
function sameIntentRegistration(left, right) {
  return normalizeHash(left.intentHash) === normalizeHash(right.intentHash) && left.intentTemplateHash.toLowerCase() === right.intentTemplateHash.toLowerCase() && left.application === right.application && left.gateway.toLowerCase() === right.gateway.toLowerCase() && left.quoteId === right.quoteId && left.paymentRequirementsHash.toLowerCase() === right.paymentRequirementsHash.toLowerCase() && left.paymentScheme === right.paymentScheme && left.paymentNetwork === right.paymentNetwork && left.paymentAsset === right.paymentAsset && left.paymentAmount === right.paymentAmount && left.paymentPayTo.toLowerCase() === right.paymentPayTo.toLowerCase();
}
function sameQuotedExecution(left, right) {
  return left.intentTemplateHash.toLowerCase() === right.intentTemplateHash.toLowerCase() && left.application === right.application && left.gateway.toLowerCase() === right.gateway.toLowerCase() && left.quoteId === right.quoteId;
}
function samePaymentRegistration(left, right) {
  return sameIntentRegistration(left, right) && left.payer.toLowerCase() === right.payer.toLowerCase() && canonicalizeTransactionIdentifier(left.paymentTransaction) === canonicalizeTransactionIdentifier(right.paymentTransaction);
}
function normalizeHash(value) {
  return value.toLowerCase();
}
function quoteIndex(record) {
  return [
    record.application,
    record.gateway.toLowerCase(),
    record.quoteId
  ].join("\0");
}
function transactionIndex(network, transaction) {
  return `${network}\0${canonicalizeTransactionIdentifier(transaction)}`;
}
function locatorKey(locator) {
  return locator.kind === "primary" ? `intent\0${locator.intentKey}` : `payment\0${locator.paymentKey}`;
}
function cloneRecord(record) {
  return structuredClone(record);
}

// src/intents/server/executor.ts
import { randomUUID } from "crypto";
import { getAddress as getAddress5, keccak256 as keccak2563 } from "viem";
var IntentStoreConflictError = class extends Error {
  record;
  constructor(message, record) {
    super(message);
    this.name = "IntentStoreConflictError";
    this.record = record;
  }
};
function createIntentExecutor(config) {
  const claimToken = config.createClaimToken ?? randomUUID;
  const now = config.now ?? (() => Math.floor(Date.now() / 1e3));
  return {
    store: config.store,
    async get(intentHash) {
      return config.store.get(intentHash);
    },
    async getPayment(paymentNetwork, paymentTransaction) {
      return config.store.getPayment(paymentNetwork, paymentTransaction);
    },
    async verify(input) {
      return verifyPaidExecutionIntent({
        ...input,
        expectedDomain: config.domain
      });
    },
    /**
     * Runs every settlement-independent check so a resource server can reject
     * an intent that `execute` would refuse to register — missing, malformed,
     * mismatched, or unsigned — before settling the HyperCore payment and
     * burning the user's funds.
     */
    async verifyBeforeSettlement(input) {
      return verifyPreSettlementExecutionIntent({
        ...input,
        expectedDomain: config.domain
      });
    },
    /**
     * Deadline enforcement is deferred to the state machine rather than
     * pre-registration verification: a payment can settle after the signed
     * deadline lapses, and throwing at that point would leave the settled
     * payment with no durable record and no automated refund. Every other
     * verification failure still throws before registration because a
     * mismatched or unsigned intent has no trustworthy refund address.
     */
    async execute(input) {
      const verified = await verifyPaidExecutionIntent({
        ...input,
        expectedDomain: config.domain,
        enforceDeadline: false
      });
      if (!verified.ok) {
        throw new Error(`${verified.reason}: ${verified.message}`);
      }
      const initial = createPaidRecord(verified, input);
      const registration = await config.store.registerPaid(initial);
      if (registration.kind === "conflict") {
        throw new IntentStoreConflictError(
          `store_conflict: ${registration.key}`,
          registration.record
        );
      }
      let record = registration.record;
      if (registration.kind === "duplicate_payment") {
        if (isTerminalIntentExecutionStatus(record.status)) return record;
        if (record.status === "refund_pending" || record.status === "refund_failed") {
          return runRefund(config, record, claimToken);
        }
        return record;
      }
      if (isTerminalIntentExecutionStatus(record.status)) return record;
      if (record.status !== "paid") return record;
      const executionClaimToken = claimToken();
      const claim = await config.store.transition({
        intentHash: record.intentHash,
        expectedRevision: record.revision,
        from: "paid",
        to: "execution_claimed",
        patch: {
          claimToken: executionClaimToken,
          executionAttempts: record.executionAttempts + 1,
          failure: void 0
        }
      });
      if (claim.kind !== "updated") return recordFromConflict(claim, record);
      record = claim.record;
      const claimedDeadlineFailure = verifyExecutionDeadline(record, now());
      if (claimedDeadlineFailure) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          claimedDeadlineFailure,
          claimToken
        );
      }
      const context = executionContext(record);
      let policy;
      try {
        policy = await config.policy(context);
      } catch {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          safeFailure(
            "policy_denied",
            "Execution policy rejected the intent",
            false
          ),
          claimToken
        );
      }
      if (!hasBooleanDiscriminator(policy, "allowed") || policy.allowed === false) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          safeFailure(
            "policy_denied",
            "Execution policy rejected the intent",
            false
          ),
          claimToken
        );
      }
      const policyFailure = verifyPolicyBinding(record, policy);
      if (policyFailure) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          policyFailure,
          claimToken
        );
      }
      let simulation;
      try {
        simulation = await config.simulate(context, policy);
      } catch {
        simulation = { success: false };
      }
      const simulationFailure = verifySimulation(record, simulation);
      if (simulationFailure || !hasBooleanDiscriminator(simulation, "success") || simulation.success === false) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          simulationFailure ?? safeFailure(
            "simulation_failed",
            "Destination execution simulation failed",
            false
          ),
          claimToken
        );
      }
      const simulatedDeadlineFailure = verifyExecutionDeadline(record, now());
      if (simulatedDeadlineFailure) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          simulatedDeadlineFailure,
          claimToken
        );
      }
      const submitted = await config.store.transition({
        intentHash: record.intentHash,
        expectedRevision: record.revision,
        from: "execution_claimed",
        to: "execution_submitted",
        claimToken: executionClaimToken
      });
      if (submitted.kind !== "updated") {
        return recordFromConflict(submitted, record);
      }
      record = submitted.record;
      const submittedDeadlineFailure = verifyExecutionDeadline(record, now());
      if (submittedDeadlineFailure) {
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          submittedDeadlineFailure,
          claimToken
        );
      }
      let execution;
      try {
        execution = await config.execute(
          executionContext(record),
          policy,
          simulation
        );
      } catch {
        return markManualIntervention(
          config.store,
          record,
          executionClaimToken,
          safeFailure(
            "execution_uncertain",
            "Execution adapter threw after submission began; reconcile before retrying or refunding",
            false
          )
        );
      }
      if (!hasBooleanDiscriminator(execution, "success")) {
        return markManualIntervention(
          config.store,
          record,
          executionClaimToken,
          safeFailure(
            "execution_uncertain",
            "Execution adapter returned an invalid result after submission began",
            false
          )
        );
      }
      if (execution.success === false) {
        if (typeof execution.refundSafe !== "boolean" || Object.prototype.hasOwnProperty.call(
          execution,
          "mayHaveSucceeded"
        ) && typeof execution.mayHaveSucceeded !== "boolean" || execution.mayHaveSucceeded === true || execution.refundSafe === false) {
          return markManualIntervention(
            config.store,
            record,
            executionClaimToken,
            safeFailure(
              "execution_uncertain",
              "Execution outcome may have succeeded; automatic refund is unsafe",
              false
            )
          );
        }
        return failAndRefund(
          config,
          record,
          executionClaimToken,
          safeFailure(
            "execution_failed",
            "Destination execution failed definitively",
            false
          ),
          claimToken
        );
      }
      const expectedExecutionNetwork = `eip155:${record.intent.chainId}`;
      if (execution.confirmed !== true || typeof execution.transaction !== "string" || !execution.transaction.trim() || typeof execution.network !== "string" || !execution.network.trim()) {
        return markManualIntervention(
          config.store,
          record,
          executionClaimToken,
          safeFailure(
            "execution_uncertain",
            "Executor did not return a confirmed receipt on the intended chain",
            false
          )
        );
      }
      const executionTransaction = canonicalizeTransactionIdentifier(
        execution.transaction
      );
      const executionMetadata = parseAdapterMetadata(execution.metadata);
      if (execution.network !== expectedExecutionNetwork) {
        return markManualIntervention(
          config.store,
          record,
          executionClaimToken,
          safeFailure(
            "execution_uncertain",
            "Executor returned a confirmed receipt on the wrong destination network",
            false
          ),
          {
            executionNetwork: execution.network,
            executionTransaction,
            metadata: executionMetadata
          }
        );
      }
      const executed = await config.store.transition({
        intentHash: record.intentHash,
        expectedRevision: record.revision,
        from: "execution_submitted",
        to: "executed",
        claimToken: executionClaimToken,
        patch: {
          claimToken: void 0,
          executionNetwork: execution.network,
          executionTransaction,
          failure: void 0,
          metadata: executionMetadata
        }
      });
      if (executed.kind === "updated") return executed.record;
      return markManualAfterStoreConflict(
        config.store,
        record,
        executionClaimToken,
        executed,
        {
          executionNetwork: execution.network,
          executionTransaction,
          metadata: executionMetadata
        }
      );
    },
    async retryRefund(intentHash) {
      const record = await config.store.get(intentHash);
      if (!record) {
        throw new Error("invalid_state: intent record was not found");
      }
      if (isTerminalIntentExecutionStatus(record.status)) return record;
      if (record.status !== "refund_pending" && record.status !== "refund_failed") {
        return record;
      }
      return runRefund(config, record, claimToken);
    },
    async retryPaymentRefund(paymentNetwork, paymentTransaction) {
      const record = await config.store.getPayment(
        paymentNetwork,
        paymentTransaction
      );
      if (!record) {
        throw new Error("invalid_state: payment record was not found");
      }
      if (isTerminalIntentExecutionStatus(record.status)) return record;
      if (record.status !== "refund_pending" && record.status !== "refund_failed") {
        return record;
      }
      return runRefund(config, record, claimToken);
    },
    async recoverPayment(paymentNetwork, paymentTransaction) {
      const record = await config.store.getPayment(
        paymentNetwork,
        paymentTransaction
      );
      if (!record) {
        throw new Error("invalid_state: payment record was not found");
      }
      if (!record.duplicatePayment) return record;
      if (isTerminalIntentExecutionStatus(record.status)) return record;
      if (record.status === "refund_claimed") {
        const released = await config.store.transition(
          paymentTransition(record, {
            intentHash: record.intentHash,
            expectedRevision: record.revision,
            from: "refund_claimed",
            to: "refund_failed",
            claimToken: record.claimToken,
            patch: {
              claimToken: void 0,
              failure: safeFailure(
                "refund_failed",
                "Refund claim was abandoned before submission and may be retried",
                true
              )
            }
          })
        );
        if (released.kind !== "updated") {
          return recordFromConflict(released, record);
        }
        return runRefund(config, released.record, claimToken);
      }
      if (record.status === "refund_submitted") {
        return markManualIntervention(
          config.store,
          record,
          record.claimToken,
          safeFailure(
            "refund_uncertain",
            "Refund was abandoned after submission began; reconcile before another attempt",
            false
          )
        );
      }
      if (record.status === "refund_pending" || record.status === "refund_failed") {
        return runRefund(config, record, claimToken);
      }
      return record;
    },
    /**
     * Resume an intent abandoned mid-transition, for example by a process
     * crash, using the claim token persisted on the record. Adapters are only
     * invoked after the matching `*_submitted` transition is durably recorded,
     * so pre-submission states refund safely while post-submission states park
     * in `manual_intervention` for reconciliation. Call only when no other
     * executor process can still be driving the intent.
     */
    async recover(intentHash) {
      const record = await config.store.get(intentHash);
      if (!record) {
        throw new Error("invalid_state: intent record was not found");
      }
      if (isTerminalIntentExecutionStatus(record.status)) return record;
      switch (record.status) {
        case "execution_claimed":
          return failAndRefund(
            config,
            record,
            record.claimToken,
            safeFailure(
              "execution_failed",
              "Execution claim was abandoned before destination submission",
              false
            ),
            claimToken
          );
        case "execution_submitted":
          return markManualIntervention(
            config.store,
            record,
            record.claimToken,
            safeFailure(
              "execution_uncertain",
              "Execution was abandoned after submission began; reconcile before retrying or refunding",
              false
            )
          );
        case "execution_failed": {
          const pending = await config.store.transition({
            intentHash: record.intentHash,
            expectedRevision: record.revision,
            from: "execution_failed",
            to: "refund_pending",
            claimToken: record.claimToken,
            patch: { claimToken: void 0 }
          });
          if (pending.kind !== "updated") {
            return recordFromConflict(pending, record);
          }
          return runRefund(config, pending.record, claimToken);
        }
        case "refund_claimed": {
          const released = await config.store.transition({
            intentHash: record.intentHash,
            expectedRevision: record.revision,
            from: "refund_claimed",
            to: "refund_failed",
            claimToken: record.claimToken,
            patch: {
              claimToken: void 0,
              failure: safeFailure(
                "refund_failed",
                "Refund claim was abandoned before submission and may be retried",
                true
              )
            }
          });
          if (released.kind !== "updated") {
            return recordFromConflict(released, record);
          }
          return runRefund(config, released.record, claimToken);
        }
        case "refund_submitted":
          return markManualIntervention(
            config.store,
            record,
            record.claimToken,
            safeFailure(
              "refund_uncertain",
              "Refund was abandoned after submission began; reconcile before another attempt",
              false
            )
          );
        case "refund_pending":
        case "refund_failed":
          return runRefund(config, record, claimToken);
        default:
          return record;
      }
    }
  };
}
function createPaidRecord(verified, input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    version: X402_HL_INTENT_VERSION,
    revision: 0,
    status: "paid",
    intentHash: verified.intentHash,
    intentTemplateHash: verified.intentTemplateHash,
    paymentRequirementsHash: verified.paymentRequirementsHash,
    quoteId: verified.intent.quoteId,
    application: verified.intent.application,
    gateway: verified.intent.gateway,
    payer: verified.payer,
    paymentScheme: input.paymentRequirements.scheme,
    paymentNetwork: verified.settlement.network,
    paymentAsset: input.paymentRequirements.asset,
    paymentAmount: input.paymentRequirements.amount,
    paymentPayTo: input.paymentRequirements.payTo,
    paymentTransaction: canonicalizeTransactionIdentifier(
      verified.settlement.transaction
    ),
    executionAttempts: 0,
    refundAttempts: 0,
    createdAt: now,
    updatedAt: now,
    intent: verified.intent
  };
}
function executionContext(record) {
  return {
    intent: record.intent,
    record,
    idempotencyKey: record.intentHash
  };
}
function hasBooleanDiscriminator(value, key) {
  return value != null && typeof value === "object" && typeof value[key] === "boolean";
}
function verifyPolicyBinding(record, policy) {
  const expectedSelector = record.intent.callData.length >= 10 ? record.intent.callData.slice(0, 10).toLowerCase() : "0x";
  try {
    const matches = policy.chainId === record.intent.chainId && getAddress5(policy.target) === getAddress5(record.intent.target) && policy.callDataHash.toLowerCase() === keccak2563(record.intent.callData).toLowerCase() && policy.selector.toLowerCase() === expectedSelector && policy.value === record.intent.value && getAddress5(policy.recipient) === getAddress5(record.intent.recipient);
    if (matches) return void 0;
  } catch {
  }
  return safeFailure(
    "policy_binding_mismatch",
    "Execution policy did not authorize the exact signed chain, call, value, and recipient",
    false
  );
}
function verifySimulation(record, simulation) {
  if (!hasBooleanDiscriminator(simulation, "success") || simulation.success === false) {
    return safeFailure(
      "simulation_failed",
      "Destination execution simulation failed",
      false
    );
  }
  try {
    const matches = simulation.chainId === record.intent.chainId && getAddress5(simulation.target) === getAddress5(record.intent.target) && simulation.callDataHash.toLowerCase() === keccak2563(record.intent.callData).toLowerCase() && simulation.value === record.intent.value && getAddress5(simulation.recipient) === getAddress5(record.intent.recipient);
    if (!matches) {
      return safeFailure(
        "policy_binding_mismatch",
        "Simulation did not evaluate the exact signed execution",
        false
      );
    }
    const gasCost = DecimalIntegerStringSchema.safeParse(simulation.gasCost);
    if (!gasCost.success) {
      return safeFailure(
        "simulation_failed",
        "Simulation returned invalid constraint evidence",
        false
      );
    }
    if (BigInt(gasCost.data) > BigInt(record.intent.maxGasCost)) {
      return safeFailure(
        "gas_cost_exceeded",
        "Simulated gas cost exceeds the signed maximum",
        false
      );
    }
    if (!Number.isInteger(simulation.slippageBps) || simulation.slippageBps < 0 || simulation.slippageBps > record.intent.maxSlippageBps) {
      return safeFailure(
        "slippage_exceeded",
        "Simulated slippage exceeds the signed maximum",
        false
      );
    }
  } catch {
    return safeFailure(
      "simulation_failed",
      "Simulation returned invalid constraint evidence",
      false
    );
  }
  return void 0;
}
function verifyExecutionDeadline(record, now) {
  if (Number.isInteger(now) && record.intent.deadline >= now) return void 0;
  return safeFailure(
    "execution_intent_expired",
    "Execution intent expired before destination submission",
    false
  );
}
async function failAndRefund(config, record, executionClaimToken, failure2, createClaimToken) {
  const failed = await config.store.transition({
    intentHash: record.intentHash,
    expectedRevision: record.revision,
    from: record.status,
    to: "execution_failed",
    claimToken: executionClaimToken,
    patch: { failure: failure2 }
  });
  if (failed.kind !== "updated") return recordFromConflict(failed, record);
  const pending = await config.store.transition({
    intentHash: failed.record.intentHash,
    expectedRevision: failed.record.revision,
    from: "execution_failed",
    to: "refund_pending",
    claimToken: executionClaimToken,
    patch: { claimToken: void 0 }
  });
  if (pending.kind !== "updated") {
    return recordFromConflict(pending, failed.record);
  }
  return runRefund(config, pending.record, createClaimToken);
}
async function runRefund(config, input, createClaimToken) {
  const refundClaimToken = createClaimToken();
  const claim = await config.store.transition(
    paymentTransition(input, {
      intentHash: input.intentHash,
      expectedRevision: input.revision,
      from: input.status,
      to: "refund_claimed",
      patch: {
        claimToken: refundClaimToken,
        refundAttempts: input.refundAttempts + 1
      }
    })
  );
  if (claim.kind !== "updated") return recordFromConflict(claim, input);
  const submitted = await config.store.transition(
    paymentTransition(claim.record, {
      intentHash: claim.record.intentHash,
      expectedRevision: claim.record.revision,
      from: "refund_claimed",
      to: "refund_submitted",
      claimToken: refundClaimToken
    })
  );
  if (submitted.kind !== "updated") {
    return recordFromConflict(submitted, claim.record);
  }
  const record = submitted.record;
  let refund;
  try {
    refund = await config.refund({
      intent: record.intent,
      record,
      idempotencyKey: refundIdempotencyKey(record)
    });
  } catch {
    return markManualIntervention(
      config.store,
      record,
      refundClaimToken,
      safeFailure(
        "refund_uncertain",
        "Refund adapter threw after submission began; reconcile before retrying",
        false
      )
    );
  }
  if (!hasBooleanDiscriminator(refund, "success")) {
    return markManualIntervention(
      config.store,
      record,
      refundClaimToken,
      safeFailure(
        "refund_uncertain",
        "Refund adapter returned an invalid result after submission began",
        false
      )
    );
  }
  if (refund.success === true) {
    if (refund.confirmed !== true || typeof refund.transaction !== "string" || !refund.transaction.trim() || typeof refund.network !== "string" || !refund.network.trim()) {
      return markManualIntervention(
        config.store,
        record,
        refundClaimToken,
        safeFailure(
          "refund_uncertain",
          "Refund adapter did not return a confirmed transaction",
          false
        )
      );
    }
    const refundTransaction = canonicalizeTransactionIdentifier(
      refund.transaction
    );
    const refundMetadata = parseAdapterMetadata(refund.metadata);
    if (refund.network !== record.paymentNetwork) {
      return markManualIntervention(
        config.store,
        record,
        refundClaimToken,
        safeFailure(
          "refund_uncertain",
          "Refund adapter returned a confirmed transaction on the wrong payment network",
          false
        ),
        {
          refundNetwork: refund.network,
          refundTransaction,
          metadata: refundMetadata
        }
      );
    }
    const refunded = await config.store.transition(
      paymentTransition(record, {
        intentHash: record.intentHash,
        expectedRevision: record.revision,
        from: "refund_submitted",
        to: "refunded",
        claimToken: refundClaimToken,
        patch: {
          claimToken: void 0,
          refundNetwork: refund.network,
          refundTransaction,
          failure: void 0,
          metadata: refundMetadata
        }
      })
    );
    if (refunded.kind === "updated") return refunded.record;
    return markManualAfterStoreConflict(
      config.store,
      record,
      refundClaimToken,
      refunded,
      {
        refundNetwork: refund.network,
        refundTransaction,
        metadata: refundMetadata
      }
    );
  }
  if (typeof refund.retryable !== "boolean" || Object.prototype.hasOwnProperty.call(refund, "mayHaveSucceeded") && typeof refund.mayHaveSucceeded !== "boolean" || refund.mayHaveSucceeded === true) {
    return markManualIntervention(
      config.store,
      record,
      refundClaimToken,
      safeFailure(
        "refund_uncertain",
        "Refund may have succeeded; reconcile before another attempt",
        false
      )
    );
  }
  if (!refund.retryable) {
    return markManualIntervention(
      config.store,
      record,
      refundClaimToken,
      safeFailure(
        "refund_failed",
        "Refund failed and requires manual intervention",
        false
      )
    );
  }
  const failed = await config.store.transition(
    paymentTransition(record, {
      intentHash: record.intentHash,
      expectedRevision: record.revision,
      from: "refund_submitted",
      to: "refund_failed",
      claimToken: refundClaimToken,
      patch: {
        claimToken: void 0,
        failure: safeFailure(
          "refund_failed",
          "Refund failed and may be retried explicitly",
          true
        )
      }
    })
  );
  return failed.kind === "updated" ? failed.record : recordFromConflict(failed, record);
}
async function markManualAfterStoreConflict(store, record, claimToken, conflict, evidence) {
  if (conflict.kind === "conflict" && conflict.record.revision !== record.revision) {
    return conflict.record;
  }
  return markManualIntervention(
    store,
    record,
    claimToken,
    safeFailure(
      "store_conflict",
      "Durable store rejected transaction evidence; reconcile manually",
      false
    ),
    evidence
  );
}
async function markManualIntervention(store, record, claimToken, failure2, evidence) {
  const manual = await store.transition(
    paymentTransition(record, {
      intentHash: record.intentHash,
      expectedRevision: record.revision,
      from: record.status,
      to: "manual_intervention",
      claimToken,
      patch: {
        ...evidence,
        claimToken: void 0,
        failure: failure2
      }
    })
  );
  if (manual.kind === "updated") return manual.record;
  if (evidence && manual.kind === "conflict" && manual.record.revision === record.revision) {
    return markManualIntervention(store, record, claimToken, failure2);
  }
  return recordFromConflict(manual, record);
}
function paymentTransition(record, transition) {
  return record.duplicatePayment ? {
    ...transition,
    paymentNetwork: record.paymentNetwork,
    paymentTransaction: record.paymentTransaction
  } : transition;
}
function refundIdempotencyKey(record) {
  return record.duplicatePayment ? `${record.intentHash}:refund:${record.paymentNetwork}:${canonicalizeTransactionIdentifier(record.paymentTransaction)}` : `${record.intentHash}:refund`;
}
function parseAdapterMetadata(metadata) {
  if (metadata === void 0) return void 0;
  try {
    const parsed = JsonRecordSchema.safeParse(metadata);
    return parsed.success ? parsed.data : void 0;
  } catch {
    return void 0;
  }
}
function safeFailure(reason, message, retryable) {
  return { reason, message, retryable };
}
function recordFromConflict(result, fallback) {
  return result.kind === "conflict" ? result.record : fallback;
}
export {
  Bytes32Schema,
  DecimalIntegerStringSchema,
  EvmAddressSchema,
  ExecutionIntentDomainSchema,
  HexSchema,
  HyperEvmExecutionIntentSchema,
  InMemoryIntentExecutionStore,
  IntentApplicationSchema,
  IntentDeclarationSchema,
  IntentExecutionModeSchema,
  IntentExecutionReceiptSchema,
  IntentExecutionRecordSchema,
  IntentExecutionStatusSchema,
  IntentFailureReasonSchema,
  IntentFailureSchema,
  IntentPaymentExtraSchema,
  IntentStoreConflictError,
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
  assertPaidExecutionIntent,
  attachSignedExecutionIntent,
  buildExecutionIntentTypedData,
  canonicalizePaymentRequirements,
  createIntentDeclaration,
  createIntentExecutor,
  createIntentPaymentExtra,
  createIntentQuote,
  getIntentSignerAddress,
  hashExecutionIntent,
  hashExecutionIntentTemplate,
  hashIntentMetadata,
  hashIntentText,
  hashPaymentRequirements,
  isLegalIntentExecutionTransition,
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
  verifyIntentPaymentExtra,
  verifyPaidExecutionIntent,
  verifyPreSettlementExecutionIntent
};
//# sourceMappingURL=index.js.map