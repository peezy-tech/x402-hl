// src/intents/types.ts
import { z } from "zod";
var X402_HL_INTENTS_EXTENSION = "x402-hl/intents";
var X402_HL_INTENTS_EXTRA_KEY = "x402HlIntent";
var X402_HL_INTENT_VERSION = 1;
var X402_HL_INTENT_DOMAIN_NAME = "x402-hl Intents";
var X402_HL_INTENT_DOMAIN_VERSION = "1";
var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
var ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
var HexRegex = /^0x(?:[0-9a-fA-F]{2})*$/;
var Bytes32Regex = /^0x[0-9a-fA-F]{64}$/;
var EvmAddressRegex = /^0x[0-9a-fA-F]{40}$/;
var DecimalIntegerRegex = /^(0|[1-9]\d*)$/;
var HexSchema = z.string().regex(HexRegex);
var Bytes32Schema = z.string().regex(Bytes32Regex);
var EvmAddressSchema = z.string().regex(EvmAddressRegex);
var DecimalIntegerStringSchema = z.string().regex(DecimalIntegerRegex);
var JsonRecordSchema = z.record(z.unknown());
var IntentExecutionModeSchema = z.enum([
  "brokered",
  "contract",
  "smart-account"
]);
var HyperEvmExecutionIntentSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
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
  nonce: z.string().min(1),
  quoteId: z.string().min(1),
  metadataHash: Bytes32Schema,
  metadata: JsonRecordSchema.optional()
});
var SignedHyperEvmExecutionIntentSchema = z.object({
  intent: HyperEvmExecutionIntentSchema,
  intentHash: Bytes32Schema,
  signature: HexSchema,
  signer: EvmAddressSchema.optional()
});
var IntentDeclarationSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  required: z.boolean(),
  mode: IntentExecutionModeSchema.default("brokered"),
  intent: HyperEvmExecutionIntentSchema,
  intentHash: Bytes32Schema,
  quoteId: z.string().min(1),
  expiresAt: z.number().int().positive().optional()
});
var IntentPaymentExtraSchema = z.object({
  version: z.literal(X402_HL_INTENT_VERSION),
  mode: IntentExecutionModeSchema.default("brokered"),
  intentHash: Bytes32Schema,
  quoteId: z.string().min(1),
  chainId: z.number().int().positive(),
  target: EvmAddressSchema,
  deadline: z.number().int().positive()
});
var IntentExecutionStatusSchema = z.enum([
  "quoted",
  "paid",
  "executing",
  "executed",
  "failed",
  "refunded"
]);
var IntentExecutionReceiptSchema = z.object({
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
  metadata: JsonRecordSchema.optional()
});

// src/intents/json.ts
function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}
function stableJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (!isPlainObject(value)) {
    return JSON.stringify(value);
  }
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== void 0).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`).join(",")}}`;
}

// src/intents/typed-data.ts
import { hashTypedData, isHex, keccak256, toBytes } from "viem";
var X402_HL_INTENT_PRIMARY_TYPE = "X402HyperEvmIntent";
var X402_HL_INTENT_TYPES = {
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
    { name: "metadataHash", type: "bytes32" }
  ]
};
function normalizeExecutionIntent(input) {
  const metadataHash = input.metadataHash ?? hashIntentMetadata(input.metadata);
  const intent = {
    ...input,
    version: X402_HL_INTENT_VERSION,
    callData: input.callData ?? "0x",
    value: input.value ?? "0",
    recipient: input.recipient ?? input.user,
    refundAddress: input.refundAddress ?? input.recipient ?? input.user,
    maxGasCost: input.maxGasCost ?? "0",
    maxSlippageBps: input.maxSlippageBps ?? 0,
    quoteId: input.quoteId ?? input.nonce,
    metadataHash
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
function buildExecutionIntentTypedData(input, options = {}) {
  const intent = normalizeExecutionIntent(input);
  const domain = {
    name: options.domainName ?? X402_HL_INTENT_DOMAIN_NAME,
    version: options.domainVersion ?? X402_HL_INTENT_DOMAIN_VERSION,
    chainId: intent.chainId
  };
  if (options.verifyingContract) {
    domain.verifyingContract = options.verifyingContract;
  }
  return {
    domain,
    types: X402_HL_INTENT_TYPES,
    primaryType: X402_HL_INTENT_PRIMARY_TYPE,
    message: {
      user: intent.user,
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
      metadataHash: intent.metadataHash
    }
  };
}
function hashExecutionIntent(input, options = {}) {
  return hashTypedData(buildExecutionIntentTypedData(input, options));
}

// src/intents/signature.ts
import { getAddress, recoverTypedDataAddress } from "viem";
function getIntentSignerAddress(signer) {
  const account = signer.account;
  const address = signer.address ?? (typeof account === "string" ? account : account?.address);
  if (!address) {
    throw new Error("Intent signer is missing an EVM address");
  }
  return getAddress(address);
}
async function signExecutionIntent(input, signer, options = {}) {
  const signerAddress = getIntentSignerAddress(signer);
  const intent = normalizeExecutionIntent({
    ...input,
    user: input.user ?? signerAddress
  });
  const typedData = buildExecutionIntentTypedData(intent, options);
  const signature = await signTypedDataWithSigner(signer, typedData);
  const signed = {
    intent,
    intentHash: hashExecutionIntent(intent, options),
    signature,
    signer: signerAddress
  };
  return SignedHyperEvmExecutionIntentSchema.parse(signed);
}
async function recoverExecutionIntentSigner(signedIntent, options = {}) {
  const parsed = SignedHyperEvmExecutionIntentSchema.parse(signedIntent);
  const recovered = await recoverTypedDataAddress({
    ...buildExecutionIntentTypedData(parsed.intent, options),
    signature: parsed.signature
  });
  return getAddress(recovered);
}
async function verifyExecutionIntentSignature(signedIntent, options = {}) {
  const parsed = SignedHyperEvmExecutionIntentSchema.parse(signedIntent);
  const expectedHash = hashExecutionIntent(parsed.intent, options);
  const signer = await recoverExecutionIntentSigner(parsed, options);
  const valid = expectedHash.toLowerCase() === parsed.intentHash.toLowerCase() && signer.toLowerCase() === parsed.intent.user.toLowerCase();
  return { valid, signer, intentHash: expectedHash };
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
    mode: options.mode ?? "brokered",
    intent,
    intentHash: hashExecutionIntent(intent, options),
    quoteId: intent.quoteId,
    expiresAt: options.expiresAt
  });
}
function readIntentDeclaration(paymentRequired) {
  const declaration = paymentRequired.extensions?.[X402_HL_INTENTS_EXTENSION];
  if (declaration == null) return void 0;
  return IntentDeclarationSchema.parse(declaration);
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
  HexSchema,
  HyperEvmExecutionIntentSchema,
  IntentDeclarationSchema,
  IntentExecutionModeSchema,
  IntentExecutionReceiptSchema,
  IntentExecutionStatusSchema,
  IntentPaymentExtraSchema,
  JsonRecordSchema,
  SignedHyperEvmExecutionIntentSchema,
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
  createIntentDeclaration,
  getIntentSignerAddress,
  hashExecutionIntent,
  hashIntentMetadata,
  hashIntentText,
  normalizeBytes32,
  normalizeExecutionIntent,
  readIntentDeclaration,
  readSignedExecutionIntent,
  recoverExecutionIntentSigner,
  signExecutionIntent,
  stableJson,
  verifyExecutionIntentSignature
};
//# sourceMappingURL=index.js.map