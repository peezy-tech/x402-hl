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
  recipient: EvmAddressSchema,
  refundAddress: EvmAddressSchema,
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
import { getAddress, hashTypedData, isHex, keccak256, toBytes } from "viem";
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
  return keccak256(toBytes(stableJson(metadata)));
}
function hashIntentText(value) {
  return keccak256(toBytes(value));
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
import { getAddress as getAddress2, keccak256 as keccak2562, toBytes as toBytes2 } from "viem";
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
  return keccak2562(toBytes2(stableJson(canonicalizePaymentRequirements(requirements))));
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

// src/intents/server/quote.ts
function createIntentQuote(input) {
  const intent = normalizeExecutionIntent({
    ...input.intent,
    quoteId: input.intent.quoteId ?? input.id
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
import { getAddress as getAddress4 } from "viem";
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
      "Payment payload accepted different requirements than the settled payment"
    );
  }
  const rawSignedIntent = input.paymentPayload.extensions?.["x402-hl/intents"];
  if (rawSignedIntent == null) {
    return failure(
      "missing_execution_intent",
      "Payment payload does not include an x402-hl execution intent"
    );
  }
  const parsedSignedIntent = SignedHyperEvmExecutionIntentSchema.safeParse(
    rawSignedIntent
  );
  if (!parsedSignedIntent.success) {
    return failure(
      "malformed_extension_payload",
      "Payment payload contains a malformed x402-hl execution intent"
    );
  }
  const signedIntent = parsedSignedIntent.data;
  const intent = signedIntent.intent;
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
  const intentTemplateHash = hashExecutionIntentTemplate(intent);
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
  if (intent.deadline < now) {
    return failure(
      "execution_intent_expired",
      "Execution intent deadline has passed"
    );
  }
  const expectedHash = hashExecutionIntent(intent, {
    paymentRequirementsHash
  });
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
  if (input.requireSamePayer !== false && payer !== getAddress4(signature.signer)) {
    return failure(
      "execution_intent_payer_mismatch",
      "Execution intent signer does not match the settled Hyperliquid payer"
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
  if (!settlement.payer?.trim()) {
    return failure(
      "missing_settled_payer",
      "Successful settlement must identify the payer"
    );
  }
  if (!settlement.transaction?.trim()) {
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

// src/intents/server/store.ts
var IntentExecutionRecordSchema = IntentExecutionReceiptSchema.extend({
  intent: HyperEvmExecutionIntentSchema
});
var InMemoryIntentExecutionStore = class {
  records = /* @__PURE__ */ new Map();
  quotes = /* @__PURE__ */ new Map();
  payments = /* @__PURE__ */ new Map();
  executions = /* @__PURE__ */ new Map();
  refunds = /* @__PURE__ */ new Map();
  async registerPaid(input) {
    const record = IntentExecutionRecordSchema.parse(input);
    const intentKey = normalizeHash(record.intentHash);
    const existing = this.records.get(intentKey);
    if (existing) {
      return sameRegistration(existing, record) ? { kind: "existing", record: cloneRecord(existing) } : {
        kind: "conflict",
        key: "intent_hash",
        record: cloneRecord(existing)
      };
    }
    const quoteKey = quoteIndex(record);
    const quoteOwner = this.quotes.get(quoteKey);
    if (quoteOwner) {
      return {
        kind: "conflict",
        key: "quote_id",
        record: cloneRecord(this.records.get(quoteOwner))
      };
    }
    const paymentKey = transactionIndex(
      record.paymentNetwork,
      record.paymentTransaction
    );
    const paymentOwner = this.payments.get(paymentKey);
    if (paymentOwner) {
      return {
        kind: "conflict",
        key: "payment_transaction",
        record: cloneRecord(this.records.get(paymentOwner))
      };
    }
    const stored = cloneRecord(record);
    this.records.set(intentKey, stored);
    this.quotes.set(quoteKey, intentKey);
    this.payments.set(paymentKey, intentKey);
    return { kind: "created", record: cloneRecord(stored) };
  }
  async get(intentHash) {
    const record = this.records.get(normalizeHash(intentHash));
    return record ? cloneRecord(record) : void 0;
  }
  async transition(input) {
    const intentKey = normalizeHash(input.intentHash);
    const current = this.records.get(intentKey);
    if (!current) return { kind: "not_found" };
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
    const next = IntentExecutionRecordSchema.parse({
      ...current,
      ...input.patch ?? {},
      status: input.to,
      revision: current.revision + 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const transactionConflict = this.transactionConflict(intentKey, current, next);
    if (transactionConflict) {
      return {
        kind: "conflict",
        key: transactionConflict,
        record: cloneRecord(current)
      };
    }
    this.records.set(intentKey, cloneRecord(next));
    if (next.executionNetwork && next.executionTransaction) {
      this.executions.set(
        transactionIndex(next.executionNetwork, next.executionTransaction),
        intentKey
      );
    }
    if (next.refundNetwork && next.refundTransaction) {
      this.refunds.set(
        transactionIndex(next.refundNetwork, next.refundTransaction),
        intentKey
      );
    }
    return { kind: "updated", record: cloneRecord(next) };
  }
  transactionConflict(intentKey, current, next) {
    if (next.executionNetwork && next.executionTransaction && (next.executionNetwork !== current.executionNetwork || next.executionTransaction !== current.executionTransaction)) {
      const owner = this.executions.get(
        transactionIndex(next.executionNetwork, next.executionTransaction)
      );
      if (owner && owner !== intentKey) return "execution_transaction";
    }
    if (next.refundNetwork && next.refundTransaction && (next.refundNetwork !== current.refundNetwork || next.refundTransaction !== current.refundTransaction)) {
      const owner = this.refunds.get(
        transactionIndex(next.refundNetwork, next.refundTransaction)
      );
      if (owner && owner !== intentKey) return "refund_transaction";
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
function sameRegistration(left, right) {
  return normalizeHash(left.intentHash) === normalizeHash(right.intentHash) && left.application === right.application && left.gateway.toLowerCase() === right.gateway.toLowerCase() && left.quoteId === right.quoteId && left.paymentRequirementsHash.toLowerCase() === right.paymentRequirementsHash.toLowerCase() && left.paymentNetwork === right.paymentNetwork && left.paymentTransaction.toLowerCase() === right.paymentTransaction.toLowerCase();
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
  return `${network}\0${transaction.toLowerCase()}`;
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
  return {
    store: config.store,
    async get(intentHash) {
      return config.store.get(intentHash);
    },
    async verify(input) {
      return verifyPaidExecutionIntent({
        ...input,
        expectedDomain: config.domain
      });
    },
    async execute(input) {
      const verified = await verifyPaidExecutionIntent({
        ...input,
        expectedDomain: config.domain
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
      if (!policy.allowed) {
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
      if (simulationFailure || !simulation.success) {
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
      if (!execution.success) {
        if (execution.mayHaveSucceeded || !execution.refundSafe) {
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
      if (execution.confirmed !== true || !execution.transaction.trim() || execution.network !== expectedExecutionNetwork) {
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
      const executed = await config.store.transition({
        intentHash: record.intentHash,
        expectedRevision: record.revision,
        from: "execution_submitted",
        to: "executed",
        claimToken: executionClaimToken,
        patch: {
          claimToken: void 0,
          executionNetwork: execution.network,
          executionTransaction: execution.transaction,
          failure: void 0,
          metadata: execution.metadata
        }
      });
      if (executed.kind === "updated") return executed.record;
      return markManualAfterStoreConflict(
        config.store,
        record,
        executionClaimToken,
        executed
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
    paymentTransaction: verified.settlement.transaction,
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
  if (!simulation.success) {
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
    if (BigInt(simulation.gasCost) > BigInt(record.intent.maxGasCost)) {
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
  const claim = await config.store.transition({
    intentHash: input.intentHash,
    expectedRevision: input.revision,
    from: input.status,
    to: "refund_claimed",
    patch: {
      claimToken: refundClaimToken,
      refundAttempts: input.refundAttempts + 1
    }
  });
  if (claim.kind !== "updated") return recordFromConflict(claim, input);
  const submitted = await config.store.transition({
    intentHash: claim.record.intentHash,
    expectedRevision: claim.record.revision,
    from: "refund_claimed",
    to: "refund_submitted",
    claimToken: refundClaimToken
  });
  if (submitted.kind !== "updated") {
    return recordFromConflict(submitted, claim.record);
  }
  const record = submitted.record;
  let refund;
  try {
    refund = await config.refund({
      intent: record.intent,
      record,
      idempotencyKey: `${record.intentHash}:refund`
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
  if (refund.success) {
    if (refund.confirmed !== true || !refund.transaction.trim() || !refund.network.trim()) {
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
    const refunded = await config.store.transition({
      intentHash: record.intentHash,
      expectedRevision: record.revision,
      from: "refund_submitted",
      to: "refunded",
      claimToken: refundClaimToken,
      patch: {
        claimToken: void 0,
        refundNetwork: refund.network,
        refundTransaction: refund.transaction,
        failure: void 0,
        metadata: refund.metadata
      }
    });
    if (refunded.kind === "updated") return refunded.record;
    return markManualAfterStoreConflict(
      config.store,
      record,
      refundClaimToken,
      refunded
    );
  }
  if (refund.mayHaveSucceeded) {
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
  const failed = await config.store.transition({
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
  });
  return failed.kind === "updated" ? failed.record : recordFromConflict(failed, record);
}
async function markManualAfterStoreConflict(store, record, claimToken, conflict) {
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
    )
  );
}
async function markManualIntervention(store, record, claimToken, failure2) {
  const manual = await store.transition({
    intentHash: record.intentHash,
    expectedRevision: record.revision,
    from: record.status,
    to: "manual_intervention",
    claimToken,
    patch: {
      claimToken: void 0,
      failure: failure2
    }
  });
  return manual.kind === "updated" ? manual.record : recordFromConflict(manual, record);
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
  verifyPaidExecutionIntent
};
//# sourceMappingURL=index.js.map