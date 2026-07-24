import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import {
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
  const signedIntent = paymentPayload.extensions?.[X402_HL_INTENTS_EXTENSION];
  if (signedIntent == null) return undefined;
  return SignedHyperEvmExecutionIntentSchema.parse(signedIntent);
}
