import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import { z } from "zod";
import {
  Bytes32Schema,
  HyperEvmExecutionIntentInput,
  IntentDeclaration,
  IntentDeclarationSchema,
  SignedHyperEvmExecutionIntent,
  SignedHyperEvmExecutionIntentSchema,
  X402_HL_INTENTS_EXTENSION,
  X402_HL_INTENT_VERSION,
} from "./types";
import {
  hashExecutionIntentTemplate,
  normalizeExecutionIntent,
} from "./typed-data";

// @x402/core preserves the server declaration when it deep-merges the
// client's signed extension into the payment payload. Admit only those known
// declaration echo fields, validate their binding below, and continue to
// reject every other unsigned envelope field.
const PaymentSignedExecutionIntentSchema =
  SignedHyperEvmExecutionIntentSchema.extend({
    version: z.literal(X402_HL_INTENT_VERSION).optional(),
    required: z.boolean().optional(),
    mode: z.literal("brokered").optional(),
    intentTemplateHash: Bytes32Schema.optional(),
    quoteId: z.string().optional(),
  }).strict();

export interface IntentDeclarationOptions {
  required?: boolean;
}

export function createIntentDeclaration(
  input: HyperEvmExecutionIntentInput,
  options: IntentDeclarationOptions = {},
): IntentDeclaration {
  const intent = normalizeExecutionIntent(input);
  return IntentDeclarationSchema.parse({
    version: X402_HL_INTENT_VERSION,
    required: options.required ?? true,
    mode: "brokered",
    intent,
    intentTemplateHash: hashExecutionIntentTemplate(intent),
    quoteId: intent.quoteId,
  });
}

export function readIntentDeclaration(
  paymentRequired: PaymentRequired,
): IntentDeclaration | undefined {
  const declaration = paymentRequired.extensions?.[X402_HL_INTENTS_EXTENSION];
  if (declaration == null) return undefined;
  const parsed = IntentDeclarationSchema.parse(declaration);
  const expectedTemplateHash = hashExecutionIntentTemplate(parsed.intent);
  if (
    parsed.intentTemplateHash.toLowerCase() !== expectedTemplateHash.toLowerCase()
  ) {
    throw new Error("Intent declaration template hash is invalid");
  }
  if (parsed.quoteId !== parsed.intent.quoteId) {
    throw new Error("Intent declaration quote id is invalid");
  }
  return parsed;
}

export function attachSignedExecutionIntent(
  paymentPayload: PaymentPayload,
  signedIntent: SignedHyperEvmExecutionIntent,
): PaymentPayload {
  return {
    ...paymentPayload,
    extensions: {
      ...(paymentPayload.extensions ?? {}),
      [X402_HL_INTENTS_EXTENSION]:
        SignedHyperEvmExecutionIntentSchema.parse(signedIntent),
    },
  };
}

export function readSignedExecutionIntent(
  paymentPayload: PaymentPayload,
): SignedHyperEvmExecutionIntent | undefined {
  const extension = paymentPayload.extensions?.[X402_HL_INTENTS_EXTENSION];
  if (extension == null) return undefined;

  const declarationOnly = IntentDeclarationSchema.strict().safeParse(extension);
  if (declarationOnly.success && !declarationOnly.data.required) {
    const declaration = declarationOnly.data;
    if (
      declaration.intentTemplateHash.toLowerCase() !==
      hashExecutionIntentTemplate(declaration.intent).toLowerCase()
    ) {
      throw new Error("Intent declaration template hash is invalid");
    }
    if (declaration.quoteId !== declaration.intent.quoteId) {
      throw new Error("Intent declaration quote id is invalid");
    }
    return undefined;
  }

  const parsed = PaymentSignedExecutionIntentSchema.parse(extension);
  // Validate the complete wire intent before normalization can supply
  // construction defaults. Normalize the original object so Zod record parsing
  // cannot hide an own `__proto__` metadata key from the canonicality check.
  const intent = normalizeExecutionIntent(
    (extension as { intent: HyperEvmExecutionIntentInput }).intent,
  );
  if (
    parsed.intentTemplateHash != null &&
    parsed.intentTemplateHash.toLowerCase() !==
      hashExecutionIntentTemplate(intent).toLowerCase()
  ) {
    throw new Error("Intent declaration template hash is invalid");
  }
  if (parsed.quoteId != null && parsed.quoteId !== intent.quoteId) {
    throw new Error("Intent declaration quote id is invalid");
  }
  return SignedHyperEvmExecutionIntentSchema.parse({
    intent,
    paymentRequirementsHash: parsed.paymentRequirementsHash,
    intentHash: parsed.intentHash,
    signature: parsed.signature,
    signer: parsed.signer,
  });
}
